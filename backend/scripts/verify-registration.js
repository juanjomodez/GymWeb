// Prueba explícita contra Atlas: crea y elimina solo su propia cuenta temporal.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { config } from '../src/config.js';
import { createDatabase } from '../src/database.js';
import { createApp } from '../src/app.js';
import { membershipEnd } from '../src/memberships.js';

const withRoutines = process.argv.slice(2).includes('--with-routines');
const withAdmin = withRoutines || process.argv.slice(2).includes('--with-admin');
if (process.argv.slice(2).some(arg => !['--with-admin', '--with-routines'].includes(arg))) throw new Error('Opción de verificación inválida. Usa --with-admin o --with-routines.');

const correo = `gym-check-${randomUUID()}@example.invalid`;
const password = randomUUID();
const adminCorreo = `gym-admin-check-${randomUUID()}@example.invalid`;
const adminPassword = randomUUID();
let membershipNow;
const db = createDatabase(config);
const client = new MongoClient(config.uri, { serverSelectionTimeoutMS: 5000, timeoutMS: 5000 });
const server = createApp(db, { now: () => membershipNow ? new Date(membershipNow) : new Date() }).listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const endpoint = `http://127.0.0.1:${server.address().port}/api/usuarios`;
try {
  const post = () => fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: 'Prueba temporal', correo, password }),
  });
  const response = await post();
  assert.equal(response.status, 201);
  const document = await client.db(config.database).collection('usuarios').findOne({ correo });
  assert.ok(document?.passwordHash?.startsWith('scrypt$'));
  assert.equal(document.password, undefined);
  assert.equal((await post()).status, 409);
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${base}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ correo, password }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  // Simula volver a Inicio con la misma cookie antes de solicitar el plan.
  const home = await fetch(`${base}/index.html`, { headers: { Cookie: cookie } });
  assert.equal(home.status, 200);
  assert.match(await home.text(), /id="enlace-cuenta"/);
  const me = await fetch(`${base}/api/me`, { headers: { Cookie: cookie } });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).usuario.correo, correo);
  const catalog = await fetch(`${base}/api/planes`);
  assert.equal(catalog.status, 200);
  assert.ok((await catalog.json()).planes.length >= 4);
  const requestMembership = () => fetch(`${base}/api/membresia`, {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ planId: 'basico', precio: 1, estado: 'activa' }),
  });
  const requests = await Promise.all([requestMembership(), requestMembership()]);
  assert.deepEqual(requests.map(r => r.status).sort(), [201, 409]);
  const membership = await fetch(`${base}/api/membresia`, { headers: { Cookie: cookie } });
  assert.equal(membership.status, 200);
  const savedMembership = (await membership.json()).membresia;
  assert.equal(savedMembership.estado, 'pendiente');
  assert.equal(savedMembership.precio, 60000);
  assert.equal(savedMembership.inicio, null);
  if (withRoutines) assert.equal((await fetch(`${base}/api/rutinas`, { headers: { Cookie: cookie } })).status, 403);
  console.log('Atlas: catálogo, membresía pendiente y rechazo concurrente de duplicados verificados.');
  const activationPath = `${base}/api/admin/membresias/${document._id}/activar`;
  assert.equal((await fetch(activationPath, { method: 'POST', headers: { Cookie: cookie } })).status, 403);
  if (withAdmin) {
    // Solo esta opción explícita prepara un admin temporal creado por el verificador.
    const registration = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: 'Admin temporal', correo: adminCorreo, password: adminPassword, rol: 'admin' }),
    });
    assert.equal(registration.status, 201);
    const adminBefore = await client.db(config.database).collection('usuarios').findOne({ correo: adminCorreo });
    assert.equal(adminBefore.rol, undefined);
    assert.ok(await db.prepareAdmin(adminCorreo));
    const adminLogin = await fetch(`${base}/api/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correo: adminCorreo, password: adminPassword }),
    });
    assert.equal(adminLogin.status, 200);
    const adminCookie = adminLogin.headers.get('set-cookie').split(';')[0];
    membershipNow = new Date();
    const activate = () => fetch(activationPath, { method: 'POST', headers: { Cookie: adminCookie } });
    const results = await Promise.all([activate(), activate()]);
    assert.deepEqual(results.map(result => result.status), [200, 200]);
    const bodies = await Promise.all(results.map(result => result.json()));
    assert.deepEqual(bodies[0].membresia, bodies[1].membresia);
    assert.equal(bodies[0].membresia.fin, membershipEnd(membershipNow).toISOString());
    const retry = await activate();
    assert.equal(retry.status, 200);
    assert.deepEqual((await retry.json()).membresia, bodies[0].membresia);
    let testRoutineId;
    if (withRoutines) {
      const routineInput = {
        nombre: 'Rutina temporal del verificador', objetivo: 'Comprobación técnica con datos de prueba.', nivel: 'principiante', disponible: false,
        ejercicios: [{ nombre: 'Ejercicio temporal de prueba', series: 3, repeticiones: '8', descansoSegundos: 60 }],
      };
      const adminPost = (route, body) => fetch(`${base}${route}`, {
        method: 'POST', headers: { Cookie: adminCookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const created = await adminPost('/api/admin/rutinas', routineInput);
      assert.equal(created.status, 201);
      const routine = (await created.json()).rutina;
      testRoutineId = routine._id;
      const availability = `/api/admin/rutinas/${testRoutineId}/disponibilidad`;
      assert.equal((await adminPost(availability, { disponible: true, version: 1 })).status, 200);
      const detail = await fetch(`${base}/api/rutinas/${testRoutineId}`, { headers: { Cookie: cookie } });
      assert.equal(detail.status, 200);
      const publicData = (await detail.json()).rutina;
      assert.equal(publicData.ejercicios[0].series, 3);
      assert.equal(publicData.creadaPor, undefined);
      assert.equal(publicData.version, undefined);
      assert.equal((await fetch(`${base}/api/rutinas`, { headers: { Cookie: cookie } })).status, 200);
      assert.equal((await fetch(`${base}/api/admin/rutinas`, { headers: { Cookie: adminCookie } })).status, 200);
      const edit = await adminPost(`/api/admin/rutinas/${testRoutineId}`, { ...routineInput, nombre: 'Rutina temporal editada', disponible: true, version: 2 });
      assert.equal(edit.status, 200);
      assert.equal((await edit.json()).rutina.version, 3);
      assert.equal((await adminPost(availability, { disponible: false, version: 2 })).status, 409);
      assert.equal((await adminPost(availability, { disponible: false, version: 3 })).status, 200);
      assert.equal((await fetch(`${base}/api/rutinas/${testRoutineId}`, { headers: { Cookie: cookie } })).status, 404);
      console.log('Atlas: creación, lectura, edición, conflicto y deshabilitación de una rutina temporal verificados.');
    }
    membershipNow = new Date(bodies[0].membresia.fin);
    const expired = await fetch(`${base}/api/membresia`, { headers: { Cookie: cookie } });
    assert.equal(expired.status, 200);
    const ended = (await expired.json()).membresia;
    assert.equal(ended.estado, 'vencida');
    assert.equal(ended.accesoActivo, false);
    assert.equal((await activate()).status, 409);
    if (withRoutines) assert.equal((await fetch(`${base}/api/rutinas/${testRoutineId}`, { headers: { Cookie: cookie } })).status, 403);
    console.log('Atlas: permisos, activación concurrente, reintento y vencimiento verificados con cuentas temporales.');
  }
  assert.equal((await fetch(`${base}/micuenta.html`, { headers: { Cookie: cookie } })).status, 200);
  assert.equal((await fetch(`${base}/api/logout`, { method: 'POST', headers: { Cookie: cookie } })).status, 200);
  assert.equal((await fetch(`${base}/api/me`, { headers: { Cookie: cookie } })).status, 401);
  console.log('Atlas: login, Mi cuenta y logout verificados.');
  console.log('Atlas: registro HTTP 201, hash almacenado y duplicado HTTP 409 verificados.');
} finally {
  try {
    const failures = [];
    for (const temporaryCorreo of [correo, ...(withAdmin ? [adminCorreo] : [])]) {
      try {
        const temporaryUser = await client.db(config.database).collection('usuarios').findOne({ correo: temporaryCorreo });
        if (temporaryUser) {
          if (withRoutines) await client.db(config.database).collection('rutinas').deleteMany({ creadaPor: temporaryUser._id.toString() });
          await client.db(config.database).collection('sesiones').deleteMany({ userId: temporaryUser._id.toString() });
          await client.db(config.database).collection('membresias').deleteOne({ _id: temporaryUser._id.toString() });
          await client.db(config.database).collection('usuarios').deleteOne({ _id: temporaryUser._id });
        }
        console.log('Limpieza de cuenta temporal completada.');
      } catch { failures.push(temporaryCorreo); }
    }
    if (failures.length) throw new Error('Falló la limpieza de una cuenta temporal del verificador. Revisa localmente las cuentas gym-check y gym-admin-check.');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await db.close();
    await client.close();
  }
}
