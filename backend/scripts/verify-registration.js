// Prueba explícita contra Atlas: crea y elimina solo su propia cuenta temporal.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { config } from '../src/config.js';
import { createDatabase } from '../src/database.js';
import { createApp } from '../src/app.js';

const correo = `gym-check-${randomUUID()}@example.invalid`;
const password = randomUUID();
const db = createDatabase(config);
const client = new MongoClient(config.uri, { serverSelectionTimeoutMS: 5000, timeoutMS: 5000 });
const server = createApp(db).listen(0, '127.0.0.1');
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
  console.log('Atlas: catálogo, membresía pendiente y rechazo concurrente de duplicados verificados.');
  assert.equal((await fetch(`${base}/micuenta.html`, { headers: { Cookie: cookie } })).status, 200);
  assert.equal((await fetch(`${base}/api/logout`, { method: 'POST', headers: { Cookie: cookie } })).status, 200);
  assert.equal((await fetch(`${base}/api/me`, { headers: { Cookie: cookie } })).status, 401);
  console.log('Atlas: login, Mi cuenta y logout verificados.');
  console.log('Atlas: registro HTTP 201, hash almacenado y duplicado HTTP 409 verificados.');
} finally {
  try {
    const temporaryUser = await client.db(config.database).collection('usuarios').findOne({ correo });
    if (temporaryUser) {
      await client.db(config.database).collection('sesiones').deleteMany({ userId: temporaryUser._id.toString() });
      await client.db(config.database).collection('membresias').deleteOne({ _id: temporaryUser._id.toString() });
    }
    const result = await client.db(config.database).collection('usuarios').deleteOne({ correo });
    console.log(`Limpieza: ${result.deletedCount} cuenta temporal eliminada.`);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await db.close();
    await client.close();
  }
}
