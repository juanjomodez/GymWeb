import test from 'node:test';
import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createApp } from '../src/app.js';

async function start(t, database) {
  const server = createApp(database).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, post: body => fetch(`${base}/api/usuarios`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }) };
}

const input = { nombre: ' Ana Pérez ', correo: ' ANA@EXAMPLE.COM ', password: 'una-clave-de-prueba' };

test('registro normaliza, guarda un hash verificable y no devuelve secretos', async t => {
  let stored;
  const { post } = await start(t, { async createUser(user) {
    stored = user;
    return { id: '123', nombre: user.nombre, correo: user.correo };
  } });
  const response = await post({ ...input, rol: 'admin' });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.deepEqual(body.usuario, { id: '123', nombre: 'Ana Pérez', correo: 'ana@example.com' });
  assert.equal(stored.password, undefined);
  assert.equal(stored.rol, undefined);
  assert.ok(stored.createdAt instanceof Date);
  const [algorithm, n, r, p, salt, hash] = stored.passwordHash.split('$');
  assert.equal(algorithm, 'scrypt');
  assert.equal(scryptSync(input.password, salt, 64, { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 }).toString('hex'), hash);
  assert.equal(JSON.stringify(body).includes(hash), false);
});

test('rechaza datos inválidos antes de guardar', async t => {
  const { post } = await start(t, { createUser() { assert.fail('No debe escribir'); } });
  for (const body of [null, [], { ...input, nombre: 'a' }, { ...input, correo: { $ne: null } }, { ...input, password: 'corta' }, { ...input, password: 'x'.repeat(129) }]) {
    assert.equal((await post(body)).status, 400);
  }
});

test('correo duplicado devuelve 409 y fallo DB devuelve 503 sin detalles', async t => {
  let code = 11000;
  const { post } = await start(t, { async createUser() { throw Object.assign(new Error('secret'), { code }); } });
  assert.equal((await post(input)).status, 409);
  code = 123;
  const response = await post(input);
  assert.equal(response.status, 503);
  assert.equal((await response.text()).includes('secret'), false);
});

test('sirve el registro y bloquea archivos privados; maneja JSON inválido', async t => {
  const { base } = await start(t, {});
  assert.equal((await fetch(`${base}/registro.html`)).status, 200);
  for (const file of ['/backend/.env', '/backend/src/config.js', '/.git', '/.env']) {
    assert.equal((await fetch(base + file)).status, 404);
  }
  const response = await fetch(`${base}/api/usuarios`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
  });
  assert.equal(response.status, 400);
});

test('los scripts referenciados por las páginas públicas y la cuenta se sirven como JavaScript', async t => {
  const { base } = await start(t, {});
  const scripts = new Set();
  for (const page of ['index.html', 'login.html', 'registro.html', 'micuenta.html']) {
    const html = await readFile(new URL(`../../${page}`, import.meta.url), 'utf8');
    for (const [, src] of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)) scripts.add(src);
  }
  assert.ok(scripts.has('web.js'), 'El formulario debe cargar el código de autenticación');
  for (const script of scripts) {
    const response = await fetch(`${base}/${script}`);
    assert.equal(response.status, 200, script);
    assert.match(response.headers.get('content-type'), /javascript/, script);
    assert.equal(await response.text(), await readFile(new URL(`../../js/${script}`, import.meta.url), 'utf8'), script);
  }
});
