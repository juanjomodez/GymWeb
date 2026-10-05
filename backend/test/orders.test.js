import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/database.js';
import { initialProducts } from '../src/products.js';
import { memoryClient } from '../test-support/memory-client.js';

const ids = { a: '123456789012345678901234', b: '223456789012345678901234', c: '323456789012345678901234' };
const productId = initialProducts[0]._id;
const item = (id = productId, cantidad = 2) => ({ productoId: id, cantidad });
async function fixture(t, options = {}) {
  const client = memoryClient(), clock = { value: new Date('2026-10-05T15:00:00Z') };
  const db = createDatabase({ uri: 'mongodb://local-double', database: 'GymWeb' }, { clientFactory: () => client });
  for (const token of Object.keys(ids)) {
    client.rows('usuarios').push({ _id: new ObjectId(ids[token]), nombre: 'Persona ' + token, correo: token + '@example.invalid', rol: token === 'b' ? 'admin' : 'usuario' });
    client.rows('sesiones').push({ _id: createHash('sha256').update(token.repeat(64)).digest('hex'), userId: ids[token], expiresAt: new Date('2100-01-01') });
  }
  const server = createApp(db, { ...options, now: () => new Date(clock.value) }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const request = (path, token = 'a', extra = {}) => fetch(base + path, { ...extra, headers: { ...(token ? { Cookie: 'gym_session=' + token.repeat(64) } : {}), ...extra.headers } });
  const post = (path, body, token = 'a', headers = {}) => request(path, token, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const product = (id = productId) => client.rows('productos').find(row => String(row._id) === id);
  const total = items => items.reduce((sum, row) => sum + (product(row.productoId)?.precio || initialProducts.find(p => p._id === row.productoId)?.precio || 1) * row.cantidad, 0);
  const create = (items = [item()], clave = randomUUID(), token = 'a', expected = total(items)) => post('/api/pedidos', { items, clave, totalEsperado: expected }, token);
  const action = (id, name, token = 'b', admin = true) => post('/api/' + (admin ? 'admin/' : '') + 'pedidos/' + id + '/' + name, {}, token);
  const ownCancel = (id, token = 'a') => action(id, 'cancelar', token, false);
  const order = async (...args) => { const response = await create(...args); assert.equal(response.status, 201, await response.clone().text()); return (await response.json()).pedido; };
  return { client, db, clock, request, post, product, create, action, ownCancel, order };
}

test('compra funciona en producción y demo, reserva stock y aparece en el perfil sin membresía', async t => {
  for (const options of [{}, { environment: 'production', demoPayments: true }, { environment: 'development', demoPayments: true }]) {
    const f = await fixture(t, options);
    const saved = await f.order([item(), item(initialProducts[2]._id, 1)]);
    assert.equal(saved.total, 335000); assert.equal(saved.tipo, 'compra'); assert.equal(saved.estado, 'pendiente');
    assert.equal(saved.metodoPago, 'gimnasio'); assert.equal(saved.entrega, 'recogida'); assert.equal(saved.pagoSimulado, null);
    assert.equal(f.product().stock, 8); assert.equal(f.product().version, 2);
    assert.equal((await (await f.request('/api/pedidos')).json()).pedidos[0]._id, saved._id);
    assert.equal((await f.post('/api/pedidos/' + saved._id + '/pago-simulado', { resultado: 'aprobado' })).status, 403);
    assert.equal(saved.userId, undefined); assert.equal(saved.clave, undefined); assert.equal(saved.comprador, undefined);
  }
});

test('precios e instantáneas provienen del servidor; cambio de precio exige nueva confirmación sin reservas parciales', async t => {
  const f = await fixture(t);
  await f.request('/api/productos');
  await f.db.updateProduct(productId, 1, { precio: 200000, nombre: 'Nombre actualizado' });
  assert.equal((await f.create([item()], randomUUID(), 'a', 300000)).status, 409);
  assert.equal(f.product().stock, 10); assert.equal(f.client.rows('pedidos').length, 0);
  const saved = await f.order();
  assert.equal(saved.total, 400000); assert.equal(saved.items[0].nombre, 'Nombre actualizado');
  await f.db.updateProduct(productId, 3, { precio: 250000, nombre: 'Otro nombre' });
  const detail = (await (await f.request('/api/pedidos/' + saved._id)).json()).pedido;
  assert.equal(detail.total, 400000); assert.equal(detail.items[0].nombre, 'Nombre actualizado');
});

test('sesión, propiedad y rol protegen compras, cancelaciones y confirmaciones administrativas', async t => {
  const f = await fixture(t);
  assert.equal((await f.create([item()], randomUUID(), null)).status, 401);
  assert.equal((await f.request('/api/admin/pedidos', null)).status, 401);
  assert.equal((await f.request('/api/admin/pedidos')).status, 403);
  const saved = await f.order();
  assert.equal((await f.request('/api/pedidos/' + saved._id, 'c')).status, 404);
  assert.equal((await f.ownCancel(saved._id, 'c')).status, 404);
  assert.equal((await f.action(saved._id, 'pagar', 'a')).status, 403);
  assert.equal((await f.action(saved._id, 'pagar', null)).status, 401);
  assert.equal((await f.post('/api/pedidos/' + saved._id + '/pagar', {})).status, 404);
  assert.equal((await (await f.request('/api/pedidos', 'b')).json()).pedidos.length, 0);
  const admin = (await (await f.request('/api/admin/pedidos', 'b')).json()).pedidos[0];
  assert.deepEqual(admin.comprador, { nombre: 'Persona a', correo: 'a@example.invalid' });
  assert.equal(admin.userId, undefined); assert.equal(admin.clave, undefined);
});

test('misma clave concurrente reserva una sola vez; cambiar contenido da conflicto', async t => {
  const f = await fixture(t), key = randomUUID();
  const results = await Promise.all([f.create([item()], key), f.create([item()], key), f.create([item()], key)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 200, 201]);
  const bodies = await Promise.all(results.map(r => r.json()));
  assert.equal(new Set(bodies.map(r => r.pedido._id)).size, 1);
  assert.equal(f.product().stock, 8); assert.equal(f.product().version, 2);
  assert.equal((await f.create([item(productId, 3)], key)).status, 409);
  assert.equal((await f.create([item()], key, 'c')).status, 201);
  assert.equal(f.product().stock, 6);
});

test('compras concurrentes compiten por las últimas unidades sin sobreventa', async t => {
  const f = await fixture(t); await f.request('/api/productos'); await f.db.updateProduct(productId, 1, { stock: 2 });
  const results = await Promise.all([f.create(), f.create([item()], randomUUID(), 'c')]);
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
  assert.equal(f.product().stock, 0); assert.equal(f.client.rows('pedidos').length, 1);
});

test('falta de stock o producto deshabilitado revierte toda la compra', async t => {
  const f = await fixture(t), otherId = initialProducts[1]._id; await f.request('/api/productos');
  await f.db.updateProduct(otherId, 1, { stock: 1 });
  assert.equal((await f.create([item(), item(otherId, 2)])).status, 409);
  assert.equal(f.product().stock, 10); assert.equal(f.client.rows('pedidos').length, 0);
  await f.db.updateProduct(otherId, 2, { disponible: false });
  assert.equal((await f.create([item(), item(otherId, 1)])).status, 409);
  assert.equal(f.product().stock, 10);
});

test('cancelar pendiente devuelve inventario una sola vez, incluso con producto deshabilitado', async t => {
  const f = await fixture(t), saved = await f.order();
  await f.db.updateProduct(productId, 2, { disponible: false });
  const results = await Promise.all([f.ownCancel(saved._id), f.ownCancel(saved._id), f.action(saved._id, 'cancelar')]);
  assert.ok(results.every(r => r.status === 200)); assert.equal(f.product().stock, 10);
  const cancelled = (await results[0].json()).pedido;
  assert.equal(cancelled.estado, 'cancelado'); assert.ok(cancelled.canceladoEn);
  assert.equal((await f.action(saved._id, 'pagar')).status, 409);
  assert.equal((await f.create([item()], f.client.rows('pedidos')[0].clave)).status, 200);
  assert.equal(f.product().stock, 10);
});

test('administrador confirma pago y entrega sin volver a descontar stock; reintentos conservan fechas', async t => {
  const f = await fixture(t), saved = await f.order();
  assert.equal((await f.action(saved._id, 'entregar')).status, 409);
  const results = await Promise.all([f.action(saved._id, 'pagar'), f.action(saved._id, 'pagar')]);
  assert.ok(results.every(r => r.status === 200));
  const paid = (await results[0].json()).pedido; assert.equal(paid.estado, 'pagado'); assert.ok(paid.pagadoEn);
  assert.equal(f.product().stock, 8); assert.equal(f.product().version, 2);
  assert.equal((await f.ownCancel(saved._id)).status, 409);
  assert.equal((await f.action(saved._id, 'cancelar')).status, 409);
  f.clock.value = new Date('2026-10-06T15:00:00Z');
  const delivered = (await (await f.action(saved._id, 'entregar')).json()).pedido;
  assert.equal(delivered.estado, 'entregado'); assert.equal(delivered.pagadoEn, paid.pagadoEn);
  assert.equal((await (await f.action(saved._id, 'entregar')).json()).pedido.entregadoEn, delivered.entregadoEn);
  assert.equal((await (await f.action(saved._id, 'pagar')).json()).pedido.estado, 'entregado');
  assert.equal(f.product().stock, 8);
});

test('pago y cancelación concurrentes conservan una sola decisión e inventario coherente', async t => {
  const f = await fixture(t), saved = await f.order();
  const results = await Promise.all([f.action(saved._id, 'pagar'), f.ownCancel(saved._id)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  const state = f.client.rows('pedidos')[0].estado;
  assert.ok(['pagado', 'cancelado'].includes(state)); assert.equal(f.product().stock, state === 'cancelado' ? 10 : 8);
});

test('fallo de escritura de compra o cancelación revierte el inventario completo', async t => {
  const f = await fixture(t), actual = f.client.db;
  f.client.db = () => ({ collection(name) { const c = actual().collection(name); if (name === 'pedidos') c.insertOne = async () => { throw new Error('secret'); }; return c; } });
  const failed = await f.create(); assert.equal(failed.status, 503); assert.equal((await failed.text()).includes('secret'), false);
  assert.equal(f.product().stock, 10);
  f.client.db = actual; const saved = await f.order();
  f.client.db = () => ({ collection(name) { const c = actual().collection(name); if (name === 'pedidos') c.findOneAndUpdate = async () => { throw new Error('secret'); }; return c; } });
  assert.equal((await f.ownCancel(saved._id)).status, 503);
  assert.equal(f.product().stock, 8); assert.equal(f.client.rows('pedidos')[0].estado, 'pendiente');
});

test('respuesta perdida tras compra o cancelación se recupera sin duplicar descuentos ni devoluciones', async t => {
  const f = await fixture(t), key = randomUUID(), actual = f.db.createOrder;
  f.db.createOrder = async (...args) => { await actual(...args); throw new Error('secret'); };
  assert.equal((await f.create([item()], key)).status, 503); assert.equal(f.product().stock, 8);
  f.db.createOrder = actual; await f.db.updateProduct(productId, 2, { disponible: false });
  const retry = await f.create([item()], key); assert.equal(retry.status, 200);
  const saved = (await retry.json()).pedido, change = f.db.changeOrder;
  f.db.changeOrder = async (...args) => { await change(...args); throw new Error('secret'); };
  assert.equal((await f.ownCancel(saved._id)).status, 503); assert.equal(f.product().stock, 10);
  f.db.changeOrder = change; assert.equal((await f.ownCancel(saved._id)).status, 200); assert.equal(f.product().stock, 10);
});

test('validación y origen rechazan importes manipulados, otros usuarios, claves y cantidades inválidas', async t => {
  const f = await fixture(t), key = randomUUID();
  const good = { clave: key, items: [item()], totalEsperado: 300000 };
  for (const body of [null, [], {}, { ...good, clave: 'otro' }, { ...good, items: [] }, { ...good, items: [item(), item()] }, { ...good, items: [item(productId, 0)] }, { ...good, items: [item(productId, 100)] }, { ...good, items: [{ ...item(), precio: 1 }] }, { ...good, userId: ids.b }, { ...good, totalEsperado: '300000' }, { ...good, totalEsperado: 0 }]) assert.equal((await f.post('/api/pedidos', body)).status, 400);
  assert.equal((await f.post('/api/pedidos', good, 'a', { Origin: 'https://otro.example' })).status, 403);
  assert.equal((await f.post('/api/pedidos', { ...good, totalEsperado: 1 })).status, 409);
  const saved = await f.order();
  assert.equal((await f.post('/api/admin/pedidos/' + saved._id + '/pagar', { total: 1 }, 'b')).status, 400);
  assert.equal((await f.post('/api/admin/pedidos/' + saved._id + '/pagar', {}, 'b', { Origin: 'https://otro.example' })).status, 403);
});

test('historial propio y administrativo paginan, filtran y ocultan claves y auditoría', async t => {
  const f = await fixture(t), saved = await f.order();
  const stored = f.client.rows('pedidos')[0];
  for (let i = 1; i <= 22; i++) f.client.rows('pedidos').push({ ...stored, _id: new ObjectId(i.toString(16).padStart(24, '0')), clave: randomUUID(), userId: i === 1 ? ids.c : ids.a });
  const firstResponse = await f.request('/api/pedidos'); assert.equal(firstResponse.headers.get('cache-control'), 'no-store');
  const first = await firstResponse.json(), second = await (await f.request('/api/pedidos?despues=' + first.siguiente)).json();
  assert.equal(first.pedidos.length, 20); assert.equal(second.pedidos.length, 2);
  assert.equal(new Set([...first.pedidos, ...second.pedidos].map(p => p._id)).size, 22);
  assert.equal((await (await f.request('/api/pedidos', 'c')).json()).pedidos.length, 1);
  await f.action(saved._id, 'pagar'); await f.action(saved._id, 'entregar');
  assert.equal((await (await f.request('/api/pedidos?estado=entregado')).json()).pedidos.length, 1);
  assert.equal((await (await f.request('/api/admin/pedidos?estado=pendiente', 'b')).json()).pedidos.length, 20);
  const detail = await (await f.request('/api/pedidos/' + saved._id)).text();
  for (const field of ['userId', 'clave', 'pagadoPor', 'entregadoPor']) assert.equal(detail.includes(field), false);
  assert.equal((await f.request('/api/pedidos?estado=otro')).status, 400);
  assert.equal((await f.request('/api/admin/pedidos?despues=otro', 'b')).status, 400);
});

test('pedidos simulados anteriores permanecen legibles sin convertirse en compras ni permitir pagos', async t => {
  const f = await fixture(t), saved = await f.order(), stored = f.client.rows('pedidos')[0];
  stored.tipo = 'simulado'; stored.pagoSimulado = { tipo: 'simulado', resultado: 'aprobado', monto: stored.total, moneda: 'COP', registradaEn: stored.creadoEn, secreto: 'secret' };
  assert.equal((await f.action(saved._id, 'pagar')).status, 409);
  assert.equal((await f.ownCancel(saved._id)).status, 409);
  assert.equal((await f.create([item()], stored.clave)).status, 409);
  assert.equal((await (await f.request('/api/admin/pedidos', 'b')).json()).pedidos.length, 0);
  const detail = await (await f.request('/api/pedidos/' + saved._id)).text();
  assert.equal(detail.includes('secret'), false); assert.ok(detail.includes('simulado'));
});

test('sin soporte transaccional falla seguro sin compras o reservas independientes', async t => {
  const f = await fixture(t);
  f.client.startSession = () => ({ async withTransaction() { throw new Error('secret'); }, async endSession() {} });
  const response = await f.create(); assert.equal(response.status, 503); assert.equal((await response.text()).includes('secret'), false);
  assert.equal(f.product().stock, 10); assert.equal(f.client.rows('pedidos').length, 0);
});
