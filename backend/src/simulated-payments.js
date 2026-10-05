import { membershipEnd, publicMembership, publicSimulatedPayment } from './memberships.js';

export const simulationEnabled = ({ environment, demoPayments } = {}) => environment === 'development' && demoPayments === true;

export function setupSimulatedPayments(app, database, requireUser, now, options) {
  const enabled = simulationEnabled(options);
  app.get('/api/pagos/simulacion', requireUser, (_req, res) => res.json({ habilitada: enabled }));
  app.post('/api/pagos/simulados', requireUser, async (req, res) => {
    if (!enabled) return res.status(403).json({ message: 'La simulación de pagos está deshabilitada en este servidor.' });
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !['aprobado', 'rechazado'].includes(body.resultado)) {
      return res.status(400).json({ message: 'Elige un resultado de simulación: aprobado o rechazado.' });
    }
    try {
      const instant = now();
      const stored = await database.simulateMembershipPayment(req.user.id, body.resultado, instant, membershipEnd(instant));
      if (!stored) return res.status(404).json({ message: 'Primero solicita una membresía para simular su pago.' });
      const membership = publicMembership(stored, now());
      const payment = publicSimulatedPayment(stored.pagoSimulado);
      const accepted = payment?.resultado === body.resultado && (
        body.resultado === 'aprobado'
          ? stored.activacionOrigen === 'pago-simulado' && ['activa', 'vencida'].includes(stored.estado)
          : stored.estado === 'pendiente' && stored.periodo === 'mes' && stored.inicio == null && stored.fin == null
            && Number.isSafeInteger(stored.precio) && stored.precio >= 0 && stored.moneda === 'COP'
            && payment.monto === stored.precio && payment.moneda === stored.moneda
      );
      if (!accepted) return res.status(409).json({ message: 'Solo se simula el pago de una solicitud pendiente mensual. Una membresía activada por administrador o vencida no se reactiva.' });
      res.json({
        message: body.resultado === 'rechazado' ? 'Pago simulado rechazado. La membresía sigue pendiente; no hubo ningún cobro.'
          : membership.accesoActivo ? 'Pago simulado aprobado. Tu membresía está activa; no hubo ningún cobro.'
            : 'Este pago simulado ya fue aprobado. Se conservan sus fechas; la membresía ya venció.',
        pago: payment, membresia: membership,
      });
    } catch { res.status(503).json({ message: 'No se pudo confirmar el pago simulado. Actualiza tu membresía o vuelve a intentarlo; las fechas de una aprobación se conservan.' }); }
  });
}
