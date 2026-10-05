import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/database.js';
import { memoryClient } from '../test-support/memory-client.js';

const keys = [...'abcdefghij'], ids = Object.fromEntries(keys.map((key, i) => [key, String(i + 1).padStart(24, '0')]));
const initial = new Date('2026-10-04T15:00:00Z');
async function fixture(t, options = {}) {
  const client = memoryClient(), clock = { value: initial };
  const db = createDatabase({ uri: 'mongodb://local-double', database: 'GymWeb' }, { clientFactory: () => client });
  for (const [i, key] of keys.entries()) {
    client.rows('usuarios').push({ _id: new ObjectId(ids[key]), nombre: `Persona ${key}`, correo: `${key}@example.invalid`, rol: key === 'c' ? 'admin' : 'usuario', passwordHash: 'secreto' });
    client.rows('sesiones').push({ _id: createHash('sha256').update(String(i).repeat(64)).digest('hex'), userId: ids[key], expiresAt: new Date('2100-01-01') });
  }
  for (const key of ['a', 'b']) client.rows('membresias').push({ _id: ids[key], planId: key === 'a' ? 'premium-familiar' : 'familiar', planNombre: key === 'a' ? 'Plan Premium familiar' : 'Plan Familiar', precio: key === 'a' ? 350000 : 150000, moneda: 'COP', periodo: 'mes', maxPersonas: 5, estado: 'activa', solicitadaEn: new Date('2026-09-30'), inicio: new Date('2026-10-01T15:00:00Z'), fin: new Date('2026-11-01T15:00:00Z'), activacionOrigen: 'pago-simulado', pagoSimulado: { tipo: 'simulado', resultado: 'aprobado', monto: key === 'a' ? 350000 : 150000, moneda: 'COP', registradaEn: new Date('2026-10-01') } });
  const server = createApp(db, { now: () => new Date(clock.value), environment: 'development', demoPayments: true, ...options }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, key = 'a', options = {}) => fetch(base + path, { ...options, headers: { ...(key ? { Cookie: `gym_session=${String(keys.indexOf(key)).repeat(64)}` } : {}), ...options.headers } });
  const post = (path, body, key = 'a', headers = {}) => request(path, key, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const own = key => client.rows('membresias').find(row => row._id === ids[key]);
  const invite = (key = 'd', owner = 'a') => post('/api/familia/invitaciones', { correo: `${key}@example.invalid` }, owner);
  const link = key => client.rows('vinculos_familiares').find(row => row._id === ids[key]);
  const accept = key => post('/api/familia/aceptar', { version: link(key).version }, key);
  const remove = (key = 'd', owner = 'a') => post(`/api/familia/miembros/${ids[key]}/retirar`, { version: link(key).version }, owner);
  const renew = (key = 'a', clave = randomUUID()) => post('/api/renovaciones', { clave }, key);
  const createRenew = async (key = 'a') => { const response = await renew(key); assert.equal(response.status, 201); return (await response.json()).renovacion; };
  const pay = (id, result = 'aprobado', key = 'a') => post(`/api/renovaciones/${id}/pago-simulado`, { resultado: result }, key);
  const approve = id => post(`/api/admin/renovaciones/${id}/aprobar`, {}, 'c');
  const training = async () => {
    const response = await post('/api/admin/entrenadores', { correo: 'j@example.invalid', nombre: 'Entrenador', especialidad: 'Fuerza', descripcion: 'Sesiones de fuerza y movilidad.', imagen: 'img/entrenador1.jpg', disponible: true }, 'c'); assert.equal(response.status, 201);
    const trainer = (await response.json()).entrenador;
    const slotResponse = await post('/api/admin/horarios', { entrenadorId: trainer._id, inicio: '2026-10-06T15:00:00.000Z' }, 'c'); assert.equal(slotResponse.status, 201);
    return { trainer, slot: (await slotResponse.json()).horario };
  };
  return { client, db, clock, request, post, own, invite, link, accept, remove, renew, createRenew, pay, approve, training };
}

test('familia y renovaciones exigen sesión, origen y validación estricta; rol no se falsifica', async t => {
  const f = await fixture(t);
  for (const path of ['/api/familia', '/api/renovaciones', '/api/membresia/historial', '/api/admin/renovaciones']) assert.equal((await f.request(path, null)).status, 401);
  assert.equal((await f.request('/api/admin/renovaciones')).status, 403);
  for (const body of [{correo: 'd@example.invalid', titularId: ids.b}, {correo: {$ne: null}}, {correo: 'mal'}]) assert.equal((await f.post('/api/familia/invitaciones', body)).status, 400);
  for (const body of [{clave: randomUUID(), precio: 1}, {clave: randomUUID(), planId: 'basico'}, {clave: 'mal'}]) assert.equal((await f.post('/api/renovaciones', body)).status, 400);
  assert.equal((await f.post('/api/familia/invitaciones', {correo: 'd@example.invalid'}, 'a', {Origin: 'https://externo.invalid'})).status, 403);
  assert.equal((await f.post('/api/familia/aceptar', {version: 1, usuarioId: ids.a}, 'd')).status, 400);
  assert.equal((await f.request('/api/renovaciones?estado=mal')).status, 400);
  assert.equal((await f.request('/api/membresia/historial?despues=mal')).status, 400);
});

test('beneficiario acepta desde su cuenta; hereda acceso sin recibir pagos, correos ni historial del titular', async t => {
  const f = await fixture(t); assert.equal((await f.invite()).status, 201); assert.equal((await f.invite()).status, 200);
  assert.equal((await f.request('/api/rutinas', 'd')).status, 403);
  const invitation = (await (await f.request('/api/familia', 'd')).json()); assert.equal(invitation.vinculo.estado, 'invitado'); assert.deepEqual(invitation.miembros, []);
  assert.equal(invitation.vinculo.correo, undefined); assert.equal(invitation.vinculo.titularId, undefined);
  const version = f.link('d').version; assert.equal((await f.accept('d')).status, 200);
  assert.equal((await f.post('/api/familia/aceptar', {version}, 'd')).status, 200);
  const membership = (await (await f.request('/api/membresia', 'd')).json()).membresia;
  assert.equal(membership._id, ids.d); assert.equal(membership.tipoAcceso, 'beneficiario'); assert.equal(membership.planId, 'premium-familiar'); assert.equal(membership.accesoActivo, true); assert.equal(membership.pagoSimulado, null);
  for (const key of ['titularId', 'activadaPor', 'accesoVersion']) assert.equal(membership[key], undefined);
  assert.equal(f.own('d'), undefined); assert.equal((await f.request('/api/rutinas', 'd')).status, 200);
  assert.deepEqual((await (await f.request('/api/membresia/historial', 'd')).json()).periodos, []);
  assert.equal((await f.renew('d')).status, 403); assert.equal((await f.invite('e', 'd')).status, 403);
  assert.equal((await f.post(`/api/familia/miembros/${ids.d}/retirar`, {version: f.link('d').version}, 'c')).status, 404);
});

test('titular familiar vigente y cuentas disponibles son obligatorios; no hay ciclos ni doble grupo', async t => {
  const f = await fixture(t);
  for (const planId of ['basico', 'premium-individual']) { f.own('a').planId = planId; assert.equal((await f.invite()).status, 403); }
  f.own('a').planId = 'premium-familiar'; f.own('a').estado = 'pendiente'; assert.equal((await f.invite()).status, 403); f.own('a').estado = 'activa';
  for (const key of ['a', 'b']) assert.equal((await f.invite(key)).status, 409);
  assert.equal((await f.post('/api/familia/invitaciones', {correo: 'ausente@example.invalid'})).status, 409);
  const race = await Promise.all([f.invite('d', 'a'), f.invite('d', 'b')]); assert.deepEqual(race.map(r => r.status).sort(), [201, 409]);
  assert.equal(f.client.rows('vinculos_familiares').length, 1);
  f.own('a').estado = 'vencida'; assert.equal((await f.invite('e')).status, 403);
});

test('máximo cinco personas contando titular e invitaciones, incluso al ocupar el último cupo simultáneamente', async t => {
  const f = await fixture(t);
  for (const key of ['d', 'e', 'f']) assert.equal((await f.invite(key)).status, 201);
  const race = await Promise.all([f.invite('g'), f.invite('h')]); assert.deepEqual(race.map(r => r.status).sort(), [201, 409]);
  const group = (await (await f.request('/api/familia')).json()); assert.equal(group.miembros.length, 4); assert.equal(group.capacidad, 5);
  assert.equal((await f.remove('d')).status, 200); assert.equal((await f.invite('i')).status, 201);
  assert.equal(f.client.rows('eventos_familia').filter(row => row.accion === 'retiro').length, 1);
});

test('aceptación y solicitud propia concurrentes nunca conceden dos membresías; invitación no impide solicitar la propia', async t => {
  const f = await fixture(t); await f.invite('d');
  const race = await Promise.all([f.accept('d'), f.post('/api/membresia', {planId: 'basico'}, 'd')]);
  assert.deepEqual(race.map(r => r.status).sort(), [race[0].status === 200 ? 200 : 201, 409]);
  assert.equal(f.link('d').estado === 'activo' && Boolean(f.own('d')), false);
  await f.invite('e'); assert.equal((await f.post('/api/membresia', {planId: 'basico'}, 'e')).status, 201); assert.equal((await f.accept('e')).status, 409);
});

test('retirar y volver a invitar exige la nueva versión; un consentimiento viejo no acepta otro grupo', async t => {
  const f = await fixture(t); await f.invite('d'); const version = f.link('d').version;
  assert.equal((await f.post('/api/familia/salir', {version}, 'd')).status, 200); assert.equal((await f.invite('d', 'b')).status, 201);
  assert.equal((await f.post('/api/familia/aceptar', {version}, 'd')).status, 409); assert.equal((await f.accept('d')).status, 200);
  assert.equal((await f.remove('d', 'a')).status, 404);
});

test('Familiar hereda rutinas y Premium familiar citas y chat; el acceso vence exactamente con el titular', async t => {
  const f = await fixture(t); await f.invite('d', 'b'); await f.accept('d');
  assert.equal((await f.request('/api/rutinas', 'd')).status, 200); assert.equal((await f.request('/api/horarios', 'd')).status, 403);
  f.clock.value = f.own('b').fin; const membership = (await (await f.request('/api/membresia', 'd')).json()).membresia;
  assert.equal(membership.estado, 'vencida'); assert.equal(membership.accesoActivo, false); assert.equal((await f.request('/api/rutinas', 'd')).status, 403);
});

test('retiro revoca chat, cancela citas futuras y libera sus horarios en una transacción; el titular no lee chats', async t => {
  const f = await fixture(t); await f.invite('d'); await f.accept('d'); const {trainer, slot} = await f.training();
  assert.equal((await f.post('/api/reservas', {horarioId: slot._id, clave: randomUUID()}, 'd')).status, 201);
  const conversation = (await (await f.post('/api/conversaciones', {entrenadorId: trainer._id}, 'd')).json()).conversacion;
  assert.equal((await f.post(`/api/conversaciones/${conversation._id}/mensajes`, {texto: 'Mensaje privado', clave: randomUUID()}, 'd')).status, 201);
  assert.equal((await f.request(`/api/conversaciones/${conversation._id}/mensajes`, 'a')).status, 404);
  assert.equal((await f.remove()).status, 200); assert.equal(f.client.rows('reservas')[0].estado, 'cancelada'); assert.equal(f.client.rows('horarios')[0].estado, 'disponible');
  for (const key of ['d', 'j']) assert.equal((await f.request(`/api/conversaciones/${conversation._id}/mensajes`, key)).status, 403);
  assert.equal((await f.request('/api/reservas', 'd')).status, 200); assert.equal((await f.request('/api/rutinas', 'd')).status, 403);
});

test('retiro simultáneo con reserva no deja una cita confirmada sin acceso familiar', async t => {
  const f = await fixture(t); await f.invite('d'); await f.accept('d'); const {slot} = await f.training();
  const race = await Promise.all([f.post('/api/reservas', {horarioId: slot._id, clave: randomUUID()}, 'd'), f.remove()]); assert.equal(race[1].status, 200);
  assert.ok([201, 403].includes(race[0].status)); assert.equal(f.client.rows('reservas').some(row => row.estado === 'confirmada'), false); assert.equal(f.client.rows('horarios')[0].estado, 'disponible');
});

test('retiro durante la lectura de rutinas bloquea la entrega; fallar al cancelar revierte vínculo y cita', async t => {
  const f = await fixture(t); await f.invite('d'); await f.accept('d');
  const actualList = f.db.listRoutines; f.db.listRoutines = async (...args) => { const rows = await actualList(...args); await f.remove(); return rows; };
  assert.equal((await f.request('/api/rutinas', 'd')).status, 403); f.db.listRoutines = actualList;
  await f.invite('d'); await f.accept('d'); const {slot} = await f.training(); await f.post('/api/reservas', {horarioId: slot._id, clave: randomUUID()}, 'd');
  const actualDb = f.client.db; f.client.db = () => ({collection(name) { const collection = actualDb().collection(name); if (name === 'horarios') collection.findOneAndUpdate = async () => { throw new Error('secreto'); }; return collection; }});
  const failed = await f.remove(); assert.equal(failed.status, 503); assert.equal((await failed.text()).includes('secreto'), false);
  assert.equal(f.link('d').estado, 'activo'); assert.equal(f.client.rows('reservas')[0].estado, 'confirmada');
});

test('renovación vigente usa precio del catálogo guardado y añade un mes desde fin sin interrumpir el acceso', async t => {
  const f = await fixture(t); const initialPeriod = (await (await f.request('/api/membresia/historial')).json()).periodos[0];
  assert.equal(initialPeriod.precio, 350000); assert.equal(f.client.rows('periodos_membresia').length, 0);
  await f.db.listPlans(); const plan = f.client.rows('planes').find(row => row._id === 'premium-familiar'); plan.precio = 360000;
  const renewal = await f.createRenew(); assert.equal(renewal.precio, 360000); plan.precio = 370000;
  const oldStart = f.own('a').inicio.toISOString(), oldEnd = f.own('a').fin.toISOString(); const paid = await f.pay(renewal._id); assert.equal(paid.status, 200);
  const applied = (await paid.json()).renovacion; assert.equal(applied.inicio, oldEnd); assert.equal(applied.fin, '2026-12-01T15:00:00.000Z'); assert.equal(applied.pagoSimulado.monto, 360000);
  assert.equal(f.own('a').inicio.toISOString(), oldStart); assert.equal(f.own('a').precio, 360000);
  const periods = (await (await f.request('/api/membresia/historial')).json()).periodos; assert.equal(periods.length, 2); assert.equal(periods[0].estado, 'programado'); assert.equal(periods[1].precio, 350000); assert.equal(periods[1].fin, oldEnd);
});

test('renovación vencida inicia al aprobar y respeta el mes calendario; conserva el periodo anterior', async t => {
  const f = await fixture(t); f.clock.value = new Date('2027-01-31T18:20:30.123Z');
  const renewal = await f.createRenew(); assert.equal((await f.approve(renewal._id)).status, 200);
  assert.equal(f.own('a').inicio.toISOString(), '2027-01-31T18:20:30.123Z'); assert.equal(f.own('a').fin.toISOString(), '2027-02-28T18:20:30.123Z'); assert.equal(f.client.rows('periodos_membresia').length, 2);
  assert.equal((await f.pay(renewal._id)).status, 409); assert.equal(f.own('a').pagoSimulado, null);
});

test('una sola renovación pendiente; reintentos de clave no crean otra y cancelar permite nueva solicitud', async t => {
  const f = await fixture(t), key = randomUUID();
  const same = await Promise.all([f.renew('a', key), f.renew('a', key), f.renew('a', key)]); assert.deepEqual(same.map(row => row.status).sort(), [200, 200, 201]);
  const id = (await same[0].json()).renovacion._id; assert.equal((await f.renew()).status, 409);
  for (let i = 0; i < 2; i++) assert.equal((await f.post(`/api/renovaciones/${id}/cancelar`, {})).status, 200);
  assert.equal((await f.renew('a', key)).status, 200); assert.equal((await f.renew()).status, 201); assert.equal(f.own('a').fin.toISOString(), '2026-11-01T15:00:00.000Z');
});

test('aprobaciones concurrentes administrativas y simuladas añaden un único periodo; pago inicial no renueva', async t => {
  const f = await fixture(t), renewal = await f.createRenew();
  const race = await Promise.all([f.pay(renewal._id), f.approve(renewal._id), f.approve(renewal._id)]); assert.ok(race.every(row => [200,409].includes(row.status)));
  assert.equal(f.client.rows('periodos_membresia').length, 2); assert.equal(f.own('a').fin.toISOString(), '2026-12-01T15:00:00.000Z');
  assert.equal((await f.post('/api/pagos/simulados', {resultado: 'aprobado'})).status, 409);
  assert.equal((await f.pay(renewal._id, 'rechazado')).status, 409); assert.equal((await f.post(`/api/renovaciones/${renewal._id}/cancelar`, {})).status, 409);
  assert.equal(f.own('a').fin.toISOString(), '2026-12-01T15:00:00.000Z');
});

test('rechazo no cambia vigencia; aprobación posterior y cancelación concurrente conservan una única decisión', async t => {
  const f = await fixture(t), renewal = await f.createRenew(), before = f.own('a').fin.toISOString();
  assert.equal((await f.pay(renewal._id, 'rechazado')).status, 200); assert.equal(f.own('a').fin.toISOString(), before); assert.equal(f.client.rows('periodos_membresia').length, 0);
  const race = await Promise.all([f.pay(renewal._id), f.post(`/api/renovaciones/${renewal._id}/cancelar`, {})]); assert.deepEqual(race.map(row => row.status).sort(), [200, 409]);
  const state = f.client.rows('renovaciones')[0].estado;
  assert.equal(f.client.rows('periodos_membresia').length, state === 'aplicada' ? 2 : 0); assert.equal(f.own('a').fin.toISOString(), state === 'aplicada' ? '2026-12-01T15:00:00.000Z' : before);
});

test('simulación de renovación sigue deshabilitada fuera de demo; administrador puede aprobar y datos propios son privados', async t => {
  const f = await fixture(t, {environment: 'production', demoPayments: true}), renewal = await f.createRenew();
  assert.equal((await f.pay(renewal._id)).status, 403); assert.equal((await f.post(`/api/admin/renovaciones/${renewal._id}/aprobar`, {}, 'd')).status, 403);
  assert.equal((await f.pay(renewal._id, 'aprobado', 'b')).status, 403); assert.equal((await f.post(`/api/renovaciones/${renewal._id}/cancelar`, {}, 'b')).status, 404);
  assert.deepEqual((await (await f.request('/api/renovaciones', 'd')).json()).renovaciones, []);
  assert.equal((await f.approve(renewal._id)).status, 200);
  const owned = (await (await f.request('/api/renovaciones')).json()).renovaciones[0]; for (const key of ['clave', 'userId', 'aplicadaPor', 'usuario']) assert.equal(owned[key], undefined);
  const admin = (await (await f.request('/api/admin/renovaciones', 'c')).json()).renovaciones[0]; assert.deepEqual(admin.usuario, {nombre: 'Persona a', correo: 'a@example.invalid'});
});

test('fallo de historial revierte extensión y solicitud; respuesta perdida conserva un solo periodo', async t => {
  const f = await fixture(t), renewal = await f.createRenew(), actualDb = f.client.db, before = f.own('a').fin.toISOString();
  f.client.db = () => ({collection(name) {const collection = actualDb().collection(name); if (name === 'periodos_membresia') collection.insertOne = async () => {throw new Error('secreto');}; return collection;}});
  const failed = await f.pay(renewal._id); assert.equal(failed.status, 503); assert.equal((await failed.text()).includes('secreto'), false); assert.equal(f.own('a').fin.toISOString(), before); assert.equal(f.client.rows('renovaciones')[0].estado, 'pendiente');
  f.client.db = actualDb; const apply = f.db.applyMembershipRenewal; f.db.applyMembershipRenewal = async (...args) => {await apply(...args); throw new Error('respuesta perdida');};
  assert.equal((await f.pay(renewal._id)).status, 503); f.db.applyMembershipRenewal = apply; assert.equal((await f.pay(renewal._id)).status, 200); assert.equal(f.client.rows('periodos_membresia').length, 2);
});

test('renovar al titular restablece acceso a beneficiarios sin copiar membresías ni habilitar pagos ajenos', async t => {
  const f = await fixture(t); await f.invite('d'); await f.accept('d'); f.clock.value = new Date('2026-11-02T15:00:00Z');
  assert.equal((await f.request('/api/rutinas', 'd')).status, 403); const renewal = await f.createRenew(); assert.equal((await f.pay(renewal._id, 'aprobado', 'd')).status, 404);
  assert.equal((await f.pay(renewal._id)).status, 200); assert.equal((await f.request('/api/rutinas', 'd')).status, 200); assert.equal((await f.request('/api/horarios', 'd')).status, 200);
  assert.equal(f.own('d'), undefined); assert.equal(f.link('d').estado, 'activo');
});

test('historial y renovaciones paginan de reciente a antiguo sin duplicados ni datos de otros usuarios', async t => {
  const f = await fixture(t);
  for (let i = 0; i < 23; i++) { const renewal = await f.createRenew(); assert.equal((await f.approve(renewal._id)).status, 200); }
  for (const [path, key, total] of [['/api/membresia/historial', 'periodos', 24], ['/api/renovaciones', 'renovaciones', 23]]) {
    const first = await (await f.request(path)).json(), second = await (await f.request(`${path}?despues=${first.siguiente}`)).json(); assert.equal(first[key].length, 20); assert.equal(second[key].length, total - 20); assert.equal(new Set([...first[key], ...second[key]].map(row => row._id)).size, total);
  }
  assert.equal((await (await f.request('/api/membresia/historial', 'd')).json()).periodos.length, 0);
});

test('sin transacciones no se conceden vínculos ni renovaciones parciales; pendientes iniciales no se renuevan', async t => {
  const f = await fixture(t); f.own('a').estado = 'pendiente'; assert.equal((await f.renew()).status, 409); f.own('a').estado = 'activa';
  const renewal = await f.createRenew(), validEnd = f.own('a').fin; f.own('a').fin = new Date(NaN);
  assert.equal((await f.pay(renewal._id)).status, 409); assert.equal(f.client.rows('periodos_membresia').length, 0); f.own('a').fin = validEnd;
  f.client.startSession = () => {throw new Error('sin soporte');}; const failed = await f.invite(); assert.equal(failed.status, 503); assert.equal((await failed.text()).includes('sin soporte'), false);
  assert.equal((await f.renew()).status, 503); assert.equal(f.client.rows('vinculos_familiares').length, 0); assert.equal(f.client.rows('renovaciones').length, 1); assert.equal(f.client.rows('renovaciones')[0].estado, 'pendiente');
});
