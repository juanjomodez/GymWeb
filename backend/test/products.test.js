import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/database.js';
import { initialProducts, validateProduct } from '../src/products.js';
import { memoryClient } from '../test-support/memory-client.js';

const userId = '123456789012345678901234', adminId = '223456789012345678901234';
const productId = initialProducts[0]._id;
const input = { nombre: ' Producto de prueba ', descripcion: ' Descripción del producto de prueba. ', precio: 42000, stock: 3, imagen: 'img/shaker.jpg', disponible: true };
async function fixture(t) {
  const client = memoryClient();
  const db = createDatabase({ uri: 'mongodb://local-double', database: 'GymWeb' }, { clientFactory: () => client });
  const admin = { _id: new ObjectId(adminId), nombre: 'Admin', correo: 'admin@example.invalid', rol: 'admin' };
  client.rows('usuarios').push({ _id: new ObjectId(userId), nombre: 'Ana', correo: 'ana@example.invalid' }, admin);
  for (const [token, id] of [['a', userId], ['b', adminId]]) client.rows('sesiones').push({ _id: createHash('sha256').update(token.repeat(64)).digest('hex'), userId: id, expiresAt: new Date('2100-01-01') });
  const server = createApp(db).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, token = null, extra = {}) => fetch(base + path, { ...extra, headers: { ...(token ? { Cookie: `gym_session=${token.repeat(64)}` } : {}), ...extra.headers } });
  const post = (path, body, token = 'b', extraHeaders = {}) => request(path, token, { method: 'POST', headers: { 'Content-Type': 'application/json', ...extraHeaders }, body: JSON.stringify(body) });
  const quote = items => post('/api/carrito/verificar', { items }, null);
  return { db, client, admin, request, post, quote };
}

test('catálogo público inicial persiste, usa COP y no sobrescribe cambios al reiniciar la base', async t => {
  const f = await fixture(t);
  const response = await f.request('/api/productos');
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json(); assert.equal(body.productos.length, 3); assert.equal(body.siguiente, null);
  assert.equal(body.productos[0].precio, 150000); assert.equal(body.productos[0].moneda, 'COP');
  assert.equal(body.productos[0].creadaPor, undefined); assert.equal(body.productos[0].version, undefined);
  const original = f.client.rows('productos')[0]; Object.assign(original, { precio: 175000, stock: 0, disponible: false, version: 7 });
  const restarted = createDatabase({ uri: 'mongodb://local-double', database: 'GymWeb' }, { clientFactory: () => f.client });
  assert.equal((await restarted.listProducts({ disponible: true, limit: 21 })).length, 2);
  assert.equal(original.precio, 175000); assert.equal(original.stock, 0); assert.equal(original.version, 7);
  assert.equal(f.client.rows('productos').length, 3);
});

test('solo administrador gestiona productos; permisos falsificados y rol revocado se rechazan', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/admin/productos')).status, 401);
  assert.equal((await f.request('/api/admin/productos', 'a')).status, 403);
  for (const [path, body] of [['/api/admin/productos', input], [`/api/admin/productos/${productId}`, { ...input, version: 1 }], [`/api/admin/productos/${productId}/disponibilidad`, { disponible: false, version: 1 }]]) {
    assert.equal((await f.post(path, body, null)).status, 401);
    assert.equal((await f.post(path, { ...body, rol: 'admin' }, 'a', { 'X-Role': 'admin' })).status, 403);
  }
  f.admin.rol = 'usuario'; assert.equal((await f.post('/api/admin/productos', input)).status, 403);
  assert.equal(f.client.rows('productos').length, 0);
});

test('crear y editar conserva COP, auditoría y versión; el catálogo no exige membresía', async t => {
  const f = await fixture(t);
  const created = await f.post('/api/admin/productos', input); assert.equal(created.status, 201);
  const product = (await created.json()).producto;
  assert.equal(product.nombre, input.nombre.trim()); assert.equal(product.version, 1);
  const stored = f.client.rows('productos').find(row => String(row._id) === product._id);
  assert.equal(stored.creadaPor, adminId); assert.ok(stored.creadaEn instanceof Date);
  assert.equal(product.creadaPor, undefined);
  const edited = await f.post(`/api/admin/productos/${product._id}`, { ...input, precio: 55000, stock: 7, version: 1 });
  assert.equal(edited.status, 200); assert.equal((await edited.json()).producto.version, 2);
  const detail = await f.request(`/api/productos/${product._id}`, 'a'); assert.equal(detail.status, 200);
  assert.equal((await detail.json()).producto.precio, 55000); assert.equal(stored.actualizadaPor, adminId);
});

test('deshabilitar retira lista, detalle y cotización; habilitar conserva documento y condiciones', async t => {
  const f = await fixture(t); await f.request('/api/productos');
  const path = `/api/admin/productos/${productId}/disponibilidad`;
  assert.equal((await f.post(path, { disponible: false, version: 1 })).status, 200);
  assert.equal((await f.request(`/api/productos/${productId}`)).status, 404);
  assert.equal((await (await f.request('/api/productos')).json()).productos.length, 2);
  const quote = await f.quote([{ productoId: productId, cantidad: 2 }]); const body = await quote.json();
  assert.equal(body.items.length, 0); assert.equal(body.total, 0); assert.equal(body.cambios.length, 1);
  assert.equal((await f.post(path, { disponible: true, version: 2 })).status, 200);
  assert.equal((await f.request(`/api/productos/${productId}`)).status, 200); assert.equal(f.client.rows('productos').length, 3);
});

test('ediciones y disponibilidad concurrentes detectan conflicto sin sobrescribir la primera', async t => {
  const f = await fixture(t); await f.request('/api/productos');
  const results = await Promise.all([f.post(`/api/admin/productos/${productId}`, { ...input, version: 1 }), f.post(`/api/admin/productos/${productId}/disponibilidad`, { disponible: false, version: 1 })]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  assert.equal(f.client.rows('productos')[0].version, 2);
  const operation = f.client.operations.find(op => op.name === 'productos' && op.method === 'findOneAndUpdate');
  assert.equal(operation.filter.version, 1); assert.equal(operation.update.$inc.version, 1); assert.equal(operation.options.returnDocument, 'after');
  assert.equal((await f.post('/api/admin/productos/600000000000000000000001', { ...input, version: 1 })).status, 404);
});

test('validación rechaza importes, cantidades, imágenes externas, campos internos y operaciones inválidas', async t => {
  const f = await fixture(t);
  for (const changes of [{ precio: 0 }, { precio: 1.5 }, { precio: '42000' }, { precio: 100000001 }, { stock: -1 }, { stock: 1.5 }, { stock: 10000 }, { imagen: 'javascript:alert(1)' }, { imagen: 'https://otro.example/imagen.jpg' }, { imagen: '../backend/.env' }, { moneda: 'USD' }, { creadaPor: userId }, { version: 1 }, { $set: { precio: 1 } }, { disponible: 'true' }, { nombre: 'a' }, { descripcion: 'x' }]) {
    assert.equal(validateProduct({ ...input, ...changes }), null);
    assert.equal((await f.post('/api/admin/productos', { ...input, ...changes })).status, 400);
  }
  for (const body of [null, [], {}, { ...input, version: 0 }]) assert.equal((await f.post(`/api/admin/productos/${productId}`, body)).status, 400);
  assert.equal((await f.post(`/api/admin/productos/${productId}/disponibilidad`, { disponible: false, version: 1, precio: 1 })).status, 400);
  assert.equal((await f.request('/api/productos/no-valido')).status, 400);
});

test('paginación estable y filtros administrativos incluyen agotados y excluyen deshabilitados de público', async t => {
  const f = await fixture(t); await f.request('/api/productos');
  for (let i = 1; i <= 22; i++) f.client.rows('productos').push({ ...validateProduct(input), _id: new ObjectId(i.toString(16).padStart(24, '0')), version: 1, stock: 0, disponible: i !== 1 });
  const first = (await (await f.request('/api/productos')).json()); assert.equal(first.productos.length, 20); assert.ok(first.siguiente);
  const second = (await (await f.request(`/api/productos?despues=${first.siguiente}`)).json()); assert.equal(second.productos.length, 4); assert.equal(second.siguiente, null);
  assert.equal(new Set([...first.productos, ...second.productos].map(product => product._id)).size, 24);
  const hidden = await f.request('/api/admin/productos?disponibilidad=deshabilitados', 'b'); assert.equal((await hidden.json()).productos.length, 1);
  for (const path of ['/api/productos?despues=abc', '/api/admin/productos?disponibilidad=otro']) assert.equal((await f.request(path, 'b')).status, 400);
  // Express ignora parámetros desconocidos: nunca llegan a la consulta MongoDB.
  assert.equal((await f.request('/api/productos?despues[$ne]=1')).status, 200);
  assert.deepEqual(f.client.operations.filter(op => op.name === 'productos' && op.method === 'find').at(-1).filter, { disponible: true });
});

test('cotización usa precios del servidor, limita existencias y elimina retirados sin descontar stock', async t => {
  const f = await fixture(t); await f.request('/api/productos');
  const products = f.client.rows('productos'); products[0].precio = 180000; products[0].stock = 2; products[1].stock = 0; products[2].disponible = false;
  const response = await f.quote([{ productoId: productId, cantidad: 5 }, { productoId: initialProducts[1]._id, cantidad: 1 }, { productoId: initialProducts[2]._id, cantidad: 1 }, { productoId: '600000000000000000000001', cantidad: 1 }]);
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json(); assert.equal(body.total, 360000); assert.equal(body.moneda, 'COP'); assert.equal(body.items.length, 1); assert.equal(body.cambios.length, 4);
  assert.equal(body.items[0].cantidad, 2); assert.equal(body.items[0].producto.precio, 180000); assert.equal(body.items[0].producto.creadaPor, undefined);
  assert.equal(products[0].stock, 2); assert.equal(products[0].version, 1); assert.equal(f.client.rows('pedidos').length, 0);
});

test('cotización rechaza manipulación de importes, cantidades, duplicados y cuerpos sin límite', async t => {
  const f = await fixture(t); const item = { productoId: productId, cantidad: 1 };
  for (const body of [null, [], {}, { items: [] }, { items: [item], total: 1 }, { items: [{ ...item, precio: 1 }] }, { items: [item, item] }, { items: Array(21).fill(item) }, { items: [{ ...item, cantidad: 0 }] }, { items: [{ ...item, cantidad: 100 }] }, { items: [{ ...item, cantidad: 1.5 }] }, { items: [{ ...item, cantidad: '1' }] }, { items: [{ ...item, productoId: { $ne: null } }] }]) assert.equal((await f.post('/api/carrito/verificar', body, null)).status, 400);
  assert.equal(f.client.rows('productos').length, 0);
});

test('origen externo y datos de auditoría no pasan; texto con HTML se trata como texto', async t => {
  const f = await fixture(t);
  assert.equal((await f.post('/api/admin/productos', input, 'b', { Origin: 'https://otro.example' })).status, 403);
  assert.equal((await f.post('/api/carrito/verificar', { items: [{ productoId: productId, cantidad: 1 }] }, null, { Origin: 'https://otro.example' })).status, 403);
  const created = await f.post('/api/admin/productos', { ...input, nombre: '<img src=x onerror=alert(1)>', descripcion: '<script>texto de prueba</script>' });
  assert.equal(created.status, 201); const id = (await created.json()).producto._id;
  const data = await (await f.request(`/api/productos/${id}`)).json(); assert.equal(data.producto.nombre, '<img src=x onerror=alert(1)>'); assert.equal(data.producto.actualizadaPor, undefined);
});

test('fallos de persistencia y condiciones corruptas devuelven 503 sin filtrar secretos', async t => {
  const f = await fixture(t); await f.request('/api/productos');
  f.client.rows('productos')[0].precio = 'incorrecto'; assert.equal((await f.quote([{ productoId: productId, cantidad: 1 }])).status, 503);
  for (const [method, request] of [['listProducts', () => f.request('/api/productos')], ['findProduct', () => f.request(`/api/productos/${productId}`)], ['createProduct', () => f.post('/api/admin/productos', input)], ['updateProduct', () => f.post(`/api/admin/productos/${productId}`, { ...input, version: 1 })]]) {
    f.db[method] = async () => { throw new Error('secret-mongodb-uri'); };
    const response = await request(); assert.equal(response.status, 503); assert.equal((await response.text()).includes('secret'), false);
  }
});
