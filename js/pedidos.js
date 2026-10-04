'use strict';

function setupOrdersAccount() {
    const panel = document.querySelector('#mis-pedidos');
    if (!panel) return;
    const list = document.querySelector('#pedidos-lista'), featured = document.querySelector('#pedido-destacado');
    const status = document.querySelector('#pedidos-mensaje'), actionStatus = document.querySelector('#pedidos-accion-mensaje');
    const filter = document.querySelector('#pedidos-estado'), more = document.querySelector('#pedidos-mas');
    const selectedId = new URLSearchParams(window.location.search).get('pedido');
    let next = null, busy = false, simulation = false;
    const money = value => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value);
    const date = value => new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) + ' (Bogotá)';
    function controls(disabled) { busy = disabled; for (const control of panel.querySelectorAll('button, select')) control.disabled = disabled; }
    function denied(response) { if (response.status === 401) { window.location.replace('login.html'); return true; } return false; }
    function card(order) {
        const article = document.createElement('article'); article.className = 'pedido-tarjeta';
        const title = document.createElement('h3'); title.textContent = `Pedido ${order._id}`;
        const state = document.createElement('p'); state.textContent = order.estado === 'pagado' ? 'Pagado en simulación · Sin cobro real' : 'Pendiente · Sin reserva de existencias';
        const when = document.createElement('p'); when.textContent = `Creado: ${date(order.creadoEn)}`;
        const items = document.createElement('ul');
        for (const item of order.items) {
            const line = document.createElement('li'); line.textContent = `${item.nombre} · ${item.cantidad} × ${money(item.precioUnitario)} = ${money(item.subtotal)}`; items.append(line);
        }
        const total = document.createElement('p'); total.textContent = `Total del pedido: ${money(order.total)} COP`;
        article.append(title, state, when, items, total);
        if (order.pagoSimulado) {
            const receipt = document.createElement('p'); receipt.textContent = `Último pago simulado: ${order.pagoSimulado.resultado} · ${money(order.pagoSimulado.monto)} · ${date(order.pagoSimulado.registradaEn)}. Sin cobro real.`; article.append(receipt);
        }
        if (order.estado === 'pendiente' && simulation) {
            const label = document.createElement('label'); label.textContent = 'Resultado del pago de este pedido';
            const select = document.createElement('select'); select.id = `pago-pedido-${order._id}`; label.htmlFor = select.id;
            for (const [value, text] of [['aprobado', 'Aprobado: descontar existencias'], ['rechazado', 'Rechazado: mantener pendiente']]) { const option = document.createElement('option'); option.value = value; option.textContent = text; select.append(option); }
            const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Simular pago del pedido';
            button.addEventListener('click', async () => {
                if (busy) return;
                controls(true); actionStatus.textContent = 'Procesando el pago simulado del pedido…';
                try {
                    const response = await fetch(`/api/pedidos/${order._id}/pago-simulado`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resultado: select.value }) });
                    if (denied(response)) return;
                    const body = await response.json(); actionStatus.textContent = body.message;
                } catch { actionStatus.textContent = 'No se pudo confirmar el pago. Actualiza Mis pedidos antes de reintentar; una aprobación no vuelve a descontar existencias.'; }
                finally { controls(false); }
                await load();
            });
            article.append(label, select, button);
        }
        return article;
    }
    async function load(append = false) {
        if (busy) return;
        controls(true); status.textContent = 'Cargando pedidos…';
        if (!append) { list.replaceChildren(); featured.replaceChildren(); next = null; more.hidden = true; }
        try {
            const query = new URLSearchParams(); if (filter.value) query.set('estado', filter.value); if (append && next) query.set('despues', next);
            const response = await fetch('/api/pedidos?' + query, { cache: 'no-store' });
            if (denied(response)) return;
            const body = await response.json(); if (!response.ok) { status.textContent = body.message; return; }
            simulation = body.simulacionHabilitada;
            if (!append && /^[a-f0-9]{24}$/.test(selectedId || '')) {
                const selected = await fetch(`/api/pedidos/${selectedId}`, { cache: 'no-store' });
                if (denied(selected)) return;
                if (selected.ok) featured.append(card((await selected.json()).pedido));
                else if (selected.status !== 404) throw new Error();
            }
            for (const order of body.pedidos) if (order._id !== selectedId || !featured.children.length) list.append(card(order));
            next = body.siguiente; more.hidden = !next;
            status.textContent = list.children.length || featured.children.length ? 'Historial de pedidos simulados. No se realizan cobros reales.' : 'Todavía no tienes pedidos.';
            if (!simulation) status.textContent += ' La simulación de pagos está deshabilitada en este servidor.';
        } catch { status.textContent = 'No se pudo actualizar el historial. Intenta nuevamente.'; }
        finally { controls(false); }
    }
    filter.addEventListener('change', () => load()); more.addEventListener('click', () => load(true));
    document.querySelector('#pedidos-actualizar').addEventListener('click', () => load());
    load();
}
