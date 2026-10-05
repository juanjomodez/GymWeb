import { ObjectId } from 'mongodb';
import { familyPlan, membershipError } from './family-renewals.js';
import { membershipEnd, publicMembership } from './memberships.js';
import { lockMembershipUsers, ownCommitment, resolveMembership } from './membership-access.js';

export function createFamilyRenewalsDatabase(getDb, transaction, ensurePlans) {
  const c = name => getDb().collection(name), activeLink = { $or: [{ estado: 'invitado' }, { estado: 'activo' }] };
  let indexes;
  async function ensureIndexes() {
    indexes ??= Promise.all([
      c('vinculos_familiares').createIndex({ titularId: 1, estado: 1 }),
      c('renovaciones').createIndex({ userId: 1, clave: 1 }, { unique: true }),
      c('renovaciones').createIndex({ userId: 1 }, { unique: true, partialFilterExpression: { estado: 'pendiente' } }),
      c('renovaciones').createIndex({ estado: 1, _id: 1 }),
      c('periodos_membresia').createIndex({ userId: 1, _id: 1 }),
    ]).catch(error => { indexes = undefined; throw error; });
    await indexes;
  }
  const own = (id, session) => c('membresias').findOne({ _id: id }, { session });
  const group = (id, session) => c('vinculos_familiares').find({ titularId: id, ...activeLink }, { session }).limit(5).toArray();
  function validFamily(membership, instant) {
    if (!familyPlan(membership) || !publicMembership(membership, instant)?.accesoActivo) throw membershipError(403, 'Solo el titular de un plan familiar vigente puede invitar o habilitar beneficiarios.');
  }
  const linkDto = link => ({ usuarioId: link._id, nombre: link.nombre, correo: link.correo, estado: link.estado, version: link.version });
  async function event(link, action, actorId, instant, session) {
    await c('eventos_familia').insertOne({ _id: new ObjectId(), titularId: link.titularId, usuarioId: link._id, accion: action, actorId, creadaEn: instant }, { session });
  }
  function period(id, userId, membership, inicio = membership.periodoInicio || membership.inicio, fin = membership.fin) {
    const { planId, planNombre, precio, moneda, pagoSimulado } = membership;
    return { _id: id, userId, planId, planNombre, precio, moneda, inicio, fin, pagoSimulado: pagoSimulado || null, origen: membership.activacionOrigen || 'registro-previo' };
  }
  async function cancelFamilyBookings(userId, actorId, instant, session) {
    const bookings = await c('reservas').find({ userId, estado: 'confirmada', inicio: { $gt: instant } }, { session }).toArray();
    for (const booking of bookings) {
      await c('reservas').findOneAndUpdate({ _id: booking._id, estado: 'confirmada' }, { $set: { estado: 'cancelada', canceladaEn: instant, canceladaPor: actorId, cancelacionOrigen: 'salida del grupo familiar' } }, { session, returnDocument: 'after' });
      const trainer = await c('entrenadores').findOne({ _id: new ObjectId(booking.entrenadorId), disponible: true }, { session });
      await c('horarios').findOneAndUpdate({ _id: new ObjectId(booking.horarioId), estado: 'reservado', reservaId: String(booking._id) }, { $set: { estado: trainer ? 'disponible' : 'cerrado', reservaId: null, actualizadaEn: instant }, $inc: { version: 1 } }, { session, returnDocument: 'after' });
    }
  }
  return {
    resolveMembershipAccess: (userId, instant, options) => resolveMembership(c, userId, instant, options),
    async createInitialMembership(membership) {
      return transaction(async session => {
        await lockMembershipUsers(c, [membership._id], session);
        if (await c('vinculos_familiares').findOne({ _id: membership._id, estado: 'activo' }, { session })) throw membershipError(409, 'Ya tienes acceso como beneficiario. Sal del grupo antes de solicitar una membresía propia.');
        await c('membresias').insertOne(membership, { session });
      });
    },
    async findFamily(userId, instant) {
      const membership = await own(userId), link = await c('vinculos_familiares').findOne({ _id: userId, ...activeLink });
      if (link) {
        const owner = await own(link.titularId);
        return { tipo: 'beneficiario', vinculo: { estado: link.estado, version: link.version, titularNombre: link.titularNombre, planNombre: owner?.planNombre, fin: owner?.fin, accesoActivo: link.estado === 'activo' && familyPlan(owner) && publicMembership(owner, instant)?.accesoActivo === true }, miembros: [] };
      }
      if (!familyPlan(membership)) return { tipo: 'ninguno', miembros: [] };
      const members = await group(userId);
      return { tipo: 'titular', capacidad: membership.maxPersonas, puedeInvitar: publicMembership(membership, instant)?.accesoActivo === true, miembros: members.map(linkDto) };
    },
    async inviteFamilyMember(ownerId, correo, now) {
      await ensureIndexes();
      return transaction(async session => {
        const user = await c('usuarios').findOne({ correo }, { session });
        if (!user || String(user._id) === ownerId) throw membershipError(409, 'No se pudo invitar esa cuenta. Debe estar registrada, ser distinta del titular y estar disponible para unirse.');
        const targetId = String(user._id);
        await lockMembershipUsers(c, [ownerId, targetId], session);
        const membership = await own(ownerId, session); validFamily(membership, now());
        if (await c('vinculos_familiares').findOne({ _id: ownerId, estado: 'activo' }, { session })) throw membershipError(409, 'Un beneficiario no puede administrar otro grupo familiar.');
        const previous = await c('vinculos_familiares').findOne({ _id: targetId }, { session });
        if (previous && ['invitado', 'activo'].includes(previous.estado)) {
          if (previous.titularId === ownerId) return { created: false };
          throw membershipError(409, 'No se pudo invitar esa cuenta. Debe estar registrada, ser distinta del titular y estar disponible para unirse.');
        }
        if (ownCommitment(await own(targetId, session), now()) || (await group(targetId, session)).length) throw membershipError(409, 'No se pudo invitar esa cuenta. Debe estar registrada, ser distinta del titular y estar disponible para unirse.');
        if ((await group(ownerId, session)).length >= membership.maxPersonas - 1) throw membershipError(409, 'El grupo ya tiene todos sus cupos ocupados, contando las invitaciones pendientes y al titular.');
        const owner = await c('usuarios').findOne({ _id: new ObjectId(ownerId) }, { session });
        const link = { _id: targetId, titularId: ownerId, titularNombre: owner.nombre, nombre: user.nombre, correo: user.correo, estado: 'invitado', version: (previous?.version || 0) + 1, invitadaEn: now(), aceptadaEn: null, retiradaEn: null };
        if (previous) { const { _id, ...fields } = link; await c('vinculos_familiares').findOneAndUpdate({ _id: targetId }, { $set: fields }, { session, returnDocument: 'after' }); }
        else await c('vinculos_familiares').insertOne(link, { session });
        await event(link, 'invitacion', ownerId, now(), session);
        validFamily(membership, now()); return { created: true };
      });
    },
    async changeFamilyMember(userId, ownerId, accept, version, now) {
      await ensureIndexes();
      return transaction(async session => {
        const link = await c('vinculos_familiares').findOne({ _id: userId }, { session });
        if (!link || ownerId && link.titularId !== ownerId) throw membershipError(404, 'No existe ese vínculo en tu cuenta.');
        await lockMembershipUsers(c, [userId, link.titularId], session);
        if (link.version !== version) {
          if (link.version === version + 1 && link.estado === (accept ? 'activo' : 'retirado')) return;
          throw membershipError(409, 'La invitación o el vínculo cambió. Actualiza antes de continuar.');
        }
        if (link.estado === (accept ? 'activo' : 'retirado')) return;
        const instant = now();
        if (accept) {
          if (link.estado !== 'invitado') throw membershipError(409, 'Ya no hay una invitación pendiente.');
          validFamily(await own(link.titularId, session), instant);
          if (ownCommitment(await own(userId, session), instant) || (await group(userId, session)).length) throw membershipError(409, 'Ya tienes una membresía propia pendiente o vigente, o administras un grupo.');
        }
        await c('vinculos_familiares').findOneAndUpdate({ _id: userId, version }, { $set: { estado: accept ? 'activo' : 'retirado', [accept ? 'aceptadaEn' : 'retiradaEn']: instant }, $inc: { version: 1 } }, { session, returnDocument: 'after' });
        if (!accept && link.estado === 'activo') await cancelFamilyBookings(userId, ownerId || userId, instant, session);
        await event(link, accept ? 'aceptacion' : 'retiro', ownerId || userId, instant, session);
        if (accept) validFamily(await own(link.titularId, session), now());
      });
    },
    async createMembershipRenewal(userId, clave, now) {
      await ensureIndexes(); await ensurePlans();
      return transaction(async session => {
        await lockMembershipUsers(c, [userId], session);
        const previous = await c('renovaciones').findOne({ userId, clave }, { session }); if (previous) return { renewal: previous, created: false };
        if (await c('vinculos_familiares').findOne({ _id: userId, estado: 'activo' }, { session })) throw membershipError(403, 'La renovación del grupo la solicita su titular.');
        const current = await own(userId, session);
        if (!current || !['activa', 'vencida'].includes(current.estado) || current.periodo !== 'mes' || !(current.inicio instanceof Date) || !(current.fin instanceof Date) || !Number.isFinite(current.inicio.getTime()) || !Number.isFinite(current.fin.getTime()) || current.fin <= current.inicio) throw membershipError(409, 'Primero activa tu solicitud inicial. Solo se renuevan membresías mensuales ya activadas.');
        if (await c('renovaciones').findOne({ userId, estado: 'pendiente' }, { session })) throw membershipError(409, 'Ya tienes una renovación pendiente. Revísala o cancélala antes de solicitar otra.');
        const plan = await c('planes').findOne({ _id: current.planId, disponible: true }, { session });
        if (!plan || plan.periodo !== 'mes' || plan.moneda !== 'COP' || !Number.isSafeInteger(plan.precio) || plan.precio < 0 || !Number.isInteger(plan.maxPersonas) || plan.maxPersonas < 1 || plan.maxPersonas > 5) throw membershipError(409, 'El plan actual no está disponible para renovar. Consulta al administrador.');
        const renewal = { _id: new ObjectId(), userId, clave, planId: plan._id, planNombre: plan.nombre, precio: plan.precio, moneda: plan.moneda, periodo: plan.periodo, maxPersonas: plan.maxPersonas, estado: 'pendiente', solicitadaEn: now(), inicio: null, fin: null, aplicadaEn: null, origen: null, pagoSimulado: null };
        await c('renovaciones').insertOne(renewal, { session }); return { renewal, created: true };
      });
    },
    async listMembershipRenewals({ userId, estado, despues, limit, admin }) {
      const rows = await c('renovaciones').find({ ...(userId ? { userId } : {}), ...(estado ? { estado } : {}), ...(despues ? { _id: { $lt: new ObjectId(despues) } } : {}) }).sort({ _id: -1 }).limit(limit).toArray();
      if (admin) for (const row of rows) { const user = await c('usuarios').findOne({ _id: new ObjectId(row.userId) }, { projection: { nombre: 1, correo: 1, _id: 0 } }); row.usuario = user || null; }
      return rows;
    },
    async cancelMembershipRenewal(id, userId, now) {
      await ensureIndexes();
      return transaction(async session => {
        await lockMembershipUsers(c, [userId], session);
        const row = await c('renovaciones').findOne({ _id: new ObjectId(id), userId }, { session });
        if (!row) throw membershipError(404, 'No existe esa renovación en tu cuenta.');
        if (row.estado === 'cancelada') return row;
        if (row.estado !== 'pendiente') throw membershipError(409, 'Una renovación aplicada no se cancela.');
        return c('renovaciones').findOneAndUpdate({ _id: row._id, estado: 'pendiente' }, { $set: { estado: 'cancelada', canceladaEn: now() } }, { session, returnDocument: 'after' });
      });
    },
    async applyMembershipRenewal(id, actorId, admin, result, now) {
      await ensureIndexes();
      return transaction(async session => {
        const row = await c('renovaciones').findOne({ _id: new ObjectId(id), ...(admin ? {} : { userId: actorId }) }, { session });
        if (!row) throw membershipError(404, 'No existe esa renovación en tu cuenta.');
        await lockMembershipUsers(c, [row.userId], session);
        if (row.estado === 'aplicada') {
          if (admin || row.origen === 'pago-simulado' && result === 'aprobado') return row;
          throw membershipError(409, 'Esta renovación ya fue aplicada y no admite otro pago ni rechazo.');
        }
        if (row.estado !== 'pendiente') throw membershipError(409, 'Esta renovación ya no está pendiente.');
        if (await c('vinculos_familiares').findOne({ _id: row.userId, estado: 'activo' }, { session })) throw membershipError(409, 'La cuenta ahora pertenece a otro grupo. Cancela esta solicitud antes de continuar.');
        const current = await own(row.userId, session);
        if (!current || current.planId !== row.planId || !['activa', 'vencida'].includes(current.estado) || current.periodo !== 'mes' || !(current.inicio instanceof Date) || !(current.fin instanceof Date) || !Number.isFinite(current.inicio.getTime()) || !Number.isFinite(current.fin.getTime()) || current.fin <= current.inicio) throw membershipError(409, 'La membresía cambió. Actualiza antes de continuar.');
        if ((await group(row.userId, session)).length > row.maxPersonas - 1) throw membershipError(409, 'El grupo supera los cupos de esta renovación. Retira miembros o consulta al administrador.');
        const instant = now(), payment = admin ? null : { tipo: 'simulado', resultado: result, monto: row.precio, moneda: row.moneda, registradaEn: instant };
        if (result === 'rechazado') {
          if (row.pagoSimulado?.resultado === 'rechazado') return row;
          return c('renovaciones').findOneAndUpdate({ _id: row._id }, { $set: { pagoSimulado: payment } }, { session, returnDocument: 'after' });
        }
        const continuous = publicMembership(current, instant).accesoActivo;
        const inicio = continuous ? current.fin : instant, fin = membershipEnd(inicio);
        if (!current.periodoId) await c('periodos_membresia').insertOne(period(new ObjectId(row.userId), row.userId, current), { session });
        const applied = { ...row, estado: 'aplicada', inicio, fin, aplicadaEn: instant, aplicadaPor: actorId, origen: admin ? 'administrador' : 'pago-simulado', pagoSimulado: payment };
        await c('periodos_membresia').insertOne(period(row._id, row.userId, { ...applied, activacionOrigen: applied.origen }), { session });
        await c('membresias').findOneAndUpdate({ _id: row.userId }, { $set: { planNombre: row.planNombre, precio: row.precio, moneda: row.moneda, periodo: row.periodo, maxPersonas: row.maxPersonas, estado: 'activa', inicio: continuous ? current.inicio : inicio, fin, periodoInicio: inicio, periodoId: String(row._id), activadaEn: instant, activadaPor: actorId, activacionOrigen: 'renovacion', pagoSimulado: payment }, $inc: { accesoVersion: 1 } }, { session, returnDocument: 'after' });
        const { _id, ...appliedFields } = applied;
        await c('renovaciones').findOneAndUpdate({ _id: row._id, estado: 'pendiente' }, { $set: appliedFields }, { session, returnDocument: 'after' });
        return applied;
      });
    },
    async listMembershipPeriods(userId, despues) {
      const rows = await c('periodos_membresia').find({ userId, ...(despues ? { _id: { $lt: new ObjectId(despues) } } : {}) }).sort({ _id: -1 }).limit(21).toArray();
      if (!rows.length && !despues) { const current = await own(userId); if (current && !current.periodoId && current.inicio instanceof Date && current.fin instanceof Date) return [period(new ObjectId(userId), userId, current)]; }
      return rows;
    },
  };
}
