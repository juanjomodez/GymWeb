import { requireAdmin } from './auth.js';
import { publicMembership, validUserId as validId } from './memberships.js';

export const routineLevels = ['principiante', 'intermedio', 'avanzado'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, min, max) => typeof value === 'string' && value.trim().length >= min && value.trim().length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
export const validVersion = value => Number.isSafeInteger(value) && value >= 1 && value < Number.MAX_SAFE_INTEGER;

export function validateRoutine(body, editing = false) {
  const allowed = ['nombre', 'objetivo', 'nivel', 'ejercicios', 'disponible', ...(editing ? ['version'] : [])];
  if (!object(body) || Object.keys(body).some(key => !allowed.includes(key))) return null;
  if (!text(body.nombre, 2, 100) || !text(body.objetivo, 5, 500) || !routineLevels.includes(body.nivel) || typeof body.disponible !== 'boolean') return null;
  if (editing && !validVersion(body.version)) return null;
  if (!Array.isArray(body.ejercicios) || body.ejercicios.length < 1 || body.ejercicios.length > 20) return null;
  const exercises = [];
  for (const exercise of body.ejercicios) {
    if (!object(exercise) || Object.keys(exercise).some(key => !['nombre', 'series', 'repeticiones', 'descansoSegundos'].includes(key))) return null;
    if (!text(exercise.nombre, 2, 100) || !Number.isInteger(exercise.series) || exercise.series < 1 || exercise.series > 20 || !text(exercise.repeticiones, 1, 40) || !Number.isInteger(exercise.descansoSegundos) || exercise.descansoSegundos < 0 || exercise.descansoSegundos > 600) return null;
    exercises.push({ nombre: exercise.nombre.trim(), series: exercise.series, repeticiones: exercise.repeticiones.trim(), descansoSegundos: exercise.descansoSegundos });
  }
  return { nombre: body.nombre.trim(), objetivo: body.objetivo.trim(), nivel: body.nivel, ejercicios: exercises, disponible: body.disponible };
}

export function publicRoutine(value, admin = false) {
  const { nombre, objetivo, nivel, ejercicios, disponible } = value;
  return {
    _id: value._id.toString(), nombre, objetivo, nivel, disponible,
    ejercicios: ejercicios.map(({ nombre, series, repeticiones, descansoSegundos }) => ({ nombre, series, repeticiones, descansoSegundos })),
    ...(admin ? { version: value.version, creadaEn: value.creadaEn, actualizadaEn: value.actualizadaEn } : {}),
  };
}

export function setupRoutines(app, database, requireUser, now) {
  async function requireMembership(req, res, next) {
    try {
      const membership = await database.findMembership(req.user.id, now());
      if (!publicMembership(membership, now())?.accesoActivo) {
        return res.status(403).json({ message: 'Necesitas una membresía activa para consultar las rutinas.' });
      }
      req.routineAccessUntil = membership.fin;
      next();
    } catch { res.status(503).json({ message: 'No se pudo comprobar el acceso a las rutinas.' }); }
  }
  // Volver a comprobar antes de responder si la DB tardó hasta el vencimiento.
  async function accessValid(req, res) {
    if (req.routineAccessUntil > now() && publicMembership(await database.findMembership(req.user.id, now()), now())?.accesoActivo) return true;
    res.status(403).json({ message: 'Tu membresía venció. El acceso a rutinas ya no está habilitado.' });
    return false;
  }
  function filters(req, admin) {
    const { despues, nivel, disponibilidad = 'todas' } = req.query;
    if (despues !== undefined && !validId(despues) || nivel !== undefined && !routineLevels.includes(nivel)) return null;
    if (admin && !['todas', 'disponibles', 'deshabilitadas'].includes(disponibilidad)) return null;
    return { despues, nivel, disponible: admin ? disponibilidad === 'todas' ? undefined : disponibilidad === 'disponibles' : true, limit: 21 };
  }
  function page(rows, admin) {
    return { rutinas: rows.slice(0, 20).map(row => publicRoutine(row, admin)), siguiente: rows.length > 20 ? rows[19]._id.toString() : null };
  }

  app.get('/api/rutinas', requireUser, requireMembership, async (req, res) => {
    const filter = filters(req, false);
    if (!filter) return res.status(400).json({ message: 'Filtro de rutinas inválido.' });
    try {
      const rows = await database.listRoutines(filter);
      if (await accessValid(req, res)) res.json({ ...page(rows, false), accesoHasta: req.routineAccessUntil });
    } catch { res.status(503).json({ message: 'No se pudieron cargar las rutinas.' }); }
  });
  app.get('/api/rutinas/:id', requireUser, requireMembership, async (req, res) => {
    if (!validId(req.params.id)) return res.status(400).json({ message: 'Rutina inválida.' });
    try {
      const routine = await database.findRoutine(req.params.id, true);
      if (!await accessValid(req, res)) return;
      if (!routine) return res.status(404).json({ message: 'La rutina no está disponible.' });
      res.json({ rutina: publicRoutine(routine), accesoHasta: req.routineAccessUntil });
    } catch { res.status(503).json({ message: 'No se pudo cargar la rutina.' }); }
  });
  app.get('/api/admin/rutinas', requireUser, requireAdmin, async (req, res) => {
    const filter = filters(req, true);
    if (!filter) return res.status(400).json({ message: 'Filtro de rutinas inválido.' });
    try { res.json(page(await database.listRoutines(filter), true)); }
    catch { res.status(503).json({ message: 'No se pudieron cargar las rutinas.' }); }
  });
  app.post('/api/admin/rutinas', requireUser, requireAdmin, async (req, res) => {
    const input = validateRoutine(req.body);
    if (!input) return res.status(400).json({ message: 'Revisa nombre, objetivo, nivel, disponibilidad y ejercicios (1–20).' });
    try {
      const instant = now();
      const routine = await database.createRoutine({ ...input, version: 1, creadaEn: instant, actualizadaEn: instant, creadaPor: req.user.id, actualizadaPor: req.user.id });
      res.status(201).json({ message: 'Rutina creada.', rutina: publicRoutine(routine, true) });
    } catch { res.status(503).json({ message: 'No se pudo crear la rutina. Actualiza la lista antes de volver a enviarla.' }); }
  });
  async function update(req, res, availabilityOnly) {
    if (!validId(req.params.id)) return res.status(400).json({ message: 'Rutina inválida.' });
    let input;
    if (availabilityOnly) {
      const body = req.body;
      if (object(body) && Object.keys(body).every(key => ['disponible', 'version'].includes(key)) && typeof body.disponible === 'boolean' && validVersion(body.version)) input = { disponible: body.disponible };
    } else input = validateRoutine(req.body, true);
    if (!input) return res.status(400).json({ message: 'Datos de rutina o versión inválidos.' });
    try {
      const updated = await database.updateRoutine(req.params.id, req.body.version, { ...input, actualizadaEn: now(), actualizadaPor: req.user.id });
      if (!updated) {
        if (!await database.findRoutine(req.params.id)) return res.status(404).json({ message: 'No existe esa rutina.' });
        return res.status(409).json({ message: 'La rutina cambió desde que la abriste. Actualiza la lista y vuelve a editarla.' });
      }
      res.json({ message: availabilityOnly ? updated.disponible ? 'Rutina habilitada.' : 'Rutina deshabilitada.' : 'Rutina actualizada.', rutina: publicRoutine(updated, true) });
    } catch { res.status(503).json({ message: 'No se pudo actualizar la rutina. Actualiza la lista antes de volver a intentarlo.' }); }
  }
  app.post('/api/admin/rutinas/:id', requireUser, requireAdmin, (req, res) => update(req, res, false));
  app.post('/api/admin/rutinas/:id/disponibilidad', requireUser, requireAdmin, (req, res) => update(req, res, true));
}
