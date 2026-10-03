import { requireAdmin } from './auth.js';

// Un mes calendario en UTC: conserva la hora y limita el día al último del mes.
export function membershipEnd(start) {
  const end = new Date(start);
  if (!Number.isFinite(end.getTime())) throw new Error('Fecha inválida');
  const day = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(day, lastDay));
  return end;
}

export const validUserId = value => typeof value === 'string' && /^[a-f0-9]{24}$/.test(value);

export function publicSimulatedPayment(value) {
  if (value?.tipo !== 'simulado') return null;
  const { tipo, resultado, monto, moneda, registradaEn } = value;
  return { tipo, resultado, monto, moneda, registradaEn };
}

export function publicMembership(value, now) {
  if (!value) return null;
  const { _id, planId, planNombre, precio, moneda, periodo, maxPersonas, estado, solicitadaEn, inicio, fin } = value;
  // El acceso nunca depende solo de una etiqueta que pudiera quedar desactualizada.
  const accesoActivo = estado === 'activa' && inicio instanceof Date && fin instanceof Date && inicio <= now && fin > now;
  return { _id, planId, planNombre, precio, moneda, periodo, maxPersonas, estado, solicitadaEn, inicio, fin, accesoActivo, pagoSimulado: publicSimulatedPayment(value.pagoSimulado) };
}

export function setupAdministration(app, database, requireUser, now) {
  app.get('/api/admin/membresias', requireUser, requireAdmin, async (req, res) => {
    const estado = req.query.estado || 'pendiente';
    const despues = req.query.despues;
    if (!['pendiente', 'activa', 'vencida'].includes(estado) || despues !== undefined && !validUserId(despues)) {
      return res.status(400).json({ message: 'Filtro de membresías inválido.' });
    }
    try {
      const instant = now();
      const rows = await database.listMemberships({ estado, despues, now: instant, limit: 51 });
      const page = rows.slice(0, 50);
      res.json({
        membresias: page.map(row => ({ ...publicMembership(row, instant), usuario: row.usuario || null })),
        siguiente: rows.length > 50 ? page.at(-1)._id : null,
      });
    } catch { res.status(503).json({ message: 'No se pudieron cargar las membresías.' }); }
  });
  app.post('/api/admin/membresias/:userId/activar', requireUser, requireAdmin, async (req, res) => {
    if (!validUserId(req.params.userId)) return res.status(400).json({ message: 'Usuario inválido.' });
    // Sin fechas ni condiciones editables desde el navegador.
    if (req.body !== undefined && (req.body === null || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length)) {
      return res.status(400).json({ message: 'La activación no admite datos adicionales.' });
    }
    try {
      const instant = now();
      const result = await database.activateMembership(req.params.userId, req.user.id, instant, membershipEnd(instant));
      if (!result) return res.status(404).json({ message: 'No existe una membresía para ese usuario.' });
      const membership = publicMembership(result, instant);
      if (!membership.accesoActivo) return res.status(409).json({ message: 'Solo se pueden activar solicitudes pendientes de un plan mensual. Las vencidas no se reactivan.' });
      res.json({ message: 'Membresía activa. Los reintentos conservan las fechas originales.', membresia: membership });
    } catch { res.status(503).json({ message: 'No se pudo activar la membresía. Puedes volver a intentarlo.' }); }
  });
}
