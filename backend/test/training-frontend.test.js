import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../../js/entrenadores.js', import.meta.url), 'utf8');

// DOM mínimo para ejecutar la inicialización real y observar sus peticiones.
function element() {
  const selectors = new Map(), listeners = new Map();
  return {
    value: '', hidden: false, children: [], textContent: '', listeners,
    elements: new Proxy({}, { get(target, key) { return target[key] ??= { value: '', checked: true }; } }),
    classList: { add() {} },
    querySelector(selector) { if (!selectors.has(selector)) selectors.set(selector, element()); return selectors.get(selector); },
    querySelectorAll() { return []; },
    addEventListener(name, callback) { listeners.set(name, callback); },
    replaceChildren(...children) { this.children = children; },
    append(...children) { this.children.push(...children); },
    get firstElementChild() { return this.children[0]; },
    reset() {},
  };
}

async function page(access, role = 'usuario') {
  const nodes = new Map(), calls = [], events = new Map();
  const find = id => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); };
  const document = {
    hidden: false, getElementById: find, createElement: element,
    querySelector: selector => find(selector.slice(1)),
    addEventListener: (event, callback) => events.set(event, callback),
  };
  const context = {
    document, AbortController, URLSearchParams, Intl, crypto: {},
    window: { clearTimeout() {}, setTimeout() {}, location: { replace() {} } },
    fetch: async url => {
      const path = url.split('?')[0]; calls.push(path);
      const body = path === '/api/entrenamiento/acceso' ? access : { entrenadores: [], horarios: [], reservas: [], conversaciones: [], siguiente: null };
      return { ok: true, status: 200, json: async () => body };
    },
  };
  runInNewContext(source, context);
  const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };
  context.setupTrainingAccount({ rol: role }); await flush();
  return { calls, find, events, flush };
}

test('administrador sin Premium ni perfil carga agenda administrativa e historial propio', async () => {
  const p = await page({ premium: false, entrenador: null }, 'admin');
  for (const path of ['/api/admin/entrenadores', '/api/admin/horarios', '/api/admin/reservas', '/api/reservas']) assert.ok(p.calls.includes(path), path);
  for (const path of ['/api/horarios', '/api/conversaciones', '/api/entrenador/me', '/api/entrenador/reservas', '/api/entrenador/conversaciones']) assert.ok(!p.calls.includes(path), path);
  assert.equal(p.find('panel-entrenador').hidden, true);
  assert.equal(p.find('reserva-controles').hidden, true);
  assert.equal(p.find('administracion-entrenadores').hidden, false);
});

test('Premium carga citas y chat de miembro sin consultar portal de entrenador', async () => {
  const access = { premium: true, entrenador: null }, p = await page(access);
  for (const path of ['/api/horarios', '/api/conversaciones']) assert.ok(p.calls.includes(path), path);
  assert.equal(p.find('reserva-controles').hidden, false);
  assert.ok(!p.calls.includes('/api/entrenador/me'));
  assert.ok(!p.calls.includes('/api/entrenador/reservas'));
  access.premium = false; p.calls.length = 0;
  await p.events.get('membership-updated')(); await p.flush();
  assert.equal(p.find('reserva-controles').hidden, true);
  assert.equal(p.find('chat-miembro-controles').hidden, true);
  assert.ok(!p.calls.includes('/api/horarios'));
  assert.ok(!p.calls.includes('/api/conversaciones'));
});

test('entrenador habilitado carga su agenda y chat sin requerir Premium propio', async () => {
  const access = { premium: false, entrenador: { nombre: 'Entrenadora' } }, p = await page(access);
  assert.equal(p.find('panel-entrenador').hidden, false);
  for (const path of ['/api/entrenador/reservas', '/api/entrenador/conversaciones']) assert.ok(p.calls.includes(path), path);
  assert.ok(!p.calls.includes('/api/horarios'));
  assert.ok(!p.calls.includes('/api/conversaciones'));
  access.entrenador = null; p.calls.length = 0;
  await p.events.get('membership-updated')(); await p.flush();
  assert.equal(p.find('panel-entrenador').hidden, true);
  assert.ok(!p.calls.includes('/api/entrenador/reservas'));
  assert.ok(!p.calls.includes('/api/entrenador/conversaciones'));
});
