import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/database.js';
import { membershipEnd, publicMembership } from '../src/memberships.js';
import { adminPreparationInput } from '../src/admin-preparation.js';
import { memoryClient } from '../test-support/memory-client.js';

const hash = token => createHash('sha256').update(token).digest('hex');
const memberId = '123456789012345678901234';
const adminId = '223456789012345678901234';
const secondAdminId = '323456789012345678901234';
async function fixture(t) {
  const client = memoryClient();
  const db = createDatabase({ uri: 'mongodb://local-double', database: 'GymWeb' }, { clientFactory: () => client });
  const member = { _id: new ObjectId(memberId), nombre: '<b>Ana</b>', correo: 'ana@example.com', passwordHash: 'secreto' };
  const admin = { _id: new ObjectId(adminId), nombre: 'Admin', correo: 'admin@example.com', rol: 'admin' };
  client.rows('usuarios').push(member, admin, { ...admin, _id: new ObjectId(secondAdminId), correo: 'otro-admin@example.com' });
  for (const [token, userId] of [['a', memberId], ['b', adminId], ['c', secondAdminId]]) {
    client.rows('sesiones').push({ _id: hash(token.repeat(64)), userId, expiresAt: new Date('2100-01-01') });
  }
  const clock = { value: new Date('2026-01-31T18:20:30.123Z') };
  const server = createApp(db, { now: () => new Date(clock.value) }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, token = 'b', options = {}) => fetch(base + path, {
    ...options, headers: { ...(token ? { Cookie: `gym_session=${token.repeat(64)}` } : {}), ...options.headers },
  });
  const activate = (token = 'b', options = {}) => request(`/api/admin/membresias/${memberId}/activar`, token, { method: 'POST', ...options });
  const pending = (id = memberId) => {
    const row = { _id: id, planId: 'basico', planNombre: 'Plan Básico', precio: 60000, moneda: 'COP', periodo: 'mes', maxPersonas: 1, estado: 'pendiente', solicitadaEn: new Date('2026-01-01'), inicio: null, fin: null };
    client.rows('membresias').push(row);
    return row;
  };
  return { client, db, clock, request, activate, pending, member, admin };
}

test('un mes UTC: fin de mes, febrero bisiesto, cambio de año y hora conservada', () => {
  for (const [start, end] of [
    ['2026-01-31T18:20:30.123Z', '2026-02-28T18:20:30.123Z'],
    ['2028-01-31T18:20:30.123Z', '2028-02-29T18:20:30.123Z'],
    ['2026-03-31T18:20:30.123Z', '2026-04-30T18:20:30.123Z'],
    ['2026-12-15T18:20:30.123Z', '2027-01-15T18:20:30.123Z'],
  ]) {
    const input = new Date(start);
    assert.equal(membershipEnd(input).toISOString(), end);
    assert.equal(input.toISOString(), start);
  }
  assert.throws(() => membershipEnd(new Date(NaN)));
});

test('autorización en servidor: sin sesión 401, usuario/rol falsificado 403, admin permitido; revocación inmediata', async t => {
  const f = await fixture(t);
  f.pending();
  for (const path of ['/api/admin/membresias', `/api/admin/membresias/${memberId}/activar`]) {
    const options = path.endsWith('activar') ? { method: 'POST' } : {};
    assert.equal((await f.request(path, null, options)).status, 401);
    assert.equal((await f.request(path, 'a', { ...options, headers: { 'X-Role': 'admin' } })).status, 403);
  }
  assert.equal((await f.activate('a', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rol: 'admin' }) })).status, 403);
  assert.equal((await f.request('/api/admin/membresias')).status, 200);
  assert.equal((await (await f.request('/api/me', 'a')).json()).usuario.rol, 'usuario');
  assert.equal((await (await f.request('/api/me')).json()).usuario.rol, 'admin');
  f.admin.rol = 'usuario';
  assert.equal((await f.activate()).status, 403);
  assert.equal(f.client.rows('membresias')[0].estado, 'pendiente');
  f.member.rol = 'ADMIN';
  assert.equal((await f.request('/api/admin/membresias', 'a')).status, 403);
});

test('activación concurrente por dos administradores e idempotencia conservan un único periodo y actor', async t => {
  const f = await fixture(t);
  const row = f.pending();
  const results = await Promise.all([f.activate('b'), f.activate('c')]);
  assert.deepEqual(results.map(r => r.status), [200, 200]);
  const bodies = await Promise.all(results.map(r => r.json()));
  assert.deepEqual(bodies[0].membresia, bodies[1].membresia);
  assert.equal(row.inicio.toISOString(), '2026-01-31T18:20:30.123Z');
  assert.equal(row.fin.toISOString(), '2026-02-28T18:20:30.123Z');
  assert.equal(row.activadaPor, adminId);
  assert.equal(row.activadaEn.toISOString(), row.inicio.toISOString());
  assert.equal(bodies[0].membresia.accesoActivo, true);
  f.clock.value = new Date('2026-02-03T00:00:00Z');
  const retry = await f.activate('c');
  assert.equal(retry.status, 200);
  assert.deepEqual((await retry.json()).membresia, bodies[0].membresia);
  assert.equal(row.activadaPor, adminId);
  const cas = f.client.operations.find(op => op.method === 'findOneAndUpdate');
  assert.deepEqual(cas.filter, { _id: memberId, estado: 'pendiente', periodo: 'mes', inicio: null, fin: null });
  assert.equal(cas.options.returnDocument, 'after');
});

test('respuesta perdida después de escribir: 503 seguro y reintento sin prolongar la membresía', async t => {
  const f = await fixture(t);
  const row = f.pending();
  const actual = f.db.activateMembership;
  f.db.activateMembership = async (...args) => { await actual(...args); throw new Error('secret'); };
  const first = await f.activate();
  assert.equal(first.status, 503);
  assert.equal((await first.text()).includes('secret'), false);
  f.db.activateMembership = actual;
  f.clock.value = new Date('2026-02-01');
  assert.equal((await f.activate()).status, 200);
  assert.equal(row.inicio.toISOString(), '2026-01-31T18:20:30.123Z');
});

test('vence exactamente en fin, persiste sin eliminar datos y nunca se reactiva ni cambia el plan', async t => {
  const f = await fixture(t);
  const row = f.pending();
  await f.activate();
  f.clock.value = new Date(row.fin.getTime() - 1);
  const own = () => f.request('/api/membresia', 'a');
  assert.equal((await (await own()).json()).membresia.accesoActivo, true);
  f.clock.value = new Date(row.fin);
  const expired = (await (await own()).json()).membresia;
  assert.equal(expired.estado, 'vencida');
  assert.equal(expired.accesoActivo, false);
  assert.equal(row.estado, 'vencida');
  assert.equal(row.activadaPor, adminId);
  assert.equal((await f.activate()).status, 409);
  assert.equal(f.client.rows('membresias').length, 1);
  assert.equal((await f.request('/api/membresia', 'a', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planId: 'basico' }) })).status, 409);
  assert.equal(expired.fin, '2026-02-28T18:20:30.123Z');
});

test('solicitud ignora fechas, acceso y rol del navegador y queda activable por administrador', async t => {
  const f = await fixture(t);
  const requested = await f.request('/api/membresia', 'a', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ planId: 'familiar', rol: 'admin', estado: 'activa', accesoActivo: true, inicio: '2000-01-01', fin: '2100-01-01', precio: 1, userId: adminId }),
  });
  assert.equal(requested.status, 201);
  const pending = (await requested.json()).membresia;
  assert.equal(pending._id, memberId);
  assert.equal(pending.estado, 'pendiente');
  assert.equal(pending.precio, 150000);
  assert.equal(pending.inicio, null);
  assert.equal(pending.fin, null);
  assert.equal((await f.activate('a')).status, 403);
  const response = await f.activate();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).membresia.maxPersonas, 5);
});

test('activar una membresía vencida por fecha la marca vencida antes de rechazarla', async t => {
  const f = await fixture(t);
  const row = f.pending();
  await f.activate();
  f.clock.value = new Date(row.fin);
  assert.equal((await f.activate()).status, 409);
  assert.equal(row.estado, 'vencida');
  assert.equal(row.inicio.toISOString(), '2026-01-31T18:20:30.123Z');
  assert.equal(row.fin.toISOString(), '2026-02-28T18:20:30.123Z');
});

test('listado privado con vencimiento, filtros y paginación; no filtra hashes ni auditoría', async t => {
  const f = await fixture(t);
  const row = f.pending();
  await f.activate();
  const pending = f.pending(secondAdminId);
  f.clock.value = new Date(row.fin);
  const active = await f.request('/api/admin/membresias?estado=activa');
  assert.equal((await active.json()).membresias.length, 0);
  const expired = await f.request('/api/admin/membresias?estado=vencida');
  const body = await expired.json();
  assert.equal(body.membresias[0].estado, 'vencida');
  assert.deepEqual(body.membresias[0].usuario, { nombre: '<b>Ana</b>', correo: 'ana@example.com' });
  assert.equal(JSON.stringify(body).includes('passwordHash'), false);
  assert.equal(body.membresias[0].activadaPor, undefined);
  // Mi cuenta nunca entrega membresías ajenas.
  assert.equal((await (await f.request('/api/membresia', 'c')).json()).membresia._id, pending._id);
  for (let i = 1; i <= 51; i++) f.pending(i.toString(16).padStart(24, '0'));
  const page1 = await (await f.request('/api/admin/membresias')).json();
  assert.equal(page1.membresias.length, 50);
  assert.ok(page1.siguiente);
  const page2 = await (await f.request('/api/admin/membresias?despues=' + page1.siguiente)).json();
  assert.equal(page2.membresias.length, 2);
  assert.equal(page2.siguiente, null);
  assert.equal(new Set([...page1.membresias, ...page2.membresias].map(m => m._id)).size, 52);
  for (const query of ['estado=otro', 'estado[$ne]=activa', 'despues=no-valido', 'despues[$gt]=1']) {
    // Express usa query simple; parámetros desconocidos no cambian el filtro.
    const result = await f.request('/api/admin/membresias?' + query);
    assert.equal(result.status, query.includes('[') ? 200 : 400);
  }
});

test('validación, origen externo, ausencia y estados no activables', async t => {
  const f = await fixture(t);
  assert.equal((await f.activate()).status, 404);
  assert.equal((await f.request('/api/admin/membresias/no-id/activar', 'b', { method: 'POST' })).status, 400);
  const row = f.pending();
  for (const body of [{ inicio: '2000-01-01' }, { fin: '2100-01-01' }, { precio: 1 }, { rol: 'admin' }, null, []]) {
    assert.equal((await f.activate('b', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).status, 400);
  }
  assert.equal((await f.activate('b', { headers: { Origin: 'https://otro.example' } })).status, 403);
  assert.equal(row.estado, 'pendiente');
  row.periodo = 'año';
  assert.equal((await f.activate()).status, 409);
  row.periodo = 'mes';
  row.inicio = new Date('2020-01-01');
  assert.equal((await f.activate()).status, 409);
  row.estado = 'cancelada';
  assert.equal((await f.activate()).status, 409);
  f.db.listMemberships = async () => { throw new Error('secret'); };
  const failure = await f.request('/api/admin/membresias');
  assert.equal(failure.status, 503);
  assert.equal((await failure.text()).includes('secret'), false);
});

test('acceso requiere estado activo y fechas válidas con inicio inclusivo y fin exclusivo', () => {
  const now = new Date('2026-01-01');
  const value = { estado: 'activa', inicio: now, fin: new Date('2026-02-01') };
  assert.equal(publicMembership(value, now).accesoActivo, true);
  for (const patch of [{ estado: 'pendiente' }, { inicio: null }, { inicio: new Date('2026-01-02') }, { fin: now }, { fin: null }, { fin: new Date(NaN) }]) {
    assert.equal(publicMembership({ ...value, ...patch }, now).accesoActivo, false);
  }
});

test('preparación de administrador exige entorno, correo exacto y confirmación; actualiza solo una cuenta existente', async t => {
  for (const env of [undefined, 'production', 'test']) assert.throws(() => adminPreparationInput(['--correo', 'ana@example.com', '--confirmar'], env));
  for (const args of [[], ['--correo', 'ana@example.com'], ['--correo', '{}', '--confirmar'], ['--correo', 'ana@example.com', '--confirmar', '--extra']]) {
    assert.throws(() => adminPreparationInput(args, 'development'));
  }
  assert.equal(adminPreparationInput(['--correo', ' ANA@example.com ', '--confirmar'], 'development'), 'ana@example.com');
  const f = await fixture(t);
  assert.equal(await f.db.prepareAdmin('ausente@example.com'), null);
  assert.equal(await f.db.prepareAdmin('admin@example.com'), null);
  assert.ok(await f.db.prepareAdmin('ana@example.com'));
  assert.equal(f.member.rol, 'admin');
  assert.equal(await f.db.prepareAdmin('ana@example.com'), null);
  assert.equal((await f.request('/api/admin/membresias', 'a')).status, 200);
  assert.equal(f.client.rows('usuarios').length, 3);
  const write = f.client.operations.find(op => op.method === 'findOneAndUpdate' && op.name === 'usuarios');
  assert.deepEqual(write.update, { $set: { rol: 'admin' } });
  assert.deepEqual(write.options.projection, { _id: 1 });
});
