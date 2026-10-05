import { validUserId as validId } from './memberships.js';
import { validateCart } from './products.js';
import { simulationEnabled } from './simulated-payments.js';

export const validOrderKey = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
export const orderError = (status, message) => Object.assign(new Error(message), { orderStatus: status });
export const orderIntent = items => JSON.stringify(items.map(({ productoId, cantidad }) => ({ productoId, cantidad })).sort((a, b) => a.productoId.localeCompare(b.productoId)));
export function publicOrder(value) {
  const { tipo, estado, total, moneda, creadoEn, actualizadoEn } = value;
  const payment = value.pagoSimulado;
  return { _id: value._id.toString(), tipo, estado, total, moneda, creadoEn, actualizadoEn,
    items: value.items.map(({ productoId, nombre, imagen, precioUnitario, cantidad, subtotal }) => ({ productoId, nombre, imagen, precioUnitario, cantidad, subtotal })),
    pagoSimulado: payment ? { tipo: payment.tipo, resultado: payment.resultado, monto: payment.monto, moneda: payment.moneda, registradaEn: payment.registradaEn } : null };
}
export function setupOrders(app, database, requireUser, now, options) {
  const enabled = simulationEnabled(options);
  const fail = (res, error) => res.status(error.orderStatus || 503).json({ message: error.orderStatus ? error.message : 'No se pudo confirmar la operación. Actualiza Mis pedidos o reintenta con la misma solicitud; no se duplicará el pedido ni el descuento de existencias.' });
  app.get('/api/pedidos', requireUser, async (req, res) => {
    const { despues, estado } = req.query;
    if (despues !== undefined && !validId(despues) || estado !== undefined && !['pendiente', 'pagado'].includes(estado)) return res.status(400).json({ message: 'Filtro de pedidos inválido.' });
    try {
      const rows = await database.listOrders(req.user.id, { despues, estado, limit: 21 });
      res.json({ pedidos: rows.slice(0, 20).map(publicOrder), siguiente: rows.length > 20 ? rows[19]._id.toString() : null, simulacionHabilitada: enabled });
    } catch (error) { fail(res, error); }
  });
  app.get('/api/pedidos/:id', requireUser, async (req, res) => {
    if (!validId(req.params.id)) return res.status(400).json({ message: 'Pedido inválido.' });
    try {
      const order = await database.findOrder(req.params.id, req.user.id);
      if (!order) return res.status(404).json({ message: 'No existe ese pedido en tu cuenta.' });
      res.json({ pedido: publicOrder(order) });
    } catch (error) { fail(res, error); }
  });
  app.post('/api/pedidos', requireUser, async (req, res) => {
    if (!enabled) return res.status(403).json({ message: 'Los pedidos simulados solo se crean en modo de desarrollo con la simulación habilitada.' });
    const body = req.body;
    const items = body && !Array.isArray(body) && typeof body === 'object' && Object.keys(body).length === 2 && validOrderKey(body.clave) ? validateCart({ items: body.items }) : null;
    if (!items) return res.status(400).json({ message: 'Envía una clave de intento UUID v4 y entre 1 y 20 productos distintos con cantidades de 1 a 99, sin importes ni datos adicionales.' });
    try {
      const result = await database.createOrder(req.user.id, body.clave, items, now());
      res.status(result.created ? 201 : 200).json({ message: result.created ? 'Pedido simulado creado. Revisa el importe en Mis pedidos antes de simular el pago. No se reservan existencias ni se realiza un cobro.' : 'Se recuperó el pedido de este intento. No se creó otro pedido.', pedido: publicOrder(result.order) });
    } catch (error) { fail(res, error); }
  });
  app.post('/api/pedidos/:id/pago-simulado', requireUser, async (req, res) => {
    if (!enabled) return res.status(403).json({ message: 'La simulación de pagos está deshabilitada en este servidor.' });
    const body = req.body;
    if (!validId(req.params.id) || !body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !['aprobado', 'rechazado'].includes(body.resultado)) return res.status(400).json({ message: 'Elige un pedido válido y un resultado aprobado o rechazado, sin datos adicionales.' });
    try {
      const order = await database.simulateOrderPayment(req.params.id, req.user.id, body.resultado, now());
      res.json({ message: body.resultado === 'aprobado' ? 'Pedido pagado en simulación. Las existencias se descontaron una sola vez; no hubo cobro real.' : 'Pago simulado rechazado. El pedido sigue pendiente y no se descontaron existencias.', pedido: publicOrder(order) });
    } catch (error) { fail(res, error); }
  });
}
