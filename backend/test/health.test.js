import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/database.js';

async function requestHealth(t, database) {
  const server = createApp(database).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await database.close?.();
  });
  return fetch(`http://127.0.0.1:${server.address().port}/health`);
}

test('health ejecuta la comprobación en cada petición', async t => {
  let calls = 0;
  const response = await requestHealth(t, { async ping() { calls++; } });
  assert.equal(calls, 1);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { status: 'ok', database: 'connected' });
  const second = await requestHealth(t, { async ping() { calls++; } });
  assert.equal(second.status, 200);
  assert.equal(calls, 2);
});

test('health oculta errores y devuelve 503 cuando falla la DB', async t => {
  const response = await requestHealth(t, { async ping() { throw new Error('secret'); } });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: 'error', database: 'unavailable' });
});

test('sin URI real devuelve 503', async t => {
  const response = await requestHealth(t, createDatabase({ uri: '', database: 'GymWeb' }));
  assert.equal(response.status, 503);
});

test('servidor MongoDB inaccesible devuelve 503 con el driver real', async t => {
  const response = await requestHealth(t, createDatabase({
    uri: 'mongodb://127.0.0.1:1', database: 'GymWeb',
  }));
  assert.equal(response.status, 503);
});
