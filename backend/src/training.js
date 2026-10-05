import { requireAdmin } from './auth.js';
import { publicMembership, validUserId as validId } from './memberships.js';
import { validVersion } from './routines.js';
import { validOrderKey } from './orders.js';

export const trainingError = (status, message) => Object.assign(new Error(message), { trainingStatus: status });
export const hasTrainingAccess = (membership, instant) => ['premium-individual', 'premium-familiar'].includes(membership?.planId) && publicMembership(membership, instant)?.accesoActivo === true;
export const trainerImages = Array.from({ length: 5 }, (_, i) => `img/entrenador${i + 1}.jpg`);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const text = (value, min, max) => typeof value === 'string' && value.trim().length >= min && value.trim().length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const fields = (body, keys) => object(body) && Object.keys(body).length === keys.length && keys.every(key => Object.hasOwn(body, key));
export function validateTrainer(body, editing = false) {
  if (!fields(body, ['nombre', 'especialidad', 'descripcion', 'imagen', 'disponible', editing ? 'version' : 'correo'])) return null;
  if (!text(body.nombre, 2, 100) || !text(body.especialidad, 2, 100) || !text(body.descripcion, 5, 500) || !trainerImages.includes(body.imagen) || typeof body.disponible !== 'boolean') return null;
  if (editing ? !validVersion(body.version) : typeof body.correo !== 'string' || body.correo.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.correo.trim())) return null;
  return { nombre: body.nombre.trim(), especialidad: body.especialidad.trim(), descripcion: body.descripcion.trim(), imagen: body.imagen, disponible: body.disponible, ...(editing ? {} : { correo: body.correo.trim().toLowerCase() }) };
}
export function parseSlotStart(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:00:00\.000Z$/.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value ? date : null;
}
export function publicTrainer(value, admin = false) {
  const { nombre, especialidad, descripcion, imagen, disponible } = value;
  return { _id: String(value._id), nombre, especialidad, descripcion, imagen, disponible, ...(admin ? { version: value.version, usuarioId: value.usuarioId } : {}) };
}
export function publicSlot(value, admin = false) {
  const { entrenadorId, entrenadorNombre, inicio, fin, estado } = value;
  return { _id: String(value._id), entrenadorId, entrenadorNombre, inicio, fin, estado, ...(admin ? { version: value.version } : {}) };
}
export function publicBooking(value, staff = false) {
  const { entrenadorId, entrenadorNombre, horarioId, inicio, fin, estado, creadaEn, canceladaEn, cancelacionOrigen } = value;
  return { _id: String(value._id), entrenadorId, entrenadorNombre, horarioId, inicio, fin, estado, creadaEn, canceladaEn, cancelacionOrigen, ...(staff ? { miembroNombre: value.miembroNombre } : {}) };
}
export function publicConversation(value) {
  const { entrenadorId, entrenadorNombre, miembroNombre, creadaEn, ultimoMensajeEn } = value;
  return { _id: String(value._id), entrenadorId, entrenadorNombre, miembroNombre, creadaEn, ultimoMensajeEn };
}
const page = (rows, key, dto) => ({ [key]: rows.slice(0, 20).map(dto), siguiente: rows.length > 20 ? String(rows[19]._id) : null });

export function setupTraining(app, database, requireUser, now) {
  const fail = (res, error) => res.status(error.trainingStatus || 503).json({ message: error.trainingStatus ? error.message : 'No se pudo confirmar la operación. Actualiza la agenda o la conversación antes de reintentar; conserva la misma clave de intento.' });
  async function premium(req, res, next) {
    try {
      const membership = await database.findMembership(req.user.id, now());
      if (!hasTrainingAccess(membership, now())) return res.status(403).json({ message: 'Necesitas Premium individual o Premium familiar con membresía vigente para reservar y conversar con entrenadores.' });
      req.trainingAccessUntil = membership.fin; next();
    } catch (error) { fail(res, error); }
  }
  const accessValid = async (req, res) => {
    if (req.trainingAccessUntil > now() && hasTrainingAccess(await database.findMembership(req.user.id, now()), now())) return true;
    res.status(403).json({ message: 'Tu membresía venció. Actualiza tu membresía para comprobar el acceso.' }); return false;
  };
  async function trainer(req, res, next) {
    try {
      const profile = await database.findTrainerForUser(req.user.id);
      if (!profile) return res.status(403).json({ message: 'No tienes un perfil de entrenador habilitado.' });
      req.trainer = profile; next();
    } catch (error) { fail(res, error); }
  }
  function filters(req, availability = false) {
    const { despues, entrenadorId, estado, disponibilidad = 'todas' } = req.query;
    if (despues !== undefined && !validId(despues) || entrenadorId !== undefined && !validId(entrenadorId)) return null;
    if (estado !== undefined && !['disponible', 'reservado', 'cerrado', 'confirmada', 'cancelada'].includes(estado)) return null;
    if (availability && !['todas', 'disponibles', 'deshabilitados'].includes(disponibilidad)) return null;
    return { despues, entrenadorId, estado, disponible: disponibilidad === 'todas' ? undefined : disponibilidad === 'disponibles', limit: 21 };
  }
  app.get('/api/entrenadores', async (req, res) => {
    const filter = filters(req); if (!filter) return res.status(400).json({ message: 'Filtro de entrenadores inválido.' });
    try { res.json(page(await database.listTrainers({ ...filter, disponible: true }), 'entrenadores', row => publicTrainer(row))); } catch (error) { fail(res, error); }
  });
  app.get('/api/entrenamiento/acceso', requireUser, async (req, res) => {
    try {
      const [membership, profile] = await Promise.all([
        database.findMembership(req.user.id, now()),
        database.findTrainerForUser(req.user.id),
      ]);
      res.json({ premium: hasTrainingAccess(membership, now()), entrenador: profile ? publicTrainer(profile) : null });
    } catch (error) { fail(res, error); }
  });
  app.get('/api/admin/entrenadores', requireUser, requireAdmin, async (req, res) => {
    const filter = filters(req, true); if (!filter) return res.status(400).json({ message: 'Filtro de entrenadores inválido.' });
    try { res.json(page(await database.listTrainers(filter), 'entrenadores', row => publicTrainer(row, true))); } catch (error) { fail(res, error); }
  });
  app.post('/api/admin/entrenadores', requireUser, requireAdmin, async (req, res) => {
    const input = validateTrainer(req.body); if (!input) return res.status(400).json({ message: 'Revisa los datos del entrenador y el correo de una cuenta existente.' });
    try { res.status(201).json({ message: 'Entrenador vinculado a su cuenta.', entrenador: publicTrainer(await database.createTrainer(input, req.user.id, now()), true) }); } catch (error) { fail(res, error); }
  });
  app.post('/api/admin/entrenadores/:id', requireUser, requireAdmin, async (req, res) => {
    const input = validateTrainer(req.body, true); if (!validId(req.params.id) || !input) return res.status(400).json({ message: 'Datos del entrenador o versión inválidos.' });
    try { res.json({ message: input.disponible ? 'Entrenador actualizado.' : 'Entrenador deshabilitado. Se cerraron sus horarios futuros y se cancelaron las citas futuras.', entrenador: publicTrainer(await database.updateTrainer(req.params.id, req.body.version, input, req.user.id, now), true) }); } catch (error) { fail(res, error); }
  });
  app.get('/api/entrenador/me', requireUser, trainer, (req, res) => res.json({ entrenador: publicTrainer(req.trainer) }));
  app.get('/api/horarios', requireUser, premium, async (req, res) => {
    const filter = filters(req); if (!filter) return res.status(400).json({ message: 'Filtro de horarios inválido.' });
    try { const rows = await database.listTrainingSlots({ ...filter, estado: 'disponible', future: now(), accessUntil: req.trainingAccessUntil }); if (await accessValid(req, res)) res.json({ ...page(rows, 'horarios', row => publicSlot(row)), accesoHasta: req.trainingAccessUntil }); } catch (error) { fail(res, error); }
  });
  app.get('/api/admin/horarios', requireUser, requireAdmin, async (req, res) => {
    const filter = filters(req); if (!filter || filter.estado && !['disponible', 'reservado', 'cerrado'].includes(filter.estado)) return res.status(400).json({ message: 'Filtro de horarios inválido.' });
    try { res.json(page(await database.listTrainingSlots(filter), 'horarios', row => publicSlot(row, true))); } catch (error) { fail(res, error); }
  });
  app.post('/api/admin/horarios', requireUser, requireAdmin, async (req, res) => {
    const start = parseSlotStart(req.body?.inicio);
    if (!fields(req.body, ['entrenadorId', 'inicio']) || !validId(req.body.entrenadorId) || !start) return res.status(400).json({ message: 'Selecciona un entrenador y una hora exacta. Las citas duran 60 minutos.' });
    try { const result = await database.createTrainingSlot(req.body.entrenadorId, start, req.user.id, now); res.status(result.created ? 201 : 200).json({ message: result.created ? 'Horario publicado.' : 'Se recuperó el horario existente; no se creó otro.', horario: publicSlot(result.slot, true) }); } catch (error) { fail(res, error); }
  });
  for (const [action, open] of [['cerrar', false], ['abrir', true]]) app.post(`/api/admin/horarios/:id/${action}`, requireUser, requireAdmin, async (req, res) => {
    if (!validId(req.params.id) || !fields(req.body, ['version']) || !validVersion(req.body.version)) return res.status(400).json({ message: 'Horario o versión inválidos.' });
    try { res.json({ message: open ? 'Horario abierto.' : 'Horario cerrado; se canceló su reserva si tenía una.', horario: publicSlot(await database.changeTrainingSlot(req.params.id, req.body.version, open, req.user.id, now), true) }); } catch (error) { fail(res, error); }
  });
  app.get('/api/reservas', requireUser, async (req, res) => {
    const filter = filters(req); if (!filter || filter.estado && !['confirmada', 'cancelada'].includes(filter.estado)) return res.status(400).json({ message: 'Filtro de reservas inválido.' });
    try { res.json(page(await database.listBookings({ ...filter, userId: req.user.id }), 'reservas', row => publicBooking(row))); } catch (error) { fail(res, error); }
  });
  app.get('/api/admin/reservas', requireUser, requireAdmin, async (req, res) => {
    const filter = filters(req); if (!filter || filter.estado && !['confirmada', 'cancelada'].includes(filter.estado)) return res.status(400).json({ message: 'Filtro de reservas inválido.' });
    try { res.json(page(await database.listBookings(filter), 'reservas', row => publicBooking(row, true))); } catch (error) { fail(res, error); }
  });
  app.get('/api/entrenador/reservas', requireUser, trainer, async (req, res) => {
    const filter = filters(req); if (!filter || filter.estado && !['confirmada', 'cancelada'].includes(filter.estado)) return res.status(400).json({ message: 'Filtro de reservas inválido.' });
    try { res.json(page(await database.listBookings({ ...filter, entrenadorId: String(req.trainer._id) }), 'reservas', row => publicBooking(row, true))); } catch (error) { fail(res, error); }
  });
  app.post('/api/reservas', requireUser, premium, async (req, res) => {
    if (!fields(req.body, ['horarioId', 'clave']) || !validId(req.body.horarioId) || !validOrderKey(req.body.clave)) return res.status(400).json({ message: 'Envía un horario y una clave UUID v4, sin datos adicionales.' });
    try { const result = await database.createBooking(req.body.horarioId, req.body.clave, req.user, now); res.status(result.created ? 201 : 200).json({ message: result.created ? 'Reserva confirmada.' : 'Se recuperó la reserva de este intento.', reserva: publicBooking(result.booking) }); } catch (error) { fail(res, error); }
  });
  for (const staff of [false, true]) app.post(staff ? '/api/entrenador/reservas/:id/cancelar' : '/api/reservas/:id/cancelar', requireUser, ...(staff ? [trainer] : []), async (req, res) => {
    if (!validId(req.params.id) || req.body !== undefined && !fields(req.body, [])) return res.status(400).json({ message: 'La cancelación solo admite el ID de reserva.' });
    try { res.json({ message: staff ? 'Cita cancelada y horario cerrado.' : 'Reserva cancelada. Los reintentos conservan la cancelación original.', reserva: publicBooking(await database.cancelBooking(req.params.id, req.user.id, staff ? String(req.trainer._id) : null, now), staff) }); } catch (error) { fail(res, error); }
  });
  for (const staff of [false, true]) app.get(staff ? '/api/entrenador/conversaciones' : '/api/conversaciones', requireUser, staff ? trainer : premium, async (req, res) => {
    const filter = filters(req); if (!filter) return res.status(400).json({ message: 'Filtro de conversaciones inválido.' });
    try { const rows = await database.listConversations({ ...filter, ...(staff ? { entrenadorId: String(req.trainer._id) } : { userId: req.user.id }) }); if (staff || await accessValid(req, res)) res.json({ ...page(rows, 'conversaciones', publicConversation), ...(staff ? {} : { accesoHasta: req.trainingAccessUntil }) }); } catch (error) { fail(res, error); }
  });
  app.post('/api/conversaciones', requireUser, premium, async (req, res) => {
    if (!fields(req.body, ['entrenadorId']) || !validId(req.body.entrenadorId)) return res.status(400).json({ message: 'Selecciona un entrenador, sin datos adicionales.' });
    try { const result = await database.createConversation(req.body.entrenadorId, req.user, now); res.status(result.created ? 201 : 200).json({ conversacion: publicConversation(result.conversation) }); } catch (error) { fail(res, error); }
  });
  app.get('/api/conversaciones/:id/mensajes', requireUser, async (req, res) => {
    if (!validId(req.params.id) || req.query.despues !== undefined && !validId(req.query.despues)) return res.status(400).json({ message: 'Conversación o cursor inválidos.' });
    try { const result = await database.listTrainingMessages(req.params.id, req.user.id, req.query.despues, now); const body = page(result.rows, 'mensajes', row => ({ _id: String(row._id), autor: row.autor, texto: row.texto, creadoEn: row.creadoEn })); body.mensajes.reverse(); res.json({ ...body, accesoHasta: result.accessUntil }); } catch (error) { fail(res, error); }
  });
  app.post('/api/conversaciones/:id/mensajes', requireUser, async (req, res) => {
    if (!validId(req.params.id) || !fields(req.body, ['clave', 'texto']) || !validOrderKey(req.body.clave) || !text(req.body.texto, 1, 2000)) return res.status(400).json({ message: 'Escribe un mensaje de 1–2000 caracteres con una clave UUID v4, sin campos adicionales.' });
    try { const result = await database.sendTrainingMessage(req.params.id, req.user.id, req.body.clave, req.body.texto.trim(), now); res.status(result.created ? 201 : 200).json({ message: result.created ? 'Mensaje enviado.' : 'Se recuperó el mensaje del mismo intento.' }); } catch (error) { fail(res, error); }
  });
}
