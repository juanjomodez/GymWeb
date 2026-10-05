import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/database.js';
import { initialProducts } from '../src/products.js';
import { memoryClient } from '../test-support/memory-client.js';

const aId = '123456789012345678901234', bId = '223456789012345678901234';
const productId = initialProducts[0]._id;
const item = (productoId = productId, cantidad = 2) => ({ productoId, cantidad });
async function fixture(t, options = { environment: 'development', demoPayments: true }) {
  const client = memoryClient();
  const db = createDatabase({ uri: 'mongodb://local-double', database: 'GymWeb' }, { clientFactory: () => client });
  for (const [token, userId, rol] of [['a', aId, 'usuario'], ['b', bId, 'admin']]) {
    client.rows('usuarios').push({ _id: new ObjectId(userId), nombre: 'Cuenta de prueba', correo: `${token}@example.invalid`, rol });
    client.rows('sesiones').push({ _id: createHash('sha256').update(token.repeat(64)).digest('hex'), userId, expiresAt: new Date('2100-01-01') });
  }
  const server = createApp(db, options).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, token = 'a', extra = {}) => fetch(base + path, { ...extra, headers: { ...(token ? { Cookie: `gym_session=${token.repeat(64)}` } : {}), ...extra.headers } });
  const post = (path, body, token = 'a', headers = {}) => request(path, token, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const create = (items = [item()], clave = randomUUID(), token = 'a') => post('/api/pedidos', { items, clave }, token);
  const pay = (id, resultado = 'aprobado', token = 'a') => post(`/api/pedidos/${id}/pago-simulado`, { resultado }, token);
  const product = (id = productId) => client.rows('productos').find(row => String(row._id) === id);
  return { client, db, request, post, create, pay, product };
}

test('pedidos y pagos requieren sesión; usuarios y administradores solo ven y pagan sus propios pedidos', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/pedidos', null)).status, 401);
  assert.equal((await f.create([item()], randomUUID(), null)).status, 401);
  const created = await f.create(); const order = (await created.json()).pedido;
  assert.equal((await f.request(`/api/pedidos/${order._id}`, null)).status, 401);
  assert.equal((await f.pay(order._id, 'aprobado', null)).status, 401);
  assert.equal((await f.request(`/api/pedidos/${order._id}`, 'b')).status, 404);
  assert.equal((await f.pay(order._id, 'aprobado', 'b')).status, 404);
  assert.equal((await (await f.request('/api/pedidos', 'b')).json()).pedidos.length, 0);
  assert.equal(f.product().stock, 10);
});

test('crear y pagar está apagado por defecto y en producción; el historial sigue legible', async t => {
  for (const options of [{}, { environment: 'production', demoPayments: true }, { environment: 'development', demoPayments: false }]) {
    const f = await fixture(t, options);
    assert.equal((await f.create()).status, 403);
    assert.equal((await f.pay('500000000000000000000004')).status, 403);
    assert.equal((await (await f.request('/api/pedidos')).json()).simulacionHabilitada, false);
    assert.equal(f.client.rows('pedidos').length, 0); assert.equal(f.client.rows('productos').length, 0);
  }
});

test('pedido copia precios y contenido del servidor, no reserva existencias ni exige membresía', async t => {
  const f = await fixture(t);
  const response = await f.create([item(), item(initialProducts[2]._id, 1)]);
  assert.equal(response.status, 201); assert.equal(response.headers.get('cache-control'), 'no-store');
  const order = (await response.json()).pedido;
  assert.equal(order.total, 335000); assert.equal(order.moneda, 'COP'); assert.equal(order.estado, 'pendiente'); assert.equal(order.tipo, 'simulado');
  assert.equal(order.items[0].precioUnitario, 150000); assert.equal(order.items[0].subtotal, 300000);
  assert.equal(order.userId, undefined); assert.equal(order.clave, undefined); assert.equal(f.product().stock, 10);
  await f.db.updateProduct(productId, 1, { nombre: 'Nombre nuevo', precio: 200000 });
  const saved = (await (await f.request(`/api/pedidos/${order._id}`)).json()).pedido;
  assert.equal(saved.items[0].nombre, 'Proteína'); assert.equal(saved.total, 335000);
  assert.equal((await f.pay(order._id)).status, 200); assert.equal(f.product().stock, 8);
});

test('misma clave y contenido recupera un solo pedido; usarla para otro contenido da conflicto', async t => {
  const f = await fixture(t); const key = randomUUID();
  const results = await Promise.all([f.create([item()], key), f.create([item()], key), f.create([item()], key)]);
  assert.deepEqual(results.map(response => response.status).sort(), [200, 200, 201]);
  const orders = await Promise.all(results.map(response => response.json())); assert.equal(new Set(orders.map(body => body.pedido._id)).size, 1);
  assert.equal((await f.create([item(productId, 3)], key)).status, 409);
  assert.equal(f.client.rows('pedidos').length, 1);
  assert.equal((await f.create([item()], key, 'b')).status, 201);
  assert.equal(f.client.rows('pedidos').length, 2);
  const index = f.client.operations.find(op => op.name === 'pedidos' && op.method === 'createIndex' && op.options?.unique);
  assert.deepEqual(index.keys, { userId: 1, clave: 1 });
});

test('respuesta perdida al crear se recupera con la misma clave incluso si el producto ya no está disponible', async t => {
  const f = await fixture(t); const key = randomUUID(); const actual = f.db.createOrder;
  f.db.createOrder = async (...args) => { await actual(...args); throw new Error('secret'); };
  const failed = await f.create([item()], key); assert.equal(failed.status, 503); assert.equal((await failed.text()).includes('secret'), false);
  f.db.createOrder = actual; await f.db.updateProduct(productId, 1, { disponible: false });
  const retry = await f.create([item()], key); assert.equal(retry.status, 200); assert.equal(f.client.rows('pedidos').length, 1);
});

test('rechazo mantiene pendiente y stock; aprobación posterior y reintentos descuentan una sola vez', async t => {
  const f = await fixture(t); const id = (await (await f.create()).json()).pedido._id;
  const rejected = await f.pay(id, 'rechazado'); assert.equal(rejected.status, 200);
  assert.equal((await rejected.json()).pedido.estado, 'pendiente'); assert.equal(f.product().stock, 10);
  const approvals = await Promise.all([f.pay(id), f.pay(id), f.pay(id)]); assert.deepEqual(approvals.map(response => response.status), [200, 200, 200]);
  const bodies = await Promise.all(approvals.map(response => response.json())); assert.deepEqual(bodies[0].pedido, bodies[2].pedido);
  assert.equal(f.product().stock, 8); assert.equal(f.product().version, 2);
  assert.equal(bodies[0].pedido.pagoSimulado.monto, 300000); assert.equal(bodies[0].pedido.pagoSimulado.tipo, 'simulado');
  assert.equal((await f.pay(id, 'rechazado')).status, 409); assert.equal(f.product().stock, 8);
});

test('dos pedidos compiten por el último stock: solo uno se paga y el otro permanece pendiente', async t => {
  const f = await fixture(t); await f.request('/api/productos'); await f.db.updateProduct(productId, 1, { stock: 2 });
  const first = (await (await f.create()).json()).pedido, second = (await (await f.create([item()], randomUUID(), 'b')).json()).pedido;
  const results = await Promise.all([f.pay(first._id), f.pay(second._id, 'aprobado', 'b')]);
  assert.deepEqual(results.map(response => response.status).sort(), [200, 409]); assert.equal(f.product().stock, 0);
  assert.deepEqual(f.client.rows('pedidos').map(order => order.estado).sort(), ['pagado', 'pendiente']);
});

test('falta de stock en un artículo revierte los descuentos anteriores de todo el pedido', async t => {
  const f = await fixture(t); const otherId = initialProducts[1]._id;
  const id = (await (await f.create([item(), item(otherId, 2)])).json()).pedido._id;
  await f.db.updateProduct(otherId, 1, { stock: 1 });
  assert.equal((await f.pay(id)).status, 409); assert.equal(f.product().stock, 10); assert.equal(f.product(otherId).stock, 1);
  assert.equal(f.client.rows('pedidos')[0].estado, 'pendiente'); assert.equal(f.client.rows('pedidos')[0].pagoSimulado, null);
  await f.db.updateProduct(otherId, 2, { stock: 5 }); assert.equal((await f.pay(id)).status, 200);
  assert.equal(f.product().stock, 8); assert.equal(f.product(otherId).stock, 3);
});

test('producto deshabilitado bloquea creación y aprobación; el descuento invalida versiones administrativas antiguas', async t => {
  const f = await fixture(t); const id = (await (await f.create()).json()).pedido._id;
  await f.db.updateProduct(productId, 1, { disponible: false });
  assert.equal((await f.create()).status, 409); assert.equal((await f.pay(id)).status, 409); assert.equal(f.product().stock, 10);
  await f.db.updateProduct(productId, 2, { disponible: true }); assert.equal((await f.pay(id)).status, 200);
  const stale = await f.post(`/api/admin/productos/${productId}/disponibilidad`, { disponible: false, version: 3 }, 'b');
  assert.equal(stale.status, 409); assert.equal(f.product().stock, 8);
});

test('fallo en la escritura de aprobación revierte inventario; respuesta perdida tras commit se recupera sin otro descuento', async t => {
  const f = await fixture(t); const id = (await (await f.create()).json()).pedido._id;
  const actualClientDb = f.client.db;
  f.client.db = () => ({ collection(name) {
    const collection = actualClientDb().collection(name);
    if (name === 'pedidos') collection.findOneAndUpdate = async () => { throw new Error('secret'); };
    return collection;
  } });
  const failed = await f.pay(id); assert.equal(failed.status, 503); assert.equal((await failed.text()).includes('secret'), false); assert.equal(f.product().stock, 10);
  f.client.db = actualClientDb;
  const actualPay = f.db.simulateOrderPayment; f.db.simulateOrderPayment = async (...args) => { await actualPay(...args); throw new Error('secret'); };
  assert.equal((await f.pay(id)).status, 503); assert.equal(f.product().stock, 8);
  f.db.simulateOrderPayment = actualPay; assert.equal((await f.pay(id)).status, 200); assert.equal(f.product().stock, 8);
});

test('validación y origen rechazan precios, usuarios, cantidades, claves e inyección', async t => {
  const f = await fixture(t); const key = randomUUID();
  for (const body of [null, [], {}, { clave: 'incorrecta', items: [item()] }, { clave: key, items: [] }, { clave: key, items: Array(21).fill(item()) }, { clave: key, items: [item(), item()] }, { clave: key, items: [item(productId, 0)] }, { clave: key, items: [item(productId, 100)] }, { clave: key, items: [item(productId, '2')] }, { clave: key, items: [{ ...item(), precio: 1 }] }, { clave: key, items: [item()], total: 1 }, { clave: key, items: [item()], userId: bId }, { clave: key, items: [item({ $ne: null })] }]) assert.equal((await f.post('/api/pedidos', body)).status, 400);
  assert.equal((await f.post('/api/pedidos', { clave: key, items: [item()] }, 'a', { Origin: 'https://otro.example' })).status, 403);
  const id = (await (await f.create()).json()).pedido._id;
  for (const body of [null, {}, { resultado: { $ne: null } }, { resultado: 'otro' }, { resultado: 'aprobado', monto: 1 }, { resultado: 'aprobado', userId: bId }]) assert.equal((await f.post(`/api/pedidos/${id}/pago-simulado`, body)).status, 400);
  assert.equal((await f.post(`/api/pedidos/${id}/pago-simulado`, { resultado: 'aprobado' }, 'a', { Origin: 'https://otro.example' })).status, 403);
  assert.equal(f.product().stock, 10);
});

test('historial pagina y filtra solo los propios pedidos, conserva comprobantes y no expone claves ni actores', async t => {
  const f = await fixture(t); const original = (await (await f.create()).json()).pedido;
  await f.pay(original._id);
  const stored = f.client.rows('pedidos')[0]; stored.pagoSimulado.secreto = 'secret';
  for (let i = 1; i <= 22; i++) f.client.rows('pedidos').push({ ...stored, _id: new ObjectId(i.toString(16).padStart(24, '0')), clave: randomUUID(), estado: 'pendiente', userId: i === 1 ? bId : aId });
  const firstResponse = await f.request('/api/pedidos'); assert.equal(firstResponse.headers.get('cache-control'), 'no-store'); const first = await firstResponse.json();
  assert.equal(first.pedidos.length, 20); assert.ok(first.siguiente);
  const second = await (await f.request(`/api/pedidos?despues=${first.siguiente}`)).json(); assert.equal(second.pedidos.length, 2);
  assert.equal(new Set([...first.pedidos, ...second.pedidos].map(order => order._id)).size, 22);
  assert.equal((await (await f.request('/api/pedidos?estado=pagado')).json()).pedidos.length, 1);
  assert.equal((await (await f.request('/api/pedidos', 'b')).json()).pedidos.length, 1);
  const detail = await f.request(`/api/pedidos/${original._id}`); const text = await detail.text(); assert.equal(text.includes('secret'), false); assert.equal(text.includes('clave'), false); assert.equal(text.includes('userId'), false);
  assert.equal((await f.request('/api/pedidos?estado=otro')).status, 400); assert.equal((await f.request('/api/pedidos?despues=incorrecto')).status, 400);
});

test('servidor sin soporte transaccional falla seguro y no ejecuta descuentos independientes', async t => {
  const f = await fixture(t); const id = (await (await f.create()).json()).pedido._id;
  f.client.startSession = () => ({ async withTransaction() { throw new Error('Transactions unsupported secret'); }, async endSession() {} });
  const response = await f.pay(id); assert.equal(response.status, 503); assert.equal((await response.text()).includes('secret'), false); assert.equal(f.product().stock, 10);
});
