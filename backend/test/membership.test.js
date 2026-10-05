import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { initialPlans } from '../src/plans.js';

async function fixture(t) {
  const memberships = new Map();
  const db = {
    async findSessionUser(hash) { return { id: hash, nombre: 'Ana', correo: 'ana@example.com' }; },
    async listPlans() { return initialPlans; },
    async findPlan(id) { return initialPlans.find(p => p._id === id); },
    async findMembership(id) { return memberships.get(id) || null; },
    async createMembership(value) {
      if (memberships.has(value._id)) throw Object.assign(new Error(), { code: 11000 });
      memberships.set(value._id, value);
    },
  };
  const server = createApp(db).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const cookie = `gym_session=${'a'.repeat(64)}`;
  const request = (path, options = {}) => fetch(base + path, options);
  const post = body => request('/api/membresia', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { request, post, cookie, db };
}

test('catálogo público, solicitud autenticada, precio del servidor y aislamiento', async t => {
  const { request, post, cookie } = await fixture(t);
  assert.equal((await request('/api/planes')).status, 200);
  assert.equal((await request('/api/membresia')).status, 401);
  assert.equal((await request('/api/membresia', { method: 'POST' })).status, 401);
  const created = await post({ planId: 'basico', precio: 1, estado: 'activa', userId: 'otro' });
  assert.equal(created.status, 201);
  const membership = (await created.json()).membresia;
  assert.equal(membership.precio, 60000);
  assert.equal(membership.estado, 'pendiente');
  assert.equal(membership.inicio, null);
  assert.equal(membership.fin, null);
  assert.equal((await post({ planId: 'familiar' })).status, 409);
  assert.equal((await (await request('/api/membresia', { headers: { Cookie: cookie } })).json()).membresia.planId, 'basico');
  const other = await request('/api/membresia', { headers: { Cookie: `gym_session=${'b'.repeat(64)}` } });
  assert.equal((await other.json()).membresia, null);
});

test('rechaza datos inválidos, plan inexistente, duplicados concurrentes y fallo DB', async t => {
  const { post, db, request } = await fixture(t);
  assert.equal((await post({ planId: { $ne: null } })).status, 400);
  assert.equal((await post({ planId: 'inexistente' })).status, 404);
  const responses = await Promise.all([post({ planId: 'basico' }), post({ planId: 'familiar' })]);
  assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
  db.listPlans = async () => { throw new Error('secret'); };
  const failure = await request('/api/planes');
  assert.equal(failure.status, 503);
  assert.equal((await failure.text()).includes('secret'), false);
});
