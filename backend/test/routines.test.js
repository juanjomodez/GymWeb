import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/database.js';
import { validateRoutine } from '../src/routines.js';
import { memoryClient } from '../test-support/memory-client.js';

const memberId = '123456789012345678901234';
const adminId = '223456789012345678901234';
const routineId = '423456789012345678901234';
const input = {
  nombre: ' Rutina general de prueba ', objetivo: ' Objetivo de la rutina de prueba. ', nivel: 'principiante', disponible: true,
  ejercicios: [{ nombre: ' Ejercicio de prueba ', series: 3, repeticiones: ' 8–12 ', descansoSegundos: 60 }],
};
async function fixture(t) {
  const client = memoryClient();
  const db = createDatabase({ uri: 'mongodb://local-double', database: 'GymWeb' }, { clientFactory: () => client });
  const admin = { _id: new ObjectId(adminId), nombre: 'Admin', correo: 'admin@example.invalid', rol: 'admin' };
  client.rows('usuarios').push({ _id: new ObjectId(memberId), nombre: 'Ana', correo: 'ana@example.invalid' }, admin);
  for (const [token, userId] of [['a', memberId], ['b', adminId]]) {
    const tokenHash = createHash('sha256').update(token.repeat(64)).digest('hex');
    client.rows('sesiones').push({ _id: tokenHash, userId, expiresAt: new Date('2100-01-01') });
  }
  const clock = { value: new Date('2026-10-03T12:00:00Z') };
  const membership = { _id: memberId, planId: 'basico', estado: 'activa', inicio: new Date('2026-10-01'), fin: new Date('2026-11-01') };
  client.rows('membresias').push(membership);
  const server = createApp(db, { now: () => new Date(clock.value) }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, token = 'b', options = {}) => fetch(base + path, {
    ...options, headers: { ...(token ? { Cookie: `gym_session=${token.repeat(64)}` } : {}), ...options.headers },
  });
  const post = (path, body, token = 'b', headers = {}) => request(path, token, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const seed = (overrides = {}) => {
    const routine = { ...validateRoutine(input), _id: new ObjectId(routineId), version: 1, creadaEn: new Date(clock.value), actualizadaEn: new Date(clock.value), creadaPor: adminId, actualizadaPor: adminId, ...overrides };
    client.rows('rutinas').push(routine);
    return routine;
  };
  return { db, client, clock, admin, membership, request, post, seed, base };
}

test('rutinas exigen sesión; usuarios comunes no administran aunque falsifiquen permisos', async t => {
  const f = await fixture(t);
  f.seed();
  for (const path of ['/api/rutinas', `/api/rutinas/${routineId}`, '/api/admin/rutinas']) assert.equal((await f.request(path, null)).status, 401);
  assert.equal((await f.request('/api/admin/rutinas', 'a')).status, 403);
  for (const [path, payload] of [
    ['/api/admin/rutinas', { ...input, rol: 'admin' }],
    [`/api/admin/rutinas/${routineId}`, { ...input, version: 1 }],
    [`/api/admin/rutinas/${routineId}/disponibilidad`, { disponible: false, version: 1 }],
  ]) {
    assert.equal((await f.post(path, payload, null)).status, 401);
    assert.equal((await f.post(path, payload, 'a', { 'X-Role': 'admin' })).status, 403);
  }
  assert.equal(f.client.rows('rutinas').length, 1);
  assert.equal(f.client.rows('rutinas')[0].version, 1);
});

test('solo membresía vigente da acceso: pendiente, vencida, ausente, fechas inválidas o inicio futuro bloquean lectura', async t => {
  const f = await fixture(t);
  f.seed();
  for (const changes of [
    { estado: 'pendiente' }, { estado: 'vencida' }, { estado: 'cancelada' },
    { estado: 'activa', inicio: new Date('2026-10-04') },
    { estado: 'activa', inicio: null }, { estado: 'activa', inicio: new Date('2026-10-01'), fin: null },
    { estado: 'activa', inicio: new Date(NaN), fin: new Date('2026-11-01') },
  ]) {
    Object.assign(f.membership, { inicio: new Date('2026-10-01'), fin: new Date('2026-11-01') }, changes);
    for (const path of ['/api/rutinas', `/api/rutinas/${routineId}`]) {
      const response = await f.request(path, 'a');
      assert.equal(response.status, 403);
      assert.equal((await response.text()).includes('Ejercicio de prueba'), false);
    }
  }
  f.client.rows('membresias').length = 0;
  assert.equal((await f.request('/api/rutinas', 'a')).status, 403);
  assert.equal(f.client.operations.filter(op => op.name === 'rutinas').length, 0);
});

test('todos los planes acceden a las mismas rutinas generales; no se exponen auditoría ni versiones', async t => {
  const f = await fixture(t);
  f.seed();
  for (const planId of ['basico', 'familiar', 'premium-individual', 'premium-familiar']) {
    f.membership.planId = planId;
    const response = await f.request('/api/rutinas', 'a');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json();
    assert.equal(body.accesoHasta, '2026-11-01T00:00:00.000Z');
    assert.equal(body.rutinas[0]._id, routineId);
    assert.equal(body.rutinas[0].ejercicios[0].series, 3);
    assert.equal(body.rutinas[0].version, undefined);
    assert.equal(body.rutinas[0].creadaPor, undefined);
    assert.equal(body.rutinas[0].actualizadaPor, undefined);
  }
  const detail = await f.request(`/api/rutinas/${routineId}`, 'a');
  assert.equal(detail.status, 200);
  assert.equal((await detail.json()).rutina.nombre, input.nombre.trim());
});

test('vencimiento exacto bloquea y persiste; también bloquea si vence durante la consulta a MongoDB', async t => {
  const f = await fixture(t);
  f.seed();
  f.clock.value = new Date(f.membership.fin.getTime() - 1);
  assert.equal((await f.request('/api/rutinas', 'a')).status, 200);
  f.clock.value = new Date(f.membership.fin);
  assert.equal((await f.request(`/api/rutinas/${routineId}`, 'a')).status, 403);
  assert.equal(f.membership.estado, 'vencida');
  f.membership.estado = 'activa';
  f.clock.value = new Date(f.membership.fin.getTime() - 1);
  const actualList = f.db.listRoutines;
  f.db.listRoutines = async filter => { const result = await actualList(filter); f.clock.value = new Date(f.membership.fin); return result; };
  const response = await f.request('/api/rutinas', 'a');
  assert.equal(response.status, 403);
  assert.equal((await response.text()).includes('ejercicios'), false);
});

test('administrador sin membresía crea y edita: conserva identidad, fecha de creación y aumenta versión', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/rutinas')).status, 403);
  const create = await f.post('/api/admin/rutinas', input);
  assert.equal(create.status, 201);
  const created = (await create.json()).rutina;
  assert.equal(created.nombre, input.nombre.trim());
  assert.equal(created.ejercicios[0].repeticiones, '8–12');
  assert.equal(created.version, 1);
  assert.match(created._id, /^[a-f0-9]{24}$/);
  const stored = f.client.rows('rutinas')[0];
  assert.equal(stored.creadaPor, adminId);
  assert.equal(stored.creadaEn.toISOString(), f.clock.value.toISOString());
  f.clock.value = new Date('2026-10-04T12:00:00Z');
  const update = await f.post(`/api/admin/rutinas/${created._id}`, { ...input, nombre: 'Nueva rutina', version: 1 });
  assert.equal(update.status, 200);
  const updated = (await update.json()).rutina;
  assert.equal(updated.nombre, 'Nueva rutina');
  assert.equal(updated.version, 2);
  assert.equal(updated.creadaEn, created.creadaEn);
  assert.equal(updated.actualizadaEn, f.clock.value.toISOString());
  assert.equal(stored.creadaPor, adminId);
  assert.equal((await f.request('/api/admin/rutinas')).status, 200);
});

test('deshabilitar conserva rutina y la retira de lista/detalle; rehabilitar vuelve a publicarla', async t => {
  const f = await fixture(t);
  f.seed();
  const route = `/api/admin/rutinas/${routineId}/disponibilidad`;
  assert.equal((await f.post(route, { disponible: false, version: 1 })).status, 200);
  const list = await f.request('/api/rutinas?disponibilidad=todas', 'a');
  assert.equal((await list.json()).rutinas.length, 0);
  assert.equal((await f.request(`/api/rutinas/${routineId}`, 'a')).status, 404);
  const admin = await (await f.request('/api/admin/rutinas?disponibilidad=deshabilitadas')).json();
  assert.equal(admin.rutinas[0].version, 2);
  assert.equal(admin.rutinas[0].disponible, false);
  assert.equal(f.client.rows('rutinas').length, 1);
  assert.equal((await f.post(route, { disponible: true, version: 2 })).status, 200);
  assert.equal((await f.request(`/api/rutinas/${routineId}`, 'a')).status, 200);
});

test('actualizaciones simultáneas y reintentos obsoletos no sobrescriben cambios', async t => {
  const f = await fixture(t);
  const stored = f.seed();
  const results = await Promise.all([
    f.post(`/api/admin/rutinas/${routineId}`, { ...input, nombre: 'Edición nueva', version: 1 }),
    f.post(`/api/admin/rutinas/${routineId}/disponibilidad`, { disponible: false, version: 1 }),
  ]);
  assert.deepEqual(results.map(response => response.status).sort(), [200, 409]);
  assert.equal(stored.version, 2);
  const snapshot = structuredClone(stored);
  assert.equal((await f.post(`/api/admin/rutinas/${routineId}`, { ...input, version: 1 })).status, 409);
  assert.deepEqual(structuredClone(stored), snapshot);
  const write = f.client.operations.find(op => op.name === 'rutinas' && op.method === 'findOneAndUpdate');
  assert.equal(write.filter.version, 1);
  assert.ok(write.filter._id instanceof ObjectId);
  assert.deepEqual(write.update.$inc, { version: 1 });
});

test('validación impide inyección, campos internos, niveles inválidos y límites de ejercicios', async t => {
  const f = await fixture(t);
  const exercise = input.ejercicios[0];
  for (const body of [
    null, [], { ...input, _id: routineId }, { ...input, creadaPor: 'otro' }, { ...input, version: 99 }, { ...input, $set: {} },
    { ...input, nombre: ' ' }, { ...input, nombre: 'x'.repeat(101) }, { ...input, objetivo: 'x'.repeat(501) },
    { ...input, nivel: { $ne: null } }, { ...input, nivel: 'experto' }, { ...input, disponible: 'true' },
    { ...input, ejercicios: [] }, { ...input, ejercicios: Array(21).fill(exercise) },
    ...[{ series: 0 }, { series: 21 }, { series: 1.5 }, { series: '3' }, { repeticiones: '' }, { descansoSegundos: -1 }, { descansoSegundos: 601 }, { descansoSegundos: 1.5 }, { nombre: { $ne: null } }, { notasPrivadas: 'dato' }].map(change => ({ ...input, ejercicios: [{ ...exercise, ...change }] })),
  ]) assert.equal((await f.post('/api/admin/rutinas', body)).status, 400);
  assert.equal(f.client.rows('rutinas').length, 0);
  assert.ok(validateRoutine({ ...input, objetivo: 'Objetivo\nen dos líneas.', ejercicios: Array(20).fill(exercise) }));
  const oversized = await f.post('/api/admin/rutinas', { ...input, objetivo: 'x'.repeat(9000) });
  assert.equal(oversized.status, 413);
});

test('IDs, filtros y versión inválidos se rechazan; rutinas inexistentes dan 404', async t => {
  const f = await fixture(t);
  for (const path of ['/api/rutinas?despues=mal', '/api/rutinas?nivel=otro']) assert.equal((await f.request(path, 'a')).status, 400);
  for (const path of ['/api/admin/rutinas?disponibilidad=otra', '/api/admin/rutinas?despues=mal', '/api/admin/rutinas?nivel=otro']) assert.equal((await f.request(path)).status, 400);
  assert.equal((await f.request('/api/rutinas/no-id', 'a')).status, 400);
  assert.equal((await f.post('/api/admin/rutinas/no-id', { ...input, version: 1 })).status, 400);
  for (const version of [undefined, null, '1', 0, -1, 1.5, Number.MAX_SAFE_INTEGER]) {
    assert.equal((await f.post(`/api/admin/rutinas/${routineId}`, { ...input, version })).status, 400);
    assert.equal((await f.post(`/api/admin/rutinas/${routineId}/disponibilidad`, { disponible: false, version })).status, 400);
  }
  assert.equal((await f.post(`/api/admin/rutinas/${routineId}/disponibilidad`, { disponible: false, version: 1, nombre: 'extra' })).status, 400);
  assert.equal((await f.request(`/api/rutinas/${routineId}`, 'a')).status, 404);
  assert.equal((await f.post(`/api/admin/rutinas/${routineId}`, { ...input, version: 1 })).status, 404);
});

test('paginación y filtros de nivel/disponibilidad no repiten rutinas ni entregan deshabilitadas', async t => {
  const f = await fixture(t);
  for (let i = 1; i <= 23; i++) f.seed({ _id: new ObjectId(i.toString(16).padStart(24, '0')) });
  f.seed({ _id: new ObjectId('f'.repeat(24)), disponible: false, nivel: 'avanzado' });
  const first = await (await f.request('/api/rutinas', 'a')).json();
  assert.equal(first.rutinas.length, 20);
  assert.ok(first.siguiente);
  const second = await (await f.request('/api/rutinas?despues=' + first.siguiente, 'a')).json();
  assert.equal(second.rutinas.length, 3);
  assert.equal(second.siguiente, null);
  assert.equal(new Set([...first.rutinas, ...second.rutinas].map(r => r._id)).size, 23);
  assert.equal((await (await f.request('/api/rutinas?nivel=avanzado', 'a')).json()).rutinas.length, 0);
  assert.equal((await (await f.request('/api/admin/rutinas?disponibilidad=deshabilitadas&nivel=avanzado')).json()).rutinas.length, 1);
});

test('origen externo y rol revocado bloquean cambios; errores DB son seguros; archivos privados siguen bloqueados', async t => {
  const f = await fixture(t);
  f.seed();
  assert.equal((await f.post('/api/admin/rutinas', input, 'b', { Origin: 'https://otro.example' })).status, 403);
  assert.equal((await f.post(`/api/admin/rutinas/${routineId}`, { ...input, version: 1 }, 'b', { Origin: 'https://otro.example' })).status, 403);
  assert.equal((await f.post(`/api/admin/rutinas/${routineId}/disponibilidad`, { disponible: false, version: 1 }, 'b', { Origin: 'https://otro.example' })).status, 403);
  f.admin.rol = 'usuario';
  assert.equal((await f.post('/api/admin/rutinas', input)).status, 403);
  assert.equal((await f.request('/api/admin/rutinas')).status, 403);
  f.admin.rol = 'admin';
  for (const [method, path, body, token] of [
    ['listRoutines', '/api/rutinas', undefined, 'a'],
    ['findRoutine', `/api/rutinas/${routineId}`, undefined, 'a'],
    ['createRoutine', '/api/admin/rutinas', input, 'b'],
    ['updateRoutine', `/api/admin/rutinas/${routineId}`, { ...input, version: 1 }, 'b'],
    ['findMembership', '/api/rutinas', undefined, 'a'],
  ]) {
    const original = f.db[method];
    f.db[method] = async () => { throw new Error('secret'); };
    const response = body ? await f.post(path, body, token) : await f.request(path, token);
    assert.equal(response.status, 503);
    assert.equal((await response.text()).includes('secret'), false);
    f.db[method] = original;
  }
  assert.equal((await f.request('/rutinas.js', null)).status, 200);
  for (const file of ['/backend/.env', '/backend/src/routines.js', '/backend/test-support/memory-client.js']) assert.equal((await f.request(file, null)).status, 404);
});
