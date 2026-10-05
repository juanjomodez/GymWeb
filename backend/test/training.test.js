import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/database.js';
import { memoryClient } from '../test-support/memory-client.js';

const ids = Object.fromEntries(['a', 'b', 'c', 'd', 'e'].map((key, i) => [key, String(i + 1) + '23456789012345678901234']));
const initial = new Date('2026-10-04T15:00:00.000Z'), start = '2026-10-06T15:00:00.000Z';
async function fixture(t) {
  const client = memoryClient(), clock = { value: initial };
  const db = createDatabase({ uri: 'mongodb://local-double', database: 'GymWeb' }, { clientFactory: () => client });
  for (const token of Object.keys(ids)) {
    client.rows('usuarios').push({ _id: new ObjectId(ids[token]), nombre: `Persona ${token}`, correo: `${token}@example.invalid`, rol: token === 'c' ? 'admin' : 'usuario' });
    client.rows('sesiones').push({ _id: createHash('sha256').update(token.repeat(64)).digest('hex'), userId: ids[token], expiresAt: new Date('2100-01-01') });
  }
  for (const token of ['a', 'b']) client.rows('membresias').push({ _id: ids[token], planId: 'premium-individual', estado: 'activa', inicio: new Date('2026-10-01'), fin: new Date('2026-11-01') });
  const server = createApp(db, { now: () => new Date(clock.value) }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, token = 'a', options = {}) => fetch(base + path, { ...options, headers: { ...(token ? { Cookie: `gym_session=${token.repeat(64)}` } : {}), ...options.headers } });
  const post = (path, body, token = 'a', headers = {}) => request(path, token, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const trainerInput = token => ({ nombre: `Entrenador ${token}`, especialidad: 'Fuerza', descripcion: 'Sesiones de fuerza y movilidad.', imagen: 'img/entrenador1.jpg', disponible: true, correo: `${token}@example.invalid` });
  const profile = async (token = 'd') => { const response = await post('/api/admin/entrenadores', trainerInput(token), 'c'); assert.equal(response.status, 201); return (await response.json()).entrenador; };
  const slot = async (trainer, inicio = start) => { const response = await post('/api/admin/horarios', { entrenadorId: trainer._id, inicio }, 'c'); assert.equal(response.status, 201); return (await response.json()).horario; };
  const reserve = (slot, clave = randomUUID(), token = 'a') => post('/api/reservas', { horarioId: slot._id, clave }, token);
  const cancel = (id, token = 'a', staff = false) => post(`/api/${staff ? 'entrenador/' : ''}reservas/${id}/cancelar`, {}, token);
  const conversation = async trainer => { const response = await post('/api/conversaciones', { entrenadorId: trainer._id }); assert.equal(response.status, 201); return (await response.json()).conversacion; };
  const send = (id, texto = 'Hola, quiero preparar mi sesión.', clave = randomUUID(), token = 'a') => post(`/api/conversaciones/${id}/mensajes`, { texto, clave }, token);
  const membership = token => client.rows('membresias').find(row => row._id === ids[token]);
  const edit = (trainer, disponible, version = trainer.version) => post(`/api/admin/entrenadores/${trainer._id}`, { nombre: trainer.nombre, especialidad: trainer.especialidad, descripcion: trainer.descripcion, imagen: trainer.imagen, disponible, version }, 'c');
  return { client, db, clock, request, post, trainerInput, profile, slot, reserve, cancel, conversation, send, membership, edit };
}

test('catálogo público vacío sin semillas; administración y agenda requieren permisos reales', async t => {
  const f = await fixture(t);
  assert.deepEqual((await (await f.request('/api/entrenadores', null)).json()).entrenadores, []);
  for (const path of ['/api/admin/entrenadores', '/api/admin/horarios', '/api/admin/reservas', '/api/horarios', '/api/reservas', '/api/conversaciones', '/api/entrenador/me', '/api/entrenador/reservas']) assert.equal((await f.request(path, null)).status, 401);
  assert.equal((await f.post('/api/admin/entrenadores', f.trainerInput('d'))).status, 403);
  assert.equal((await f.request('/api/entrenador/me')).status, 403);
  assert.equal((await f.request('/api/horarios', 'c')).status, 403);
});

test('perfil vincula una cuenta existente sin cambiar su rol; DTO público privado y versión administrativa', async t => {
  const f = await fixture(t), trainer = await f.profile();
  assert.equal((await f.post('/api/admin/entrenadores', f.trainerInput('d'), 'c')).status, 409);
  assert.equal((await f.post('/api/admin/entrenadores', { ...f.trainerInput('d'), correo: 'ausente@example.invalid' }, 'c')).status, 404);
  const publicRow = (await (await f.request('/api/entrenadores', null)).json()).entrenadores[0];
  for (const key of ['usuarioId', 'correo', 'version', 'agendaVersion', 'creadaPor']) assert.equal(publicRow[key], undefined);
  assert.equal((await f.request('/api/entrenador/me', 'd')).status, 200);
  assert.equal(f.client.rows('usuarios').find(row => String(row._id) === ids.d).rol, 'usuario');
  assert.equal((await f.edit(trainer, true)).status, 200); assert.equal((await f.edit(trainer, false)).status, 409);
});

test('consulta de acceso distingue administrador, Premium y entrenador sin denegaciones esperadas', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/entrenamiento/acceso', null)).status, 401);
  const admin = await f.request('/api/entrenamiento/acceso?userId=' + ids.a, 'c');
  assert.equal(admin.status, 200);
  assert.deepEqual(await admin.json(), { premium: false, entrenador: null });
  assert.equal((await f.request('/api/admin/horarios', 'c')).status, 200);
  assert.equal((await f.request('/api/horarios', 'c')).status, 403);
  assert.deepEqual(await (await f.request('/api/entrenamiento/acceso')).json(), { premium: true, entrenador: null });
  const profile = await f.profile();
  const staff = await (await f.request('/api/entrenamiento/acceso', 'd')).json();
  assert.equal(staff.premium, false);
  assert.equal(staff.entrenador.nombre, profile.nombre);
  for (const key of ['usuarioId', 'correo', 'version', 'creadaPor']) assert.equal(staff.entrenador[key], undefined);
  await f.edit(profile, false);
  assert.deepEqual(await (await f.request('/api/entrenamiento/acceso', 'd')).json(), { premium: false, entrenador: null });
  f.clock.value = f.membership('a').fin;
  assert.equal((await (await f.request('/api/entrenamiento/acceso')).json()).premium, false);
});

test('fallo al comprobar acceso devuelve 503 sin conceder acceso ni filtrar errores', async t => {
  const f = await fixture(t);
  f.db.findTrainerForUser = async () => { throw new Error('secreto del driver'); };
  const response = await f.request('/api/entrenamiento/acceso', 'c');
  assert.equal(response.status, 503);
  assert.equal((await response.text()).includes('secreto'), false);
});

test('solo Premium vigente accede: planes, estados, fechas y membresía durante toda la cita', async t => {
  const f = await fixture(t), trainer = await f.profile(), slot = await f.slot(trainer);
  for (const plan of ['basico', 'familiar', 'premium-inventado']) { f.membership('a').planId = plan; assert.equal((await f.request('/api/horarios')).status, 403); assert.equal((await f.reserve(slot)).status, 403); }
  for (const plan of ['premium-individual', 'premium-familiar']) { f.membership('a').planId = plan; assert.equal((await f.request('/api/horarios')).status, 200); }
  for (const estado of ['pendiente', 'vencida']) { f.membership('a').estado = estado; assert.equal((await f.reserve(slot)).status, 403); }
  f.membership('a').estado = 'activa'; f.membership('a').inicio = new Date('2026-10-05'); assert.equal((await f.request('/api/horarios')).status, 403);
  f.membership('a').inicio = new Date(initial); f.membership('a').fin = new Date('2026-10-06T15:30:00Z'); assert.equal((await f.reserve(slot)).status, 403);
  f.membership('a').fin = new Date(slot.fin); assert.equal((await f.reserve(slot)).status, 201);
});

test('disponibilidad muestra solo citas completas dentro de la membresía, sin limitar la agenda administrativa', async t => {
  const f = await fixture(t), trainer = await f.profile(), first = await f.slot(trainer), second = await f.slot(trainer, '2026-10-06T16:00:00.000Z');
  f.membership('a').fin = new Date(first.fin);
  const available = (await (await f.request('/api/horarios')).json()).horarios;
  assert.deepEqual(available.map(row => row._id), [first._id]);
  assert.equal((await (await f.request('/api/horarios', 'b')).json()).horarios.length, 2);
  assert.equal((await (await f.request('/api/admin/horarios', 'c')).json()).horarios.length, 2);
  assert.equal((await f.reserve(second)).status, 403);
  f.membership('a').fin = new Date(new Date(first.fin).getTime() - 1);
  assert.deepEqual((await (await f.request('/api/horarios')).json()).horarios, []);
});

test('horarios exactos de una hora, límites de fecha y repetición sin duplicados', async t => {
  const f = await fixture(t), trainer = await f.profile();
  const body = { entrenadorId: trainer._id, inicio: start };
  const responses = await Promise.all([f.post('/api/admin/horarios', body, 'c'), f.post('/api/admin/horarios', body, 'c')]);
  assert.deepEqual(responses.map(row => row.status).sort(), [200, 201]); assert.equal(f.client.rows('horarios').length, 1);
  const slot = (await responses[0].json()).horario; assert.equal(new Date(slot.fin) - new Date(slot.inicio), 3600000);
  for (const inicio of ['2026-10-06T15:30:00.000Z', '2026-02-30T15:00:00.000Z', '2026-10-04T15:00:00.000Z', '2027-02-01T15:00:00.000Z']) assert.equal((await f.post('/api/admin/horarios', { ...body, inicio }, 'c')).status, 400);
});

test('reserva concurrente e idempotencia: solo un miembro ocupa el horario', async t => {
  const f = await fixture(t), slot = await f.slot(await f.profile()), clave = randomUUID();
  const same = await Promise.all([f.reserve(slot, clave), f.reserve(slot, clave), f.reserve(slot, clave)]);
  assert.deepEqual(same.map(row => row.status).sort(), [200, 200, 201]); assert.equal(f.client.rows('reservas').length, 1);
  assert.equal((await f.reserve(slot, randomUUID(), 'b')).status, 409);
  const reserve = (await same[0].json()).reserva; for (const key of ['userId', 'clave', 'miembroNombre', 'canceladaPor']) assert.equal(reserve[key], undefined);
  const other = await f.slot({ _id: reserve.entrenadorId }, '2026-10-06T16:00:00.000Z'); assert.equal((await f.reserve(other, clave)).status, 409);
});

test('dos miembros compiten simultáneamente por una cita y solo uno la confirma', async t => {
  const f = await fixture(t), slot = await f.slot(await f.profile());
  const responses = await Promise.all([f.reserve(slot, randomUUID(), 'a'), f.reserve(slot, randomUUID(), 'b')]);
  assert.deepEqual(responses.map(row => row.status).sort(), [201, 409]); assert.equal(f.client.rows('reservas').length, 1);
  assert.equal(f.client.rows('horarios')[0].reservaId, String(f.client.rows('reservas')[0]._id));
});

test('un miembro no puede solapar entrenadores; cancelar libera los índices activos', async t => {
  const f = await fixture(t), one = await f.slot(await f.profile()), two = await f.slot(await f.profile('e'));
  const first = (await (await f.reserve(one)).json()).reserva;
  assert.equal((await f.reserve(two)).status, 409); assert.equal(f.client.rows('horarios').find(row => String(row._id) === two._id).estado, 'disponible');
  assert.equal((await f.cancel(first._id)).status, 200); assert.equal((await f.reserve(two)).status, 201);
  assert.equal((await f.reserve(one, randomUUID(), 'b')).status, 201);
});

test('cancelación propia incluso sin Premium; entrenador solo agenda asignada y cierra horario', async t => {
  const f = await fixture(t), trainer = await f.profile(), slot = await f.slot(trainer), booking = (await (await f.reserve(slot)).json()).reserva;
  for (const token of ['b', 'c', 'e']) assert.equal((await f.cancel(booking._id, token)).status, 404);
  f.membership('a').estado = 'vencida'; assert.equal((await f.request('/api/reservas')).status, 200);
  const cancelled = (await (await f.cancel(booking._id)).json()).reserva; f.clock.value = new Date('2026-10-07');
  assert.equal((await (await f.cancel(booking._id)).json()).reserva.canceladaEn, cancelled.canceladaEn);
  f.clock.value = initial; const next = (await (await f.reserve(slot, randomUUID(), 'b')).json()).reserva;
  assert.equal((await f.cancel(next._id, 'd', true)).status, 200); assert.equal(f.client.rows('horarios')[0].estado, 'cerrado');
  assert.equal((await (await f.request('/api/entrenador/reservas', 'd')).json()).reservas.length, 2);
});

test('cierre administrativo detecta versión obsoleta y cancela cita de forma atómica', async t => {
  const f = await fixture(t), slot = await f.slot(await f.profile()), booking = (await (await f.reserve(slot)).json()).reserva;
  assert.equal((await f.post(`/api/admin/horarios/${slot._id}/cerrar`, { version: slot.version }, 'c')).status, 409);
  assert.equal((await f.post(`/api/admin/horarios/${slot._id}/cerrar`, { version: 2 }, 'c')).status, 200);
  assert.equal(f.client.rows('reservas')[0].estado, 'cancelada'); assert.equal(f.client.rows('reservas')[0].cancelacionOrigen, 'administrador');
  assert.equal((await f.post(`/api/admin/horarios/${slot._id}/abrir`, { version: 3 }, 'c')).status, 200);
  assert.equal((await f.reserve(slot)).status, 201); f.clock.value = new Date(start);
  assert.equal((await f.cancel(booking._id)).status, 200); assert.equal((await f.cancel(String(f.client.rows('reservas')[1]._id))).status, 409);
});

test('deshabilitar perfil compite con reserva, cancela futuros y revoca portal sin reabrir al habilitar', async t => {
  const f = await fixture(t), trainer = await f.profile(), slot = await f.slot(trainer);
  const results = await Promise.all([f.reserve(slot), f.edit(trainer, false)]); assert.equal(results[1].status, 200);
  assert.ok([201, 409].includes(results[0].status)); assert.equal(f.client.rows('horarios')[0].estado, 'cerrado');
  assert.equal(f.client.rows('reservas').some(row => row.estado === 'confirmada'), false);
  assert.equal((await f.request('/api/entrenador/me', 'd')).status, 403); assert.equal((await (await f.request('/api/entrenadores', null)).json()).entrenadores.length, 0);
  assert.equal((await f.edit(trainer, true, 2)).status, 200); assert.equal(f.client.rows('horarios')[0].estado, 'cerrado');
});

test('fallo de persistencia revierte reserva y cierre; respuesta perdida recupera la misma reserva', async t => {
  const f = await fixture(t), slot = await f.slot(await f.profile()), actualDb = f.client.db;
  f.client.db = () => ({ collection(name) { const row = actualDb().collection(name); if (name === 'reservas') row.insertOne = async () => { throw new Error('secreto'); }; return row; } });
  const failure = await f.reserve(slot); assert.equal(failure.status, 503); assert.equal((await failure.text()).includes('secreto'), false); assert.equal(f.client.rows('horarios')[0].estado, 'disponible');
  f.client.db = actualDb; const actualCreate = f.db.createBooking, clave = randomUUID();
  f.db.createBooking = async (...args) => { await actualCreate(...args); throw new Error('respuesta perdida'); };
  assert.equal((await f.reserve(slot, clave)).status, 503); f.db.createBooking = actualCreate;
  assert.equal((await f.reserve(slot, clave)).status, 200); assert.equal(f.client.rows('reservas').length, 1);
  f.client.db = () => ({ collection(name) { const row = actualDb().collection(name); if (name === 'reservas') row.updateMany = async () => { throw new Error('secreto'); }; return row; } });
  assert.equal((await f.post(`/api/admin/horarios/${slot._id}/cerrar`, { version: 2 }, 'c')).status, 503);
  assert.equal(f.client.rows('horarios')[0].estado, 'reservado'); assert.equal(f.client.rows('reservas')[0].estado, 'confirmada');
});

test('conversación directa sin reserva; solo miembro y entrenador asignado, incluso frente a administradores', async t => {
  const f = await fixture(t), trainer = await f.profile(), conversation = await f.conversation(trainer); await f.profile('e');
  assert.equal((await f.post('/api/conversaciones', { entrenadorId: trainer._id })).status, 200);
  assert.equal(f.client.rows('conversaciones').length, 1); assert.equal((await f.send(conversation._id, '<img src=x onerror=alert(1)>')).status, 201);
  assert.equal((await f.send(conversation._id, 'Nos vemos en el gimnasio.', randomUUID(), 'd')).status, 201);
  for (const token of ['b', 'c', 'e']) { assert.equal((await f.request(`/api/conversaciones/${conversation._id}/mensajes`, token)).status, 404); assert.equal((await f.send(conversation._id, 'Inyección', randomUUID(), token)).status, 404); }
  assert.equal((await f.request(`/api/conversaciones/${conversation._id}/mensajes`, null)).status, 401);
  const messages = (await (await f.request(`/api/conversaciones/${conversation._id}/mensajes`)).json()).mensajes;
  assert.equal(messages[0].texto, '<img src=x onerror=alert(1)>'); assert.deepEqual(messages.map(row => row.autor), ['miembro', 'entrenador']);
  for (const key of ['autorId', 'clave', 'conversacionId']) assert.equal(messages[0][key], undefined);
});

test('mensajes concurrentes y respuesta perdida usan claves sin duplicar ni aceptar texto distinto', async t => {
  const f = await fixture(t), conversation = await f.conversation(await f.profile()), clave = randomUUID();
  const same = await Promise.all([f.send(conversation._id, 'Hola', clave), f.send(conversation._id, 'Hola', clave)]); assert.deepEqual(same.map(row => row.status).sort(), [200, 201]);
  assert.equal((await f.send(conversation._id, 'Cambio', clave)).status, 409);
  const actual = f.db.sendTrainingMessage, otherKey = randomUUID(); f.db.sendTrainingMessage = async (...args) => { await actual(...args); throw new Error('perdida'); };
  assert.equal((await f.send(conversation._id, 'Segundo', otherKey)).status, 503); f.db.sendTrainingMessage = actual;
  assert.equal((await f.send(conversation._id, 'Segundo', otherKey)).status, 200); assert.equal(f.client.rows('mensajes').length, 2);
});

test('conversaciones concurrentes se recuperan y perfil deshabilitado bloquea lectura y envío', async t => {
  const f = await fixture(t), trainer = await f.profile(), body = { entrenadorId: trainer._id };
  const responses = await Promise.all([f.post('/api/conversaciones', body), f.post('/api/conversaciones', body)]);
  assert.deepEqual(responses.map(row => row.status).sort(), [200, 201]); assert.equal(f.client.rows('conversaciones').length, 1);
  const id = String(f.client.rows('conversaciones')[0]._id); await f.send(id);
  await f.edit(trainer, false);
  for (const token of ['a', 'd']) { assert.equal((await f.request(`/api/conversaciones/${id}/mensajes`, token)).status, 409); assert.equal((await f.send(id, 'No guardar', randomUUID(), token)).status, 409); }
  assert.equal(f.client.rows('mensajes').length, 1);
});

test('vencimiento durante lectura impide entregar mensajes y durante envío revierte la escritura', async t => {
  const f = await fixture(t), conversation = await f.conversation(await f.profile()); await f.send(conversation._id);
  const actualDb = f.client.db;
  f.client.db = () => ({ collection(name) { const row = actualDb().collection(name); if (name === 'mensajes') { const find = row.find; row.find = (...args) => { const result = find(...args), read = result.toArray; result.toArray = async () => { const data = await read(); f.clock.value = f.membership('a').fin; return data; }; return result; }; } return row; } });
  const read = await f.request(`/api/conversaciones/${conversation._id}/mensajes`); assert.equal(read.status, 403); assert.equal((await read.text()).includes('Hola'), false);
  f.clock.value = initial;
  f.client.db = () => ({ collection(name) { const row = actualDb().collection(name); if (name === 'mensajes') { const insert = row.insertOne; row.insertOne = async (...args) => { const result = await insert(...args); f.clock.value = f.membership('a').fin; return result; }; } return row; } });
  assert.equal((await f.send(conversation._id, 'No debe quedar')).status, 403); assert.equal(f.client.rows('mensajes').length, 1);
});

test('validación rechaza suplantación, URI de imagen, fechas, claves, origen e inyección', async t => {
  const f = await fixture(t), trainer = await f.profile(), slot = await f.slot(trainer), conversation = await f.conversation(trainer);
  for (const body of [{ ...f.trainerInput('e'), imagen: 'https://externo.invalid/x' }, { ...f.trainerInput('e'), usuarioId: ids.c }, { ...f.trainerInput('e'), rol: 'admin' }]) assert.equal((await f.post('/api/admin/entrenadores', body, 'c')).status, 400);
  assert.equal((await f.post(`/api/admin/entrenadores/${trainer._id}`, { ...f.trainerInput('e'), version: 1 }, 'c')).status, 400);
  for (const body of [{ horarioId: slot._id, clave: randomUUID(), userId: ids.b }, { horarioId: { $ne: null }, clave: randomUUID() }, { horarioId: slot._id, clave: 'invalida' }]) assert.equal((await f.post('/api/reservas', body)).status, 400);
  assert.equal((await f.post(`/api/conversaciones/${conversation._id}/mensajes`, { texto: 'Hola', clave: randomUUID(), autor: 'entrenador' })).status, 400);
  assert.equal((await f.send(conversation._id, 'x'.repeat(2001))).status, 400);
  assert.equal((await f.post('/api/reservas', { horarioId: slot._id, clave: randomUUID() }, 'a', { Origin: 'https://externo.invalid' })).status, 403);
  assert.equal((await f.request('/api/horarios?despues=invalido')).status, 400);
  assert.equal((await f.request('/api/admin/horarios?estado=mal', 'c')).status, 400);
  assert.equal((await f.request('/api/reservas?estado=disponible')).status, 400);
});

test('paginación propia y de mensajes no duplica contenido ni expone claves; transacciones obligatorias', async t => {
  const f = await fixture(t), trainer = await f.profile(), conversation = await f.conversation(trainer);
  for (let i = 0; i < 24; i++) await f.send(conversation._id, `Mensaje ${i}`);
  const first = (await (await f.request(`/api/conversaciones/${conversation._id}/mensajes`)).json()); assert.equal(first.mensajes.length, 20);
  const second = (await (await f.request(`/api/conversaciones/${conversation._id}/mensajes?despues=${first.siguiente}`)).json()); assert.equal(second.mensajes.length, 4);
  assert.equal(new Set([...first.mensajes, ...second.mensajes].map(row => row._id)).size, 24);
  assert.equal((await (await f.request('/api/conversaciones', 'b')).json()).conversaciones.length, 0);
  f.client.startSession = () => { throw new Error('sin soporte'); };
  const failed = await f.send(conversation._id, 'No guardar'); assert.equal(failed.status, 503); assert.equal((await failed.text()).includes('sin soporte'), false); assert.equal(f.client.rows('mensajes').length, 24);
});
