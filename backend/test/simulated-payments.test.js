import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/database.js';
import { simulationEnabled } from '../src/simulated-payments.js';
import { memoryClient } from '../test-support/memory-client.js';

const userId = '123456789012345678901234';
const otherId = '223456789012345678901234';
const adminId = '323456789012345678901234';
async function fixture(t, options = { environment: 'development', demoPayments: true }) {
  const client = memoryClient();
  const db = createDatabase({ uri: 'mongodb://local-double', database: 'GymWeb' }, { clientFactory: () => client });
  for (const [token, id, rol] of [['a', userId, 'usuario'], ['b', otherId, 'usuario'], ['c', adminId, 'admin']]) {
    client.rows('usuarios').push({ _id: new ObjectId(id), nombre: 'Cuenta de prueba', correo: `${token}@example.invalid`, rol });
    const hash = createHash('sha256').update(token.repeat(64)).digest('hex');
    client.rows('sesiones').push({ _id: hash, userId: id, expiresAt: new Date('2100-01-01') });
  }
  const clock = { value: new Date('2026-01-31T18:20:30.123Z') };
  const server = createApp(db, { now: () => new Date(clock.value), ...options }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, token = 'a', extra = {}) => fetch(base + path, {
    ...extra, headers: { ...(token ? { Cookie: `gym_session=${token.repeat(64)}` } : {}), ...extra.headers },
  });
  const pay = (resultado = 'aprobado', token = 'a', extras = {}) => request('/api/pagos/simulados', token, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...extras.headers }, body: JSON.stringify({ resultado, ...extras.body }),
  });
  const pending = (id = userId, changes = {}) => {
    const membership = { _id: id, planId: 'basico', planNombre: 'Plan Básico', precio: 60000, moneda: 'COP', periodo: 'mes', maxPersonas: 1, estado: 'pendiente', solicitadaEn: new Date('2026-01-01'), inicio: null, fin: null, ...changes };
    client.rows('membresias').push(membership);
    return membership;
  };
  return { db, client, clock, request, pay, pending, base };
}

test('simulación apagada por defecto, solo desarrollo y flag booleano explícito; no la habilita el navegador', async t => {
  assert.equal(simulationEnabled(), false);
  for (const options of [undefined, {}, { environment: 'development' }, { environment: 'development', demoPayments: 'true' }, { environment: 'production', demoPayments: true }, { environment: 'test', demoPayments: true }, { environment: 'development', demoPayments: false }]) {
    assert.equal(simulationEnabled(options), false);
    const f = await fixture(t, options || {});
    const member = f.pending();
    const status = await f.request('/api/pagos/simulacion');
    assert.equal((await status.json()).habilitada, false);
    assert.equal((await f.pay('aprobado', 'a', { body: { environment: 'development', demoPayments: true }, headers: { 'X-Demo-Payments': 'true' } })).status, 403);
    assert.equal(member.estado, 'pendiente');
    assert.equal(member.pagoSimulado, undefined);
  }
  assert.equal(simulationEnabled({ environment: 'development', demoPayments: true }), true);
});

test('sesión y origen son obligatorios; no permite activar ni consultar pagos de otro usuario', async t => {
  const f = await fixture(t);
  f.pending();
  const other = f.pending(otherId);
  assert.equal((await f.request('/api/pagos/simulacion', null)).status, 401);
  assert.equal((await f.pay('aprobado', null)).status, 401);
  assert.equal((await f.pay('aprobado', 'a', { headers: { Origin: 'https://otro.example' } })).status, 403);
  assert.equal((await f.pay('aprobado', 'a', { body: { userId: otherId } })).status, 400);
  assert.equal((await f.pay('aprobado', 'c')).status, 404);
  assert.equal((await f.request(`/api/pagos/simulados/${otherId}`, 'a', { method: 'POST' })).status, 404);
  const response = await f.pay();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).membresia._id, userId);
  assert.equal(other.estado, 'pendiente');
  assert.equal(other.pagoSimulado, undefined);
  assert.equal((await (await f.request('/api/membresia', 'b')).json()).membresia.pagoSimulado, null);
});

test('rechazo conserva pendiente y bloquea rutinas; una aprobación posterior activa y habilita acceso', async t => {
  const f = await fixture(t);
  const member = f.pending();
  const rejected = await f.pay('rechazado');
  assert.equal(rejected.status, 200);
  const rejection = await rejected.json();
  assert.equal(rejection.pago.tipo, 'simulado');
  assert.equal(rejection.pago.resultado, 'rechazado');
  assert.equal(rejection.pago.monto, 60000);
  assert.equal(rejection.membresia.estado, 'pendiente');
  assert.equal(member.inicio, null);
  assert.equal(member.fin, null);
  assert.equal((await f.request('/api/rutinas')).status, 403);
  f.clock.value = new Date('2026-01-31T19:00:00Z');
  const approved = await f.pay();
  assert.equal(approved.status, 200);
  const approval = await approved.json();
  assert.equal(approval.pago.resultado, 'aprobado');
  assert.equal(approval.membresia.estado, 'activa');
  assert.equal(approval.membresia.accesoActivo, true);
  assert.equal(member.fin.toISOString(), '2026-02-28T19:00:00.000Z');
  assert.equal(member.activadaPor, userId);
  assert.equal(member.activacionOrigen, 'pago-simulado');
  assert.equal(member.pagoSimulado.registradaEn.toISOString(), member.activadaEn.toISOString());
  assert.equal((await f.request('/api/rutinas')).status, 200);
});

test('condiciones y precio se toman de la solicitud guardada para los cuatro planes', async t => {
  const f = await fixture(t);
  f.db.findPlan = () => assert.fail('El pago no cambia el precio acordado por el catálogo actual');
  for (const [planId, precio, maxPersonas] of [['basico', 60000, 1], ['familiar', 150000, 5], ['premium-individual', 100000, 1], ['premium-familiar', 350000, 5]]) {
    f.client.rows('membresias').length = 0;
    f.pending(userId, { planId, precio, maxPersonas });
    const response = await f.pay();
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.pago.monto, precio);
    assert.equal(body.membresia.planId, planId);
    assert.equal(body.membresia.maxPersonas, maxPersonas);
    assert.equal(body.membresia.fin, '2026-02-28T18:20:30.123Z');
  }
});

test('validación rechaza precio, fechas, rol, usuario, tipo de pago e inyección; ausencia da 404', async t => {
  const f = await fixture(t);
  assert.equal((await f.pay()).status, 404);
  const member = f.pending();
  for (const changes of [{ precio: 1 }, { monto: 1 }, { userId: otherId }, { rol: 'admin' }, { inicio: '2000-01-01' }, { fin: '2100-01-01' }, { tipo: 'real' }, { $set: { estado: 'activa' } }, { resultado: { $ne: null } }]) {
    assert.equal((await f.pay('aprobado', 'a', { body: changes })).status, 400);
  }
  for (const body of [null, [], {}, { resultado: 'otro' }, { resultado: true }]) {
    assert.equal((await f.request('/api/pagos/simulados', 'a', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).status, 400);
  }
  assert.equal(member.estado, 'pendiente');
  assert.equal(member.pagoSimulado, undefined);
});

test('aprobaciones concurrentes y reintentos conservan un solo periodo y un único comprobante', async t => {
  const f = await fixture(t);
  const member = f.pending();
  const results = await Promise.all([f.pay(), f.pay(), f.pay()]);
  assert.deepEqual(results.map(r => r.status), [200, 200, 200]);
  const bodies = await Promise.all(results.map(r => r.json()));
  assert.deepEqual(bodies[0], bodies[1]);
  assert.deepEqual(bodies[1], bodies[2]);
  const saved = structuredClone(member);
  f.clock.value = new Date('2026-02-05');
  assert.equal((await f.pay()).status, 200);
  assert.deepEqual(structuredClone(member), saved);
  assert.equal((await f.pay('rechazado')).status, 409);
  assert.deepEqual(structuredClone(member), saved);
  const transition = f.client.operations.find(op => op.name === 'membresias' && op.method === 'findOneAndUpdate');
  assert.equal(transition.filter.estado, 'pendiente');
  assert.equal(transition.filter.precio, 60000);
  assert.equal(transition.update.$set.estado, 'activa');
  assert.equal(transition.update.$set.pagoSimulado.resultado, 'aprobado');
  assert.equal(transition.options.returnDocument, 'after');
});

test('rechazo concurrente no desactiva una aprobación ni conserva una marca de rechazo en una activa', async t => {
  const f = await fixture(t);
  const member = f.pending();
  const [rejected, approved] = await Promise.all([f.pay('rechazado'), f.pay()]);
  assert.ok([200, 409].includes(rejected.status));
  assert.equal(approved.status, 200);
  assert.equal(member.estado, 'activa');
  assert.equal(member.pagoSimulado.resultado, 'aprobado');
  assert.equal((await f.pay('rechazado')).status, 409);
});

test('activación administrativa concurrente mantiene un solo periodo sin fingir un pago aprobado', async t => {
  const f = await fixture(t);
  const member = f.pending();
  const admin = f.request(`/api/admin/membresias/${userId}/activar`, 'c', { method: 'POST' });
  const simulated = f.pay();
  const [adminResult, paymentResult] = await Promise.all([admin, simulated]);
  assert.equal(adminResult.status, 200);
  assert.ok([200, 409].includes(paymentResult.status));
  assert.equal(member.estado, 'activa');
  assert.equal(member.fin.toISOString(), '2026-02-28T18:20:30.123Z');
  if (member.activacionOrigen === 'administrador') {
    assert.equal(member.activadaPor, adminId);
    assert.equal(member.pagoSimulado, undefined);
    assert.equal((await f.pay()).status, 409);
  } else {
    assert.equal(member.pagoSimulado.resultado, 'aprobado');
    assert.equal(member.activadaPor, userId);
  }
});

test('respuesta perdida tras aprobación: reintento recupera el comprobante sin reiniciar fechas', async t => {
  const f = await fixture(t);
  const member = f.pending();
  const actual = f.db.simulateMembershipPayment;
  f.db.simulateMembershipPayment = async (...args) => { await actual(...args); throw new Error('secret'); };
  const first = await f.pay();
  assert.equal(first.status, 503);
  assert.equal((await first.text()).includes('secret'), false);
  const saved = structuredClone(member);
  f.db.simulateMembershipPayment = actual;
  f.clock.value = new Date('2026-02-02');
  assert.equal((await f.pay()).status, 200);
  assert.deepEqual(structuredClone(member), saved);
});

test('membresías activadas por administrador, vencidas o inconsistentes no son reactivadas', async t => {
  const f = await fixture(t);
  for (const changes of [
    { estado: 'vencida' }, { estado: 'cancelada' }, { periodo: 'año' }, { precio: '60000' }, { precio: -1 }, { moneda: 'USD' },
    { inicio: new Date('2020-01-01') }, { fin: new Date('2100-01-01') },
    { estado: 'activa', inicio: new Date('2026-01-01'), fin: new Date('2026-02-01'), activacionOrigen: 'administrador' },
  ]) {
    f.client.rows('membresias').length = 0;
    const member = f.pending(userId, changes);
    assert.equal((await f.pay()).status, 409);
    assert.equal((await f.pay('rechazado')).status, 409);
    assert.equal(member.pagoSimulado, undefined);
  }
});

test('pago aprobado vencido se puede consultar por reintento, conserva fechas y no devuelve acceso', async t => {
  const f = await fixture(t);
  const member = f.pending();
  await f.pay();
  const start = member.inicio.toISOString();
  const end = member.fin.toISOString();
  const receipt = structuredClone(member.pagoSimulado);
  f.clock.value = new Date(member.fin);
  const retry = await f.pay();
  assert.equal(retry.status, 200);
  const body = await retry.json();
  assert.equal(body.membresia.estado, 'vencida');
  assert.equal(body.membresia.accesoActivo, false);
  assert.equal(body.membresia.inicio, start);
  assert.equal(body.membresia.fin, end);
  assert.deepEqual(member.pagoSimulado, receipt);
  assert.equal((await f.request('/api/rutinas')).status, 403);
});

test('comprobante propio usa proyección explícita y se mantiene visible con la simulación apagada', async t => {
  const f = await fixture(t);
  const member = f.pending();
  await f.pay();
  member.pagoSimulado.secretoInterno = 'secret';
  const own = await f.request('/api/membresia');
  assert.equal((await own.text()).includes('secret'), false);
  assert.equal(member.activadaPor, userId);
  const disabledApp = createApp(f.db).listen(0, '127.0.0.1');
  await new Promise(resolve => disabledApp.once('listening', resolve));
  t.after(() => new Promise(resolve => disabledApp.close(resolve)));
  const stored = await fetch(`http://127.0.0.1:${disabledApp.address().port}/api/membresia`, { headers: { Cookie: `gym_session=${'a'.repeat(64)}` } });
  assert.equal((await stored.json()).membresia.pagoSimulado.resultado, 'aprobado');
});
