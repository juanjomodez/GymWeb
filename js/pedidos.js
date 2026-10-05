'use strict';

function setupOrdersAccount(user) {
    if (!document.querySelector('#mis-pedidos')) return;
    const controllers = [], panels = [];
    let acting = false;
    const money = value => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value);
    const date = value => new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) + ' (Bogotá)';
    const states = { pendiente: 'Pendiente de pago · Productos reservados', pagado: 'Pagado en el gimnasio · Pendiente de recogida', entregado: 'Entregado', cancelado: 'Cancelado · Productos devueltos al inventario' };
    function controls(disabled) { for (const panel of panels) for (const control of panel.querySelectorAll('button, select')) control.disabled = disabled; }
    function denied(response, panel, admin) {
        if (response.status === 401) { window.location.replace('login.html'); return true; }
        if (admin && response.status === 403) { panel.hidden = true; document.querySelector('#cuenta-mensaje').textContent = 'Ya no tienes permisos de administrador.'; return true; }
        return false;
    }
    function setupList(admin = false) {
        const prefix = admin ? 'pedidos-admin' : 'pedidos';
        const find = suffix => document.getElementById(`${prefix}-${suffix}`);
        const panel = document.getElementById(admin ? 'administracion-pedidos' : 'mis-pedidos');
        panels.push(panel); panel.hidden = false;
        const list = find('lista'), status = find('mensaje'), actionStatus = find('accion-mensaje'), filter = find('estado'), more = find('mas');
        const featured = admin ? null : document.querySelector('#pedido-destacado');
        const selectedId = admin ? null : new URLSearchParams(window.location.search).get('pedido');
        const url = admin ? '/api/admin/pedidos' : '/api/pedidos';
        let next = null, generation = 0, controller;
        function action(order, name, label, question) {
            const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
            button.addEventListener('click', async () => {
                if (acting || !window.confirm(question)) return;
                acting = true; controls(true); actionStatus.textContent = 'Confirmando…';
                try {
                    const response = await fetch(`${url}/${order._id}/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
                    if (denied(response, panel, admin)) return;
                    const body = await response.json(); actionStatus.textContent = body.message;
                } catch { actionStatus.textContent = 'No se pudo confirmar. Actualiza las compras antes de reintentar; la operación no se aplicará dos veces.'; }
                finally { acting = false; controls(false); }
                await Promise.all(controllers.map(item => item.load()));
            });
            return button;
        }
        function card(order) {
            const article = document.createElement('article'); article.className = 'pedido-tarjeta';
            const title = document.createElement('h3'); title.textContent = `Compra ${order._id}`;
            const state = document.createElement('p');
            state.textContent = order.tipo === 'simulado' ? `Pedido de prueba anterior · ${order.estado} · Sin cobro real` : states[order.estado] || order.estado;
            const when = document.createElement('p'); when.textContent = `Fecha: ${date(order.creadoEn)}`;
            article.append(title, state, when);
            if (admin) { const buyer = document.createElement('p'); buyer.textContent = `Comprador: ${order.comprador.nombre} · ${order.comprador.correo}`; article.append(buyer); }
            const items = document.createElement('ul');
            for (const item of order.items) {
                const line = document.createElement('li'); line.textContent = `${item.nombre} · ${item.cantidad} × ${money(item.precioUnitario)} = ${money(item.subtotal)}`; items.append(line);
            }
            const total = document.createElement('p'); total.textContent = `Total: ${money(order.total)} COP`;
            article.append(items, total);
            if (order.tipo === 'compra') {
                for (const [field, label] of [['pagadoEn', 'Pago confirmado'], ['entregadoEn', 'Entregado'], ['canceladoEn', 'Cancelado']]) {
                    if (order[field]) { const timestamp = document.createElement('p'); timestamp.textContent = `${label}: ${date(order[field])}`; article.append(timestamp); }
                }
                if (order.estado === 'pendiente') {
                    if (admin) article.append(action(order, 'pagar', 'Confirmar pago recibido', `¿Ya recibiste ${money(order.total)} por la compra ${order._id}?`));
                    article.append(action(order, 'cancelar', 'Cancelar compra', `¿Cancelar la compra ${order._id} y liberar sus productos reservados?`));
                }
                if (admin && order.estado === 'pagado') article.append(action(order, 'entregar', 'Confirmar entrega', `¿Ya entregaste todos los productos de la compra ${order._id}?`));
            }
            return article;
        }
        async function load(append = false) {
            if (acting || panel.hidden) return;
            const current = ++generation; controller?.abort(); controller = new AbortController();
            status.textContent = 'Cargando compras…'; more.disabled = true;
            if (!append) { list.replaceChildren(); featured?.replaceChildren(); next = null; more.hidden = true; }
            try {
                const query = new URLSearchParams(); if (filter.value) query.set('estado', filter.value); if (append && next) query.set('despues', next);
                const response = await fetch(url + '?' + query, { cache: 'no-store', signal: controller.signal });
                if (current !== generation || denied(response, panel, admin)) return;
                const body = await response.json(); if (current !== generation) return;
                if (!response.ok) { status.textContent = body.message; return; }
                if (!append && /^[a-f0-9]{24}$/.test(selectedId || '')) {
                    const selected = await fetch(`/api/pedidos/${selectedId}`, { cache: 'no-store', signal: controller.signal });
                    if (current !== generation || denied(selected, panel, admin)) return;
                    if (selected.ok) {
                        const detail = await selected.json(); if (current !== generation) return;
                        featured.append(card(detail.pedido));
                    } else if (selected.status !== 404) throw new Error();
                }
                for (const order of body.pedidos) if (order._id !== selectedId || !featured?.children.length) list.append(card(order));
                next = body.siguiente; more.hidden = !next;
                status.textContent = list.children.length || featured?.children.length ? 'Historial de compras.' : 'Todavía no hay compras para mostrar.';
            } catch (error) { if (current === generation && error.name !== 'AbortError') status.textContent = 'No se pudo actualizar el historial. Intenta nuevamente.'; }
            finally { if (current === generation) more.disabled = acting; }
        }
        filter.addEventListener('change', () => load()); more.addEventListener('click', () => load(true)); find('actualizar').addEventListener('click', () => load());
        const api = { load }; controllers.push(api); return api;
    }
    setupList();
    if (user?.rol === 'admin') setupList(true);
    for (const controller of controllers) controller.load();
}
