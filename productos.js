'use strict';

const productCurrency = value => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value);
function productCard(product) {
    const card = document.createElement('article');
    const image = document.createElement('img');
    image.src = product.imagen; image.alt = product.nombre;
    const title = document.createElement('h3'); title.textContent = product.nombre;
    const description = document.createElement('p'); description.textContent = product.descripcion;
    const price = document.createElement('p'); price.textContent = productCurrency(product.precio);
    const stock = document.createElement('p'); stock.textContent = product.stock > 0 ? `Existencias: ${product.stock}` : 'Agotado';
    card.append(image, title, description, price, stock);
    return card;
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('#productos')) setupProductStore();
});

function setupProductStore() {
    const list = document.querySelector('#productos-lista');
    const status = document.querySelector('#productos-mensaje');
    const refresh = document.querySelector('#productos-actualizar');
    const more = document.querySelector('#productos-mas');
    const products = new Map(), cart = new Map();
    let next = null, loading = false, verifying = false;
    const cartButton = document.createElement('button');
    cartButton.type = 'button'; cartButton.className = 'carrito-flotante';
    cartButton.setAttribute('aria-expanded', 'false'); cartButton.setAttribute('aria-controls', 'panel-carrito');
    cartButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 3h2l2.2 11.2a2 2 0 0 0 2 1.6h8.9a2 2 0 0 0 1.9-1.4L21 7H6"></path><circle cx="9" cy="20" r="1.4"></circle><circle cx="18" cy="20" r="1.4"></circle></svg><span class="carrito-contador" aria-live="polite">0</span>';
    const backdrop = document.createElement('div'); backdrop.className = 'carrito-fondo'; backdrop.hidden = true;
    const panel = document.createElement('aside'); panel.className = 'panel-carrito'; panel.id = 'panel-carrito';
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'carrito-titulo');
    panel.hidden = true;
    panel.innerHTML = '<div class="carrito-encabezado"><div><p class="carrito-kicker">GYMFLOW STORE</p><h2 id="carrito-titulo">Tu carrito</h2></div><button class="carrito-cerrar" type="button" aria-label="Cerrar carrito">×</button></div><div class="carrito-items" aria-live="polite"></div><div class="carrito-vacio"><h3>Tu carrito está vacío</h3><p>Agrega productos y aparecerán aquí.</p></div><div class="carrito-pie" hidden><div class="carrito-total"><span>Total estimado</span><strong></strong></div><button class="carrito-pagar" type="button">Actualizar total</button><p class="carrito-nota">El carrito no reserva existencias. Los pedidos y su pago simulado estarán disponibles en la siguiente fase.</p></div><p class="carrito-feedback" role="status" aria-live="polite"></p>';
    document.body.append(backdrop, panel, cartButton);
    const feedback = panel.querySelector('.carrito-feedback');
    const verify = panel.querySelector('.carrito-pagar');
    function renderCart() {
        const count = [...cart.values()].reduce((total, item) => total + item.cantidad, 0);
        cartButton.querySelector('.carrito-contador').textContent = count;
        cartButton.setAttribute('aria-label', `Abrir carrito, ${count} productos`);
        panel.querySelector('.carrito-vacio').hidden = count > 0;
        panel.querySelector('.carrito-pie').hidden = count === 0;
        panel.querySelector('.carrito-total strong').textContent = productCurrency([...cart.values()].reduce((total, item) => total + item.producto.precio * item.cantidad, 0));
        const target = panel.querySelector('.carrito-items'); target.replaceChildren();
        for (const [id, item] of cart) {
            const row = document.createElement('article'); row.className = 'carrito-item';
            const image = document.createElement('img'); image.src = item.producto.imagen; image.alt = '';
            const info = document.createElement('div'); info.className = 'carrito-item-info';
            const title = document.createElement('h3'); title.textContent = item.producto.nombre;
            const price = document.createElement('p'); price.textContent = productCurrency(item.producto.precio);
            info.append(title, price);
            const controls = document.createElement('div'); controls.className = 'carrito-cantidad';
            for (const [action, symbol, label] of [['decrease', '−', 'Quitar una unidad de'], ['increase', '+', 'Agregar una unidad de']]) {
                const button = document.createElement('button'); button.type = 'button'; button.textContent = symbol;
                button.setAttribute('aria-label', `${label} ${item.producto.nombre}`);
                button.disabled = verifying || action === 'increase' && item.cantidad >= Math.min(99, item.producto.stock);
                button.addEventListener('click', () => {
                    if (verifying) return;
                    if (action === 'decrease' && item.cantidad === 1) cart.delete(id);
                    else item.cantidad += action === 'increase' ? 1 : -1;
                    feedback.textContent = ''; renderCart();
                });
                controls.append(button);
                if (action === 'decrease') { const amount = document.createElement('span'); amount.textContent = item.cantidad; controls.append(amount); }
            }
            const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'carrito-eliminar'; remove.textContent = 'Quitar';
            remove.setAttribute('aria-label', `Eliminar ${item.producto.nombre} del carrito`); remove.disabled = verifying;
            remove.addEventListener('click', () => { if (!verifying) { cart.delete(id); feedback.textContent = ''; renderCart(); } });
            row.append(image, info, controls, remove); target.append(row);
        }
        verify.disabled = verifying;
        for (const button of list.querySelectorAll('button')) button.disabled = loading || verifying || products.get(button.dataset.productId)?.stock === 0;
    }
    function storeCard(product) {
        const card = productCard(product); card.dataset.productId = product._id;
        const add = document.createElement('button'); add.type = 'button'; add.dataset.productId = product._id;
        add.textContent = product.stock ? 'Agregar al carrito' : 'Agotado'; add.disabled = loading || verifying || product.stock === 0;
        add.addEventListener('click', () => {
            if (loading || verifying) return;
            const latest = products.get(product._id);
            if (!latest) return;
            const current = cart.get(product._id), quantity = (current?.cantidad || 0) + 1;
            if (quantity > Math.min(99, latest.stock) || !current && cart.size >= 20) { status.textContent = 'Límite alcanzado: hasta 20 productos distintos, 99 unidades por producto y las existencias mostradas.'; return; }
            cart.set(product._id, { producto: latest, cantidad: quantity }); feedback.textContent = ''; renderCart();
            status.textContent = `${latest.nombre} agregado al carrito.`;
        });
        card.append(add); return card;
    }
    async function verifyCart(fromLoad = false) {
        if (verifying || loading && !fromLoad || cart.size === 0) return;
        verifying = true; renderCart(); feedback.textContent = 'Comprobando precios y existencias…';
        try {
            const response = await fetch('/api/carrito/verificar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [...cart].map(([productoId, item]) => ({ productoId, cantidad: item.cantidad })) }) });
            const body = await response.json();
            if (!response.ok) { feedback.textContent = body.message; return; }
            const pricesChanged = body.items.some(item => cart.get(item.producto._id)?.producto.precio !== item.producto.precio);
            cart.clear();
            for (const item of body.items) {
                cart.set(item.producto._id, item); products.set(item.producto._id, item.producto);
                const card = [...list.children].find(card => card.dataset.productId === item.producto._id);
                card?.replaceWith(storeCard(item.producto));
            }
            feedback.textContent = body.cambios.length || pricesChanged ? 'Carrito actualizado: cambiaron precios, cantidades o disponibilidad. Revisa el total y los productos.' : 'Precios y existencias verificados. No se creó ningún pedido ni se realizó un cobro.';
            // Retirar tarjetas obsoletas; la próxima actualización vuelve a leer el catálogo.
            for (const change of body.cambios) if (!cart.has(change.productoId)) {
                products.delete(change.productoId);
                const card = [...list.children].find(card => card.dataset.productId === change.productoId);
                card?.remove();
            }
        } catch { feedback.textContent = 'No se pudo verificar el carrito. El total sigue siendo estimado; vuelve a actualizarlo.'; }
        finally { verifying = false; renderCart(); }
    }
    function setOpen(open) {
        panel.hidden = !open; backdrop.hidden = !open;
        panel.classList.toggle('carrito-abierto', open); cartButton.setAttribute('aria-expanded', String(open));
        document.body.classList.toggle('carrito-bloqueo-scroll', open);
        for (const section of document.querySelectorAll('header, main, footer')) section.inert = open;
        if (open) { panel.querySelector('.carrito-cerrar').focus(); verifyCart(); }
        else cartButton.focus();
    }
    cartButton.addEventListener('click', () => setOpen(panel.hidden));
    panel.querySelector('.carrito-cerrar').addEventListener('click', () => setOpen(false));
    backdrop.addEventListener('click', () => setOpen(false));
    document.addEventListener('keydown', event => {
        if (panel.hidden) return;
        if (event.key === 'Escape') setOpen(false);
        if (event.key === 'Tab') {
            const focusable = [...panel.querySelectorAll('button:not(:disabled)')].filter(element => element.getClientRects().length);
            const first = focusable[0], last = focusable.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
    });
    verify.addEventListener('click', () => verifyCart());
    async function load(append = false) {
        if (loading || verifying) return;
        loading = true; refresh.disabled = more.disabled = true;
        if (!append) { list.replaceChildren(); products.clear(); next = null; more.hidden = true; }
        status.textContent = 'Cargando productos…'; renderCart();
        try {
            const response = await fetch('/api/productos' + (append && next ? `?despues=${encodeURIComponent(next)}` : ''), { cache: 'no-store' });
            const body = await response.json();
            if (!response.ok) { status.textContent = body.message; return; }
            for (const product of body.productos) {
                products.set(product._id, product);
                list.append(storeCard(product));
            }
            next = body.siguiente; more.hidden = !next;
            status.textContent = list.children.length ? `${list.children.length} productos en el catálogo.` : 'No hay productos disponibles.';
            await verifyCart(true);
        } catch { status.textContent = 'No se pudieron cargar los productos. Abre la web desde el backend y pulsa Actualizar productos.'; }
        finally { loading = false; refresh.disabled = more.disabled = false; renderCart(); }
    }
    refresh.addEventListener('click', () => load()); more.addEventListener('click', () => load(true));
    window.addEventListener('pageshow', event => { if (event.persisted) load(); });
    renderCart(); load();
}

function setupProductAdministration(usuario) {
    const panel = document.querySelector('#administracion-productos');
    if (!panel || usuario.rol !== 'admin') return;
    panel.hidden = false;
    const list = document.querySelector('#productos-admin-lista'), status = document.querySelector('#productos-admin-mensaje');
    const form = document.querySelector('#producto-formulario'), formStatus = document.querySelector('#producto-form-mensaje');
    const filter = document.querySelector('#productos-disponibilidad'), more = document.querySelector('#productos-admin-mas');
    const submit = document.querySelector('#producto-guardar'), cancel = document.querySelector('#producto-cancelar');
    let editing = null, next = null, busy = false;
    function controls(disabled) { busy = disabled; for (const control of panel.querySelectorAll('button, input, textarea, select')) control.disabled = disabled; }
    function denied(response) {
        if (response.status === 401) { window.location.replace('login.html'); return true; }
        if (response.status === 403) { panel.hidden = true; document.querySelector('#cuenta-mensaje').textContent = 'Ya no tienes permisos de administrador.'; return true; }
        return false;
    }
    function reset() {
        editing = null; form.reset(); cancel.hidden = true;
        document.querySelector('#producto-editor-titulo').textContent = 'Crear producto'; submit.textContent = 'Crear producto';
    }
    function edit(product) {
        if (busy) return;
        editing = product;
        for (const key of ['nombre', 'descripcion', 'precio', 'stock', 'imagen']) form.elements[key].value = product[key];
        form.elements.disponible.checked = product.disponible;
        cancel.hidden = false; document.querySelector('#producto-editor-titulo').textContent = 'Editar producto'; submit.textContent = 'Guardar producto';
        formStatus.textContent = ''; form.scrollIntoView({ block: 'start' }); form.elements.nombre.focus({ preventScroll: true });
    }
    async function load(append = false) {
        if (busy) return;
        controls(true); status.textContent = 'Cargando catálogo…';
        if (!append) { list.replaceChildren(); next = null; more.hidden = true; }
        try {
            const query = new URLSearchParams({ disponibilidad: filter.value }); if (append && next) query.set('despues', next);
            const response = await fetch('/api/admin/productos?' + query, { cache: 'no-store' });
            if (denied(response)) return;
            const body = await response.json(); if (!response.ok) { status.textContent = body.message; return; }
            for (const product of body.productos) {
                const card = productCard(product);
                const state = document.createElement('p'); state.textContent = product.disponible ? 'Publicado' : 'Deshabilitado';
                const editButton = document.createElement('button'); editButton.type = 'button'; editButton.textContent = 'Editar producto'; editButton.addEventListener('click', () => edit(product));
                const toggle = document.createElement('button'); toggle.type = 'button'; toggle.textContent = product.disponible ? 'Deshabilitar producto' : 'Habilitar producto';
                toggle.addEventListener('click', async () => {
                    if (busy) return;
                    controls(true); let changed = false;
                    try {
                        const response = await fetch(`/api/admin/productos/${product._id}/disponibilidad`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ disponible: !product.disponible, version: product.version }) });
                        if (denied(response)) return;
                        const body = await response.json(); status.textContent = body.message; changed = response.ok;
                        if (changed && editing?._id === product._id && editing.version === product.version) { editing = { ...editing, version: body.producto.version }; form.elements.disponible.checked = body.producto.disponible; }
                    } catch { status.textContent = 'No se pudo confirmar el cambio. Actualiza el catálogo antes de reintentar.'; }
                    finally { controls(false); }
                    if (changed) await load();
                });
                card.append(state, editButton, toggle); list.append(card);
            }
            next = body.siguiente; more.hidden = !next; status.textContent = list.children.length ? `${list.children.length} productos en el catálogo administrativo.` : 'No hay productos en este estado.';
        } catch { status.textContent = 'No se pudo cargar el catálogo. Intenta actualizar.'; }
        finally { controls(false); }
    }
    form.addEventListener('submit', async event => {
        event.preventDefault(); if (busy || !form.reportValidity()) return;
        const payload = { nombre: form.elements.nombre.value, descripcion: form.elements.descripcion.value, precio: Number(form.elements.precio.value), stock: Number(form.elements.stock.value), imagen: form.elements.imagen.value, disponible: form.elements.disponible.checked, ...(editing ? { version: editing.version } : {}) };
        controls(true); formStatus.textContent = 'Guardando producto…'; let saved = false;
        try {
            const response = await fetch(editing ? `/api/admin/productos/${editing._id}` : '/api/admin/productos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (denied(response)) return;
            const body = await response.json(); formStatus.textContent = body.message; saved = response.ok; if (saved) reset();
        } catch { formStatus.textContent = 'No se pudo confirmar el guardado. Revisa el catálogo antes de reintentar; tus datos siguen en el formulario.'; }
        finally { controls(false); }
        if (saved) await load();
    });
    cancel.addEventListener('click', () => { if (!busy) { reset(); formStatus.textContent = ''; } });
    filter.addEventListener('change', () => load()); document.querySelector('#productos-admin-actualizar').addEventListener('click', () => load()); more.addEventListener('click', () => load(true));
    reset(); load();
}
