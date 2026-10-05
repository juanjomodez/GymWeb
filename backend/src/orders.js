import { validUserId as validId } from './memberships.js';
import { validateCart } from './products.js';
import { requireAdmin } from './auth.js';

export const validOrderKey = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
export const orderError = (status, message) => Object.assign(new Error(message), { orderStatus: status });
export const orderIntent = items => JSON.stringify(items.map(({ productoId, cantidad }) => ({ productoId, cantidad })).sort((a, b) => a.productoId.localeCompare(b.productoId)));
export function publicOrder(value, admin = false) {
  const { tipo, estado, total, moneda, creadoEn, actualizadoEn } = value;
  const payment = value.pagoSimulado;
  return { _id: value._id.toString(), tipo, estado, total, moneda, creadoEn, actualizadoEn,
    ...(tipo === 'compra' ? { metodoPago: 'gimnasio', entrega: 'recogida', pagadoEn: value.pagadoEn || null, entregadoEn: value.entregadoEn || null, canceladoEn: value.canceladoEn || null } : {}),
    ...(admin ? { comprador: { nombre: value.comprador?.nombre || '', correo: value.comprador?.correo || '' } } : {}),
    items: value.items.map(({ productoId, nombre, imagen, precioUnitario, cantidad, subtotal }) => ({ productoId, nombre, imagen, precioUnitario, cantidad, subtotal })),
    pagoSimulado: payment ? { tipo: payment.tipo, resultado: payment.resultado, monto: payment.monto, moneda: payment.moneda, registradaEn: payment.registradaEn } : null };
}
export function setupOrders(app, database, requireUser, now) {
  const states = ['pendiente', 'pagado', 'entregado', 'cancelado'];
  const filter = req => {
    const { despues, estado } = req.query;
    return despues !== undefined && !validId(despues) || estado !== undefined && !states.includes(estado) ? null : { despues, estado, limit: 21 };
  };
  const fail = (res, error) => res.status(error.orderStatus || 503).json({ message: error.orderStatus ? error.message : 'No se pudo confirmar la operación. Actualiza Mis compras o reintenta con la misma solicitud; no se duplicará la compra ni el movimiento de existencias.' });
  app.get('/api/pedidos', requireUser, async (req, res) => {
    const query = filter(req);
    if (!query) return res.status(400).json({ message: 'Filtro de pedidos inválido.' });
    try {
      const rows = await database.listOrders(req.user.id, query);
      res.json({ pedidos: rows.slice(0, 20).map(row => publicOrder(row)), siguiente: rows.length > 20 ? rows[19]._id.toString() : null });
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
    const body = req.body;
    const items = body && !Array.isArray(body) && typeof body === 'object' && Object.keys(body).length === 3 && ['clave', 'items', 'totalEsperado'].every(key => Object.hasOwn(body, key)) && validOrderKey(body.clave) && Number.isSafeInteger(body.totalEsperado) && body.totalEsperado > 0 ? validateCart({ items: body.items }) : null;
    if (!items) return res.status(400).json({ message: 'Revisa los productos, cantidades y total confirmado de la compra.' });
    try {
      const result = await database.createOrder(req.user.id, body.clave, items, now(), body.totalEsperado, req.user);
      res.status(result.created ? 201 : 200).json({ message: result.created ? 'Compra registrada. Tus productos están reservados; paga y recógelos en el gimnasio.' : 'Se recuperó la compra de este intento. No se creó otro pedido.', pedido: publicOrder(result.order) });
    } catch (error) { fail(res, error); }
  });
  app.get('/api/admin/pedidos', requireUser, requireAdmin, async (req, res) => {
    const query = filter(req);
    if (!query) return res.status(400).json({ message: 'Filtro de pedidos inválido.' });
    try {
      const rows = await database.listOrders(undefined, { ...query, tipo: 'compra' });
      res.json({ pedidos: rows.slice(0, 20).map(row => publicOrder(row, true)), siguiente: rows.length > 20 ? rows[19]._id.toString() : null });
    } catch (error) { fail(res, error); }
  });
  const messages = { pagar: 'Pago recibido en el gimnasio confirmado.', entregar: 'Entrega de la compra confirmada.', cancelar: 'Compra cancelada. Las unidades reservadas se devolvieron al inventario.' };
  for (const admin of [false, true]) for (const action of admin ? ['pagar', 'entregar', 'cancelar'] : ['cancelar']) {
    app.post(`/api/${admin ? 'admin/' : ''}pedidos/:id/${action}`, requireUser, ...(admin ? [requireAdmin] : []), async (req, res) => {
      if (!validId(req.params.id) || req.body !== undefined && (!req.body || Array.isArray(req.body) || typeof req.body !== 'object' || Object.keys(req.body).length)) return res.status(400).json({ message: 'La operación solo admite el identificador de la compra.' });
      try {
        const order = await database.changeOrder(req.params.id, action, req.user.id, now(), admin);
        res.json({ message: messages[action], pedido: publicOrder(order, admin) });
      } catch (error) { fail(res, error); }
    });
  }
  app.post('/api/pedidos/:id/pago-simulado', requireUser, (_req, res) => res.status(403).json({ message: 'Los pagos simulados de productos ya no están disponibles. Las compras se pagan en el gimnasio.' }));
}
