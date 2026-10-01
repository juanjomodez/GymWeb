import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/registration.js';

async function fixture(t) {
  const user = { _id: '123', nombre: 'Ana', correo: 'ana@example.com', passwordHash: await hashPassword('clave-de-prueba') };
  const sessions = new Map();
  const db = {
    async findUserByEmail(email) { return email === user.correo ? user : null; },
    async createSession(session) { sessions.set(session._id, session); },
    async deleteSession(hash) { sessions.delete(hash); },
    async findSessionUser(hash) {
      const session = sessions.get(hash);
      return session && session.expiresAt > new Date() ? { id: user._id, nombre: user.nombre, correo: user.correo } : null;
    },
  };
  const server = createApp(db).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (route, options = {}) => fetch(base + route, options);
  const login = (body = { correo: 'ANA@example.com', password: 'clave-de-prueba' }) => request('/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { request, login, sessions, db };
}

test('login, cookie segura, cuenta protegida, rotación y logout', async t => {
  const { request, login, sessions } = await fixture(t);
  assert.equal((await request('/api/me')).status, 401);
  const redirect = await request('/micuenta.html', { redirect: 'manual' });
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('location'), '/login.html');
  const result = await login();
  assert.equal(result.status, 200);
  const cookieHeader = result.headers.get('set-cookie');
  assert.match(cookieHeader, /HttpOnly/);
  assert.match(cookieHeader, /SameSite=Strict/);
  const cookie = cookieHeader.split(';')[0];
  const token = cookie.split('=')[1];
  const hash = createHash('sha256').update(token).digest('hex');
  assert.ok(sessions.has(hash));
  assert.equal(sessions.has(token), false);
  const account = await request('/api/me', { headers: { Cookie: cookie } });
  assert.deepEqual(await account.json(), { usuario: { id: '123', nombre: 'Ana', correo: 'ana@example.com' } });
  assert.equal((await request('/micuenta.html', { headers: { Cookie: cookie } })).status, 200);
  const rotated = await request('/api/login', {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ correo: 'ana@example.com', password: 'clave-de-prueba' }),
  });
  assert.equal(rotated.status, 200);
  assert.equal((await request('/api/me', { headers: { Cookie: cookie } })).status, 401);
  const nextCookie = rotated.headers.get('set-cookie').split(';')[0];
  const logout = await request('/api/logout', { method: 'POST', headers: { Cookie: nextCookie } });
  assert.equal(logout.status, 200);
  assert.equal((await request('/api/me', { headers: { Cookie: nextCookie } })).status, 401);
  assert.equal(sessions.size, 0);
});

test('rechaza contraseñas erróneas, correos inexistentes, entradas inválidas y limita intentos', async t => {
  const { login } = await fixture(t);
  assert.equal((await login({ correo: {}, password: 'clave-de-prueba' })).status, 400);
  const wrong = await login({ correo: 'ana@example.com', password: 'otra-clave' });
  const absent = await login({ correo: 'nadie@example.com', password: 'otra-clave' });
  assert.equal(wrong.status, 401);
  assert.deepEqual(await wrong.json(), await absent.json());
  for (let i = 0; i < 8; i++) assert.equal((await login({ correo: 'ana@example.com', password: 'otra-clave' })).status, 401);
  const limited = await login();
  assert.equal(limited.status, 429);
  assert.ok(limited.headers.get('retry-after'));
});

test('expiración, cookies malformadas, origen externo y error DB', async t => {
  const { login, request, sessions, db } = await fixture(t);
  const response = await login();
  const cookie = response.headers.get('set-cookie').split(';')[0];
  for (const session of sessions.values()) session.expiresAt = new Date(0);
  assert.equal((await request('/api/me', { headers: { Cookie: cookie } })).status, 401);
  assert.equal((await request('/api/me', { headers: { Cookie: 'gym_session=%ZZ' } })).status, 401);
  assert.equal((await request('/api/logout', { method: 'POST', headers: { Origin: 'https://otro.example' } })).status, 403);
  db.findUserByEmail = async () => { throw new Error('secret'); };
  const failed = await login();
  assert.equal(failed.status, 503);
  assert.equal((await failed.text()).includes('secret'), false);
});
