import { ObjectId } from 'mongodb';
import { hasTrainingAccess, trainingError } from './training.js';

export function createTrainingDatabase(getDb, transaction, resolveAccess) {
  const collection = name => getDb().collection(name);
  let indexes;
  async function ensureIndexes() {
    indexes ??= Promise.all([
      collection('entrenadores').createIndex({ usuarioId: 1 }, { unique: true }),
      collection('entrenadores').createIndex({ disponible: 1, _id: 1 }),
      collection('horarios').createIndex({ entrenadorId: 1, inicio: 1 }, { unique: true }),
      collection('horarios').createIndex({ estado: 1, _id: 1 }),
      collection('reservas').createIndex({ userId: 1, clave: 1 }, { unique: true }),
      collection('reservas').createIndex({ horarioId: 1 }, { unique: true, partialFilterExpression: { estado: 'confirmada' } }),
      collection('reservas').createIndex({ userId: 1, inicio: 1 }, { unique: true, partialFilterExpression: { estado: 'confirmada' } }),
      collection('reservas').createIndex({ entrenadorId: 1, _id: 1 }),
      collection('conversaciones').createIndex({ userId: 1, entrenadorId: 1 }, { unique: true }),
      collection('mensajes').createIndex({ conversacionId: 1, autorId: 1, clave: 1 }, { unique: true }),
      collection('mensajes').createIndex({ conversacionId: 1, _id: 1 }),
    ]).catch(error => { indexes = undefined; throw error; });
    await indexes;
  }
  const cursor = despues => despues ? { _id: { $gt: new ObjectId(despues) } } : {};
  const list = (name, filter, limit) => collection(name).find(filter).sort({ _id: 1 }).limit(limit).toArray();
  async function premium(userId, instant, session, end) {
    const membership = await resolveAccess(userId, instant, { session, lock: Boolean(session) });
    if (!hasTrainingAccess(membership, instant) || end && end > membership.fin) throw trainingError(403, 'Necesitas Premium vigente durante toda la cita o para usar la conversación.');
    return membership;
  }
  async function enabledTrainer(id, session, lock = false) {
    const filter = { _id: new ObjectId(id), disponible: true };
    const profile = lock
      ? await collection('entrenadores').findOneAndUpdate(filter, { $inc: { agendaVersion: 1 } }, { session, returnDocument: 'after' })
      : await collection('entrenadores').findOne(filter, { session });
    if (!profile) throw trainingError(409, 'El entrenador no está disponible. Actualiza el catálogo.');
    return profile;
  }
  function sameBooking(booking, horarioId) {
    if (booking.horarioId !== horarioId) throw trainingError(409, 'La clave de este intento pertenece a otra reserva. Consulta Mis reservas antes de continuar.');
    return { booking, created: false };
  }
  async function conversationAccess(id, actorId, now, session, lock = false) {
    const conversation = await collection('conversaciones').findOne({ _id: new ObjectId(id) }, { session });
    if (!conversation) throw trainingError(404, 'No existe esa conversación en tu cuenta.');
    const profile = await collection('entrenadores').findOne({ _id: new ObjectId(conversation.entrenadorId) }, { session });
    if (!profile || actorId !== conversation.userId && actorId !== profile.usuarioId) throw trainingError(404, 'No existe esa conversación en tu cuenta.');
    await enabledTrainer(conversation.entrenadorId, session, lock);
    const membership = await premium(conversation.userId, now(), session);
    return { conversation, membership, autor: actorId === conversation.userId ? 'miembro' : 'entrenador' };
  }
  return {
    async listTrainers({ disponible, despues, limit }) {
      return list('entrenadores', { ...cursor(despues), ...(disponible === undefined ? {} : { disponible }) }, limit);
    },
    async findTrainerForUser(usuarioId) { return collection('entrenadores').findOne({ usuarioId, disponible: true }); },
    async createTrainer(input, actor, instant) {
      await ensureIndexes();
      const { correo, ...fields } = input;
      try {
        return await transaction(async session => {
          const user = await collection('usuarios').findOne({ correo }, { session });
          if (!user) throw trainingError(404, 'La cuenta del entrenador no existe. Debe registrarse antes de vincular su perfil.');
          const profile = { _id: new ObjectId(), ...fields, usuarioId: String(user._id), version: 1, agendaVersion: 0, creadaEn: instant, actualizadaEn: instant, creadaPor: actor, actualizadaPor: actor };
          await collection('entrenadores').insertOne(profile, { session }); return profile;
        });
      } catch (error) { if (error.code === 11000) throw trainingError(409, 'Esa cuenta ya tiene un perfil de entrenador. Actualiza la lista.'); throw error; }
    },
    async updateTrainer(id, version, fields, actor, now) {
      await ensureIndexes();
      return transaction(async session => {
        const instant = now();
        const profile = await collection('entrenadores').findOne({ _id: new ObjectId(id) }, { session });
        if (!profile) throw trainingError(404, 'No existe ese entrenador.');
        const updated = await collection('entrenadores').findOneAndUpdate({ _id: profile._id, version }, { $set: { ...fields, actualizadaEn: instant, actualizadaPor: actor }, $inc: { version: 1 } }, { session, returnDocument: 'after' });
        if (!updated) throw trainingError(409, 'El perfil cambió. Actualiza la lista y vuelve a editarlo.');
        if (!fields.disponible) {
          await collection('horarios').updateMany({ entrenadorId: id, inicio: { $gt: instant } }, { $set: { estado: 'cerrado', reservaId: null, actualizadaEn: instant }, $inc: { version: 1 } }, { session });
          await collection('reservas').updateMany({ entrenadorId: id, estado: 'confirmada', inicio: { $gt: instant } }, { $set: { estado: 'cancelada', canceladaEn: instant, canceladaPor: actor, cancelacionOrigen: 'administrador' } }, { session });
        }
        return updated;
      });
    },
    async listTrainingSlots({ entrenadorId, estado, despues, limit, future, accessUntil }) {
      return list('horarios', { ...cursor(despues), ...(entrenadorId ? { entrenadorId } : {}), ...(estado ? { estado } : {}), ...(future ? { inicio: { $gte: new Date(future.getTime() + 15 * 60000) } } : {}), ...(accessUntil ? { fin: { $lte: accessUntil } } : {}) }, limit);
    },
    async createTrainingSlot(entrenadorId, inicio, actor, now) {
      await ensureIndexes();
      return transaction(async session => {
        const profile = await enabledTrainer(entrenadorId, session, true);
        const previous = await collection('horarios').findOne({ entrenadorId, inicio }, { session });
        if (previous) return { slot: previous, created: false };
        const instant = now();
        if (inicio < new Date(instant.getTime() + 15 * 60000) || inicio > new Date(instant.getTime() + 90 * 86400000)) throw trainingError(400, 'Publica una hora entre 15 minutos y 90 días en el futuro.');
        const slot = { _id: new ObjectId(), entrenadorId, entrenadorNombre: profile.nombre, inicio, fin: new Date(inicio.getTime() + 3600000), estado: 'disponible', reservaId: null, version: 1, creadaEn: instant, actualizadaEn: instant, creadaPor: actor };
        await collection('horarios').insertOne(slot, { session }); return { slot, created: true };
      });
    },
    async changeTrainingSlot(id, version, open, actor, now) {
      await ensureIndexes();
      return transaction(async session => {
        const instant = now(), slots = collection('horarios');
        const slot = await slots.findOne({ _id: new ObjectId(id) }, { session });
        if (!slot) throw trainingError(404, 'No existe ese horario.');
        if (slot.inicio <= instant) throw trainingError(409, 'No se puede cambiar un horario que ya comenzó.');
        if (open) {
          await enabledTrainer(slot.entrenadorId, session, true);
          if (slot.estado === 'reservado') throw trainingError(409, 'El horario tiene una reserva. Actualiza la agenda.');
        }
        const updated = await slots.findOneAndUpdate({ _id: slot._id, version }, { $set: { estado: open ? 'disponible' : 'cerrado', reservaId: null, actualizadaEn: instant, actualizadaPor: actor }, $inc: { version: 1 } }, { session, returnDocument: 'after' });
        if (!updated) throw trainingError(409, 'El horario cambió. Actualiza la agenda antes de volver a intentarlo.');
        if (!open) await collection('reservas').updateMany({ horarioId: id, estado: 'confirmada' }, { $set: { estado: 'cancelada', canceladaEn: instant, canceladaPor: actor, cancelacionOrigen: 'administrador' } }, { session });
        return updated;
      });
    },
    async listBookings({ userId, entrenadorId, estado, despues, limit }) {
      return list('reservas', { ...cursor(despues), ...(userId ? { userId } : {}), ...(entrenadorId ? { entrenadorId } : {}), ...(estado ? { estado } : {}) }, limit);
    },
    async createBooking(horarioId, clave, user, now) {
      await ensureIndexes();
      const previous = await collection('reservas').findOne({ userId: user.id, clave });
      if (previous) return sameBooking(previous, horarioId);
      const id = new ObjectId();
      try {
        return await transaction(async session => {
          const previous = await collection('reservas').findOne({ userId: user.id, clave }, { session });
          if (previous) return sameBooking(previous, horarioId);
          const instant = now();
          const slot = await collection('horarios').findOne({ _id: new ObjectId(horarioId), estado: 'disponible' }, { session });
          if (!slot || slot.inicio < new Date(instant.getTime() + 15 * 60000)) throw trainingError(409, 'El horario ya no está disponible o comienza en menos de 15 minutos.');
          await premium(user.id, instant, session, slot.fin);
          const profile = await enabledTrainer(slot.entrenadorId, session, true);
          if (profile.usuarioId === user.id) throw trainingError(409, 'No puedes reservar una cita contigo mismo.');
          const claimed = await collection('horarios').findOneAndUpdate({ _id: slot._id, estado: 'disponible' }, { $set: { estado: 'reservado', reservaId: String(id), actualizadaEn: instant }, $inc: { version: 1 } }, { session, returnDocument: 'after' });
          if (!claimed) throw trainingError(409, 'El horario cambió. Actualiza la agenda.');
          const booking = { _id: id, userId: user.id, miembroNombre: user.nombre, clave, horarioId, entrenadorId: slot.entrenadorId, entrenadorNombre: profile.nombre, inicio: slot.inicio, fin: slot.fin, estado: 'confirmada', creadaEn: instant, canceladaEn: null, cancelacionOrigen: null };
          await collection('reservas').insertOne(booking, { session });
          await premium(user.id, now(), session, slot.fin);
          return { booking, created: true };
        });
      } catch (error) {
        if (error.code === 11000) {
          const existing = await collection('reservas').findOne({ userId: user.id, clave });
          if (existing) return sameBooking(existing, horarioId);
          throw trainingError(409, 'Ese horario se ocupó o ya tienes una cita a esa hora. Actualiza Mis reservas.');
        }
        throw error;
      }
    },
    async cancelBooking(id, actorId, entrenadorId, now) {
      await ensureIndexes();
      return transaction(async session => {
        const filter = { _id: new ObjectId(id), ...(entrenadorId ? { entrenadorId } : { userId: actorId }) };
        const booking = await collection('reservas').findOne(filter, { session });
        if (!booking) throw trainingError(404, 'No existe esa reserva en tu cuenta.');
        if (booking.estado === 'cancelada') return booking;
        const instant = now();
        if (booking.inicio <= instant) throw trainingError(409, 'Solo se pueden cancelar citas antes de su inicio.');
        const profile = await collection('entrenadores').findOne({ _id: new ObjectId(booking.entrenadorId) }, { session });
        if (entrenadorId && (!profile?.disponible || profile.usuarioId !== actorId)) throw trainingError(403, 'El perfil de entrenador no está habilitado para esta cuenta.');
        const updated = await collection('reservas').findOneAndUpdate({ ...filter, estado: 'confirmada' }, { $set: { estado: 'cancelada', canceladaEn: instant, canceladaPor: actorId, cancelacionOrigen: entrenadorId ? 'entrenador' : 'miembro' } }, { session, returnDocument: 'after' });
        if (!updated) throw trainingError(409, 'La reserva cambió. Actualiza la agenda.');
        await collection('horarios').findOneAndUpdate({ _id: new ObjectId(booking.horarioId), estado: 'reservado', reservaId: id }, { $set: { estado: entrenadorId || !profile?.disponible ? 'cerrado' : 'disponible', reservaId: null, actualizadaEn: instant }, $inc: { version: 1 } }, { session, returnDocument: 'after' });
        return updated;
      });
    },
    async listConversations({ userId, entrenadorId, despues, limit }) {
      return list('conversaciones', { ...cursor(despues), ...(userId ? { userId } : {}), ...(entrenadorId ? { entrenadorId } : {}) }, limit);
    },
    async createConversation(entrenadorId, user, now) {
      await ensureIndexes();
      return transaction(async session => {
        const profile = await enabledTrainer(entrenadorId, session, true);
        await premium(user.id, now(), session);
        if (profile.usuarioId === user.id) throw trainingError(409, 'No puedes abrir una conversación contigo mismo.');
        const previous = await collection('conversaciones').findOne({ userId: user.id, entrenadorId }, { session });
        if (previous) return { conversation: previous, created: false };
        const conversation = { _id: new ObjectId(), userId: user.id, entrenadorId, entrenadorNombre: profile.nombre, miembroNombre: user.nombre, creadaEn: now(), ultimoMensajeEn: null };
        await collection('conversaciones').insertOne(conversation, { session });
        await premium(user.id, now(), session);
        return { conversation, created: true };
      });
    },
    async listTrainingMessages(id, actorId, despues, now) {
      await conversationAccess(id, actorId, now);
      const rows = await collection('mensajes').find({ ...(despues ? { _id: { $lt: new ObjectId(despues) } } : {}), conversacionId: id }).sort({ _id: -1 }).limit(21).toArray();
      const access = await conversationAccess(id, actorId, now);
      return { rows, accessUntil: access.membership.fin };
    },
    async sendTrainingMessage(id, actorId, clave, texto, now) {
      await ensureIndexes();
      return transaction(async session => {
        const access = await conversationAccess(id, actorId, now, session, true);
        const existing = await collection('mensajes').findOne({ conversacionId: id, autorId: actorId, clave }, { session });
        if (existing) {
          if (existing.texto !== texto) throw trainingError(409, 'La clave de este intento pertenece a otro mensaje. Actualiza la conversación.');
          return { created: false };
        }
        const instant = now();
        await collection('mensajes').insertOne({ _id: new ObjectId(), conversacionId: id, autorId: actorId, autor: access.autor, clave, texto, creadoEn: instant }, { session });
        await collection('conversaciones').findOneAndUpdate({ _id: access.conversation._id }, { $set: { ultimoMensajeEn: instant } }, { session, returnDocument: 'after' });
        await premium(access.conversation.userId, now(), session);
        return { created: true };
      });
    },
  };
}
