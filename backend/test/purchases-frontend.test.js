import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { randomUUID } from 'node:crypto';

const cartSource = await readFile(new URL('../../js/productos.js', import.meta.url), 'utf8');
const ordersSource = await readFile(new URL('../../js/pedidos.js', import.meta.url), 'utf8');
const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };
function element(tag = 'div') {
  const selectors = new Map();
  return {
    tag, children: [], dataset: {}, value: '', checked: false, hidden: false, disabled: false, textContent: '', listeners: new Map(),
    classList: { add() {}, toggle() {} },
    querySelector(selector) { if (!selectors.has(selector)) selectors.set(selector, element()); return selectors.get(selector); },
    querySelectorAll(selector) { return this.children.flatMap(child => [...(selector.includes(child.tag) ? [child] : []), ...child.querySelectorAll(selector)]); },
    append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } },
    replaceChildren(...nodes) { this.children = []; this.append(...nodes); },
    replaceWith(node) { const index = this.parent.children.indexOf(this); this.parent.children[index] = node; node.parent = this.parent; },
    remove() { this.parent.children.splice(this.parent.children.indexOf(this), 1); },
    addEventListener(name, callback) { this.listeners.set(name, callback); },
    setAttribute() {}, focus() {}, getClientRects() { return [1]; },
  };
}
function dom() {
  const nodes = new Map(), storage = new Map(), navigations = [], calls = [];
  const find = id => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); };
  const document = { body: element('body'), getElementById: find, createElement: element, querySelector: selector => find(selector.slice(1)), querySelectorAll: () => [], addEventListener() {} };
  const context = {
    document, Intl, URLSearchParams, AbortController, crypto: { randomUUID },
    sessionStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    window: { addEventListener() {}, confirm: () => true, location: { search: '', assign: url => navigations.push(url), replace: url => navigations.push(url) } },
  };
  return { context, find, calls, storage, navigations };
}

async function store({ loggedIn = true, failFirst = false } = {}) {
  const p = dom(), product = { _id: '123456789012345678901234', nombre: 'Proteína', precio: 150000, stock: 10, descripcion: 'Producto', imagen: 'img/proteina.png' };
  let failed = false;
  p.context.fetch = async (url, options = {}) => {
    p.calls.push({ url, options });
    if (url === '/api/pedidos' && failFirst && !failed) { failed = true; throw new Error('respuesta perdida'); }
    const body = url === '/api/productos' ? { productos: [product], siguiente: null } : url === '/api/me' ? { usuario: { id: '223456789012345678901234' } } : url === '/api/carrito/verificar' ? { items: [{ producto: product, cantidad: 1 }], cambios: [], total: product.precio } : { message: 'Compra registrada', pedido: { _id: '323456789012345678901234' } };
    return { status: url === '/api/me' && !loggedIn ? 401 : 200, ok: url !== '/api/me' || loggedIn, json: async () => body };
  };
  runInNewContext(cartSource, p.context); p.context.setupProductStore(); await flush();
  const panel = p.context.document.body.children.find(node => node.id === 'panel-carrito');
  const add = p.find('productos-lista').children[0].children.find(node => node.tag === 'button');
  await add.listeners.get('click')();
  return { ...p, panel, product, checkout: panel.querySelector('.carrito-crear'), confirmation: panel.querySelector('.carrito-confirmacion input') };
}

test('carrito compra sin consultar modo demo y exige confirmación del total', async () => {
  const p = await store();
  assert.equal(p.checkout.textContent, 'Comprar');
  assert.ok(!p.calls.some(call => call.url.includes('/simulacion')));
  await p.checkout.listeners.get('click')();
  assert.ok(!p.calls.some(call => call.url === '/api/pedidos'));
  p.confirmation.checked = true; await p.checkout.listeners.get('click')();
  const body = JSON.parse(p.calls.find(call => call.url === '/api/pedidos').options.body);
  assert.equal(body.totalEsperado, 150000); assert.equal(body.items[0].cantidad, 1);
  assert.equal(p.storage.size, 0);
  assert.match(p.navigations[0], /micuenta\.html\?pedido=.*#mis-pedidos/);
});

test('respuesta perdida bloquea edición y recupera la compra con la misma clave e importe', async () => {
  const p = await store({ failFirst: true });
  p.confirmation.checked = true; await p.checkout.listeners.get('click')();
  assert.equal(p.checkout.textContent, 'Recuperar compra'); assert.equal(p.confirmation.disabled, true);
  const original = JSON.parse(p.calls.find(call => call.url === '/api/pedidos').options.body);
  p.product.precio = 200000; await p.checkout.listeners.get('click')();
  const retry = JSON.parse(p.calls.filter(call => call.url === '/api/pedidos')[1].options.body);
  assert.deepEqual(retry, original); assert.equal(p.storage.size, 0);
});

test('iniciar sesión conserva el carrito y verificarlo invalida la confirmación anterior', async () => {
  const loggedOut = await store({ loggedIn: false });
  await loggedOut.checkout.listeners.get('click')();
  assert.equal(loggedOut.navigations[0], 'login.html?volver=tienda'); assert.equal(loggedOut.storage.size, 1);
  const p = await store(); p.confirmation.checked = true;
  await p.panel.querySelector('.carrito-pagar').listeners.get('click')();
  assert.equal(p.confirmation.checked, false);
});

const order = { _id: '123456789012345678901234', tipo: 'compra', estado: 'pendiente', creadoEn: '2026-10-05T15:00:00Z', total: 150000, items: [{ nombre: 'Proteína', cantidad: 1, precioUnitario: 150000, subtotal: 150000 }], comprador: { nombre: 'Ana', correo: 'ana@example.invalid' } };
async function account(role = 'usuario', legacy = false) {
  const p = dom();
  p.context.fetch = async (url, options = {}) => {
    p.calls.push({ url, options });
    return { status: 200, ok: true, json: async () => ({ pedidos: [{ ...order, tipo: legacy ? 'simulado' : 'compra' }], siguiente: null, message: 'Operación confirmada' }) };
  };
  runInNewContext(ordersSource, p.context); p.context.setupOrdersAccount({ rol: role }); await flush(); return p;
}

test('perfil permite cancelar compras propias; administrador confirma pago y muestra comprador', async () => {
  const member = await account();
  const buttons = member.find('pedidos-lista').querySelectorAll('button');
  assert.deepEqual(buttons.map(b => b.textContent), ['Cancelar compra']);
  assert.ok(!member.calls.some(call => call.url.startsWith('/api/admin')));
  await buttons[0].listeners.get('click')();
  assert.ok(member.calls.some(call => call.url === '/api/pedidos/' + order._id + '/cancelar'));
  const admin = await account('admin');
  const actions = admin.find('pedidos-admin-lista').querySelectorAll('button');
  assert.deepEqual(actions.map(b => b.textContent), ['Confirmar pago recibido', 'Cancelar compra']);
  await actions[0].listeners.get('click')();
  assert.ok(admin.calls.some(call => call.url === '/api/admin/pedidos/' + order._id + '/pagar'));
  assert.equal(admin.find('administracion-pedidos').hidden, false);
});

test('pedidos de prueba anteriores no muestran acciones de compra ni pago', async () => {
  const p = await account('usuario', true);
  assert.equal(p.find('pedidos-lista').querySelectorAll('button').length, 0);
});
