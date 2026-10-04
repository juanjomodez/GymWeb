import { requireAdmin } from './auth.js';
import { publicSimulatedPayment, validUserId } from './memberships.js';
import { validOrderKey } from './orders.js';
import { simulationEnabled } from './simulated-payments.js';

export const membershipError = (status, message) => Object.assign(new Error(message), { membershipStatus: status });
export const familyPlan = membership => ['familiar', 'premium-familiar'].includes(membership?.planId) && membership.periodo === 'mes' && Number.isInteger(membership.maxPersonas) && membership.maxPersonas >= 2 && membership.maxPersonas <= 5;
const fields = (body, keys) => body && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === keys.length && keys.every(key => Object.hasOwn(body, key));
const empty = body => body === undefined || fields(body, []);
const versioned = body => fields(body, ['version']) && Number.isSafeInteger(body.version) && body.version >= 1 && body.version < Number.MAX_SAFE_INTEGER;
export function publicRenewal(row, admin = false) {
  const { planId, planNombre, precio, moneda, periodo, maxPersonas, estado, solicitadaEn, aplicadaEn, inicio, fin, origen, canceladaEn } = row;
  return { _id: String(row._id), planId, planNombre, precio, moneda, periodo, maxPersonas, estado, solicitadaEn, aplicadaEn, inicio, fin, origen, canceladaEn, pagoSimulado: publicSimulatedPayment(row.pagoSimulado), ...(admin ? { usuario: row.usuario } : {}) };
}
export function publicPeriod(row, instant) {
  const { planId, planNombre, precio, moneda, inicio, fin, origen } = row;
  return { _id: String(row._id), planId, planNombre, precio, moneda, inicio, fin, origen, estado: fin <= instant ? 'finalizado' : inicio > instant ? 'programado' : 'vigente', pagoSimulado: publicSimulatedPayment(row.pagoSimulado) };
}
export function setupFamilyRenewals(app, database, requireUser, now, options) {
  const fail = (res, error) => res.status(error.membershipStatus || 503).json({ message: error.membershipStatus ? error.message : 'No se pudo confirmar la operación. Actualiza el grupo o la renovación antes de reintentar.' });
  app.get('/api/familia', requireUser, async (req, res) => {
    try { res.json(await database.findFamily(req.user.id, now())); } catch (error) { fail(res, error); }
  });
  app.post('/api/familia/invitaciones', requireUser, async (req, res) => {
    if (!fields(req.body, ['correo']) || typeof req.body.correo !== 'string' || req.body.correo.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.correo.trim())) return res.status(400).json({ message: 'Introduce el correo de una cuenta registrada, sin campos adicionales.' });
    try { const result = await database.inviteFamilyMember(req.user.id, req.body.correo.trim().toLowerCase(), now); res.status(result.created ? 201 : 200).json({ message: result.created ? 'Invitación creada. La persona debe aceptarla desde su cuenta.' : 'Esa invitación ya existe. Actualiza el grupo.' }); } catch (error) { fail(res, error); }
  });
  for (const action of ['aceptar', 'salir']) app.post(`/api/familia/${action}`, requireUser, async (req, res) => {
    if (!versioned(req.body)) return res.status(400).json({ message: 'Envía solo la versión de la invitación o vínculo.' });
    try { await database.changeFamilyMember(req.user.id, null, action === 'aceptar', req.body.version, now); res.json({ message: action === 'aceptar' ? 'Invitación aceptada. Tu acceso depende de la membresía del titular.' : 'Saliste del grupo o rechazaste la invitación. Se cancelaron tus citas futuras cubiertas por el grupo.' }); } catch (error) { fail(res, error); }
  });
  app.post('/api/familia/miembros/:id/retirar', requireUser, async (req, res) => {
    if (!validUserId(req.params.id) || !versioned(req.body)) return res.status(400).json({ message: 'Envía el miembro y solo la versión de su vínculo.' });
    try { await database.changeFamilyMember(req.params.id, req.user.id, false, req.body.version, now); res.json({ message: 'Invitación o beneficiario retirado. Se cancelaron sus citas futuras cubiertas por el grupo.' }); } catch (error) { fail(res, error); }
  });
  const filter = req => {
    const { despues, estado } = req.query;
    if (despues !== undefined && !validUserId(despues) || estado !== undefined && !['pendiente', 'aplicada', 'cancelada'].includes(estado)) return null;
    return { despues, estado, limit: 21 };
  };
  for (const admin of [false, true]) app.get(admin ? '/api/admin/renovaciones' : '/api/renovaciones', requireUser, ...(admin ? [requireAdmin] : []), async (req, res) => {
    const query = filter(req); if (!query) return res.status(400).json({ message: 'Filtro de renovaciones inválido.' });
    try { const rows = await database.listMembershipRenewals({ ...query, ...(admin ? {} : { userId: req.user.id }), admin }); res.json({ renovaciones: rows.slice(0, 20).map(row => publicRenewal(row, admin)), siguiente: rows.length > 20 ? String(rows[19]._id) : null }); } catch (error) { fail(res, error); }
  });
  app.post('/api/renovaciones', requireUser, async (req, res) => {
    if (!fields(req.body, ['clave']) || !validOrderKey(req.body.clave)) return res.status(400).json({ message: 'La renovación recibe solo una clave UUID v4. El plan y el precio se obtienen del servidor.' });
    try { const result = await database.createMembershipRenewal(req.user.id, req.body.clave, now); res.status(result.created ? 201 : 200).json({ message: result.created ? 'Renovación solicitada. Revisa su importe antes de aprobar o simular el pago.' : 'Se recuperó la renovación de este intento.', renovacion: publicRenewal(result.renewal) }); } catch (error) { fail(res, error); }
  });
  for (const action of ['cancelar', 'pago-simulado', 'aprobar']) app.post(`/api/${action === 'aprobar' ? 'admin/' : ''}renovaciones/:id/${action}`, requireUser, ...(action === 'aprobar' ? [requireAdmin] : []), async (req, res) => {
    if (!validUserId(req.params.id)) return res.status(400).json({ message: 'Renovación inválida.' });
    if (action === 'pago-simulado' && !simulationEnabled(options)) return res.status(403).json({ message: 'La simulación de pagos está deshabilitada en este servidor.' });
    if (action === 'pago-simulado' ? !fields(req.body, ['resultado']) || !['aprobado', 'rechazado'].includes(req.body.resultado) : !empty(req.body)) return res.status(400).json({ message: 'Datos de renovación inválidos.' });
    try {
      const result = action === 'cancelar' ? await database.cancelMembershipRenewal(req.params.id, req.user.id, now)
        : await database.applyMembershipRenewal(req.params.id, req.user.id, action === 'aprobar', req.body?.resultado || 'aprobado', now);
      res.json({ message: action === 'cancelar' ? 'Solicitud cancelada; no cambia el acceso vigente.' : result.estado === 'aplicada' ? 'Renovación aplicada. Los reintentos conservan el mismo periodo.' : 'Pago simulado rechazado; la solicitud sigue pendiente. No hubo cobro.', renovacion: publicRenewal(result) });
    } catch (error) { fail(res, error); }
  });
  app.get('/api/membresia/historial', requireUser, async (req, res) => {
    const despues = req.query.despues; if (despues !== undefined && !validUserId(despues)) return res.status(400).json({ message: 'Cursor inválido.' });
    try { const instant = now(), rows = await database.listMembershipPeriods(req.user.id, despues); res.json({ periodos: rows.slice(0, 20).map(row => publicPeriod(row, instant)), siguiente: rows.length > 20 ? String(rows[19]._id) : null }); } catch (error) { fail(res, error); }
  });
}
