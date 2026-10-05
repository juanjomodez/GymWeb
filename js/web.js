"use strict";

document.addEventListener("DOMContentLoaded", () => {
    setupScrollAnimations();
    setupMembershipActions();
    setupAuthForms();
    setupAccount();
    updateAccountNavigation();
});

// Revalidar también al volver con Atrás desde la caché del navegador.
window.addEventListener('pageshow', event => {
    if (event.persisted) {
        updateAccountNavigation();
        if (document.querySelector('#cuenta-mensaje')) window.location.reload();
    }
});

async function updateAccountNavigation() {
    const link = document.querySelector('#enlace-cuenta');
    if (!link) return;
    try {
        const response = await fetch('/api/me', { cache: 'no-store', credentials: 'same-origin' });
        if (response.ok) {
            link.href = 'micuenta.html';
            link.textContent = 'Mi cuenta';
        } else if (response.status === 401) {
            link.href = 'login.html';
            link.textContent = 'Iniciar sesión';
        }
    } catch {
        // Un fallo de red no significa que la sesión se haya cerrado.
    }
}

function setupScrollAnimations() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const groups = [
        { selector: "#inicio > div:last-child, #inicio h1, #inicio p, #inicio a", stagger: false },
        { selector: "#planes h2, #entrenadores h2, #rutinas h2, #productos h2, #contacto h2", stagger: false },
        { selector: "#planes > p, #entrenadores > p, #rutinas > p, #productos > p, #contacto > p:not(.dato-contacto)", stagger: false },
        { selector: "#planes article, #entrenadores article, #rutinas article, #productos article", stagger: true },
        { selector: "#contacto .dato-contacto", stagger: true }
    ];
    const elements = new Set();

    groups.forEach(({ selector, stagger }) => {
        document.querySelectorAll(selector).forEach((element, index) => {
            if (elements.has(element)) return;
            elements.add(element);
            element.classList.add("animar-entrada");
            if (stagger) element.style.setProperty("--retraso-entrada", `${(index % 4) * 90}ms`);
        });
    });

    if (!("IntersectionObserver" in window)) {
        elements.forEach((element) => element.classList.add("entrada-visible"));
        return;
    }

    const observer = new IntersectionObserver((entries, currentObserver) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("entrada-visible");
            currentObserver.unobserve(entry.target);
        });
    }, { threshold: 0.12, rootMargin: "0px 0px -36px 0px" });

    elements.forEach((element) => observer.observe(element));
}

function createStatusMessage(parent, className = "mensaje-interfaz") {
    const message = document.createElement("p");
    message.className = className;
    message.setAttribute("role", "status");
    message.setAttribute("aria-live", "polite");
    parent.append(message);
    return message;
}

async function setupMembershipActions() {
    const section = document.querySelector("#planes");
    if (!section) return;
    const feedback = createStatusMessage(section);
    const container = section.querySelector(":scope > div");
    // Las tarjetas estáticas siguen visibles si el backend no está disponible.
    try {
        const response = await fetch("/api/planes", { cache: "no-store" });
        if (!response.ok) throw new Error();
        const { planes } = await response.json();
        container.replaceChildren();
        const currency = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
        for (const plan of planes) {
            const card = document.createElement("article");
            const title = document.createElement("h3");
            title.textContent = plan.nombre;
            const description = document.createElement("p");
            description.textContent = `Hasta ${plan.maxPersonas} ${plan.maxPersonas === 1 ? "persona" : "personas"}.`;
            const list = document.createElement("ul");
            for (const benefit of plan.beneficios) {
                const item = document.createElement("li");
                item.textContent = benefit;
                list.append(item);
            }
            const priceBox = document.createElement("div");
            priceBox.className = "precio";
            const price = document.createElement("p");
            price.className = "valor-precio";
            price.textContent = `${currency.format(plan.precio)} / ${plan.periodo}`;
            const choose = document.createElement("button");
            choose.type = "button";
            choose.className = "plan-accion";
            choose.textContent = "Solicitar este plan";
            choose.addEventListener("click", async () => {
                choose.disabled = true;
                feedback.textContent = "Enviando solicitud…";
                try {
                    const result = await fetch("/api/membresia", {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ planId: plan._id })
                    });
                    if (result.status === 401) {
                        window.location.assign(`login.html?plan=${encodeURIComponent(plan._id)}`);
                        return;
                    }
                    const body = await result.json();
                    feedback.textContent = body.message;
                    if (result.ok || result.status === 409) window.location.assign("micuenta.html");
                } catch { feedback.textContent = "No se pudo enviar la solicitud. Intenta nuevamente."; }
                finally { choose.disabled = false; }
            });
            priceBox.append(price, choose);
            card.append(title, description, list, priceBox);
            container.append(card);
        }
        feedback.textContent = planes.length ? "Las solicitudes quedan pendientes de activación. No se realiza ningún cobro." : "No hay planes disponibles.";
    } catch { feedback.textContent = "No se pudieron cargar los planes. Abre la web desde http://127.0.0.1:3000 y comprueba el backend."; }
}
function setupAuthForms() {
    const form = document.querySelector(".formulario form");
    if (!form) return;

    const card = form.closest(".formulario");
    const feedback = createStatusMessage(card, "mensaje-interfaz");
    const password = form.querySelector("#password");
    const confirmation = form.querySelector("#confirmar-password");
    const registration = Boolean(confirmation);
    const selectedPlanId = new URLSearchParams(window.location.search).get('plan');
    const returnToStore = new URLSearchParams(window.location.search).get('volver') === 'tienda';
    if (selectedPlanId || returnToStore) {
        const alternate = card.querySelector(registration ? 'a[href="login.html"]' : 'a[href="registro.html"]');
        const query = new URLSearchParams();
        if (selectedPlanId) query.set('plan', selectedPlanId);
        if (returnToStore) query.set('volver', 'tienda');
        if (alternate) alternate.href += '?' + query;
    }

    if (registration) {
        const selectedPlan = new URLSearchParams(window.location.search).get("plan");
        if (selectedPlan) {
            feedback.textContent = `Plan seleccionado: ${selectedPlan}. Podrás confirmar la solicitud después de iniciar sesión.`;
        }

        const validatePasswords = () => {
            confirmation.setCustomValidity(
                confirmation.value && confirmation.value !== password.value
                    ? "Las contraseñas no coinciden."
                    : ""
            );
        };
        password.addEventListener("input", validatePasswords);
        confirmation.addEventListener("input", validatePasswords);
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!form.reportValidity()) return;

        feedback.classList.add("mensaje-visible");
        if (window.location.protocol === "file:") {
            feedback.textContent = "Abre esta página desde http://127.0.0.1:3000 para continuar.";
            return;
        }
        const button = form.querySelector('button[type="submit"]');
        if (button.disabled) return;
        button.disabled = true;
        feedback.textContent = registration ? "Creando tu cuenta…" : "Iniciando sesión…";
        try {
            const response = await fetch(registration ? "/api/usuarios" : "/api/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...(registration ? { nombre: form.querySelector("#nombre").value } : {}),
                    correo: form.querySelector("#correo").value,
                    password: password.value
                })
            });
            const result = await response.json();
            feedback.textContent = result.message || "No se pudo completar el registro.";
            if (response.ok) {
                if (!registration) {
                    const plan = new URLSearchParams(window.location.search).get('plan');
                    window.location.assign(plan ? `micuenta.html?plan=${encodeURIComponent(plan)}` : returnToStore ? 'index.html#productos' : 'micuenta.html');
                    return;
                }
                form.reset();
                confirmation.setCustomValidity("");
                feedback.textContent = "Cuenta creada correctamente. Ya puedes iniciar sesión.";
            }
        } catch {
            feedback.textContent = "No se pudo contactar con el servidor. Comprueba que el backend esté activo.";
        } finally {
            button.disabled = false;
        }
    });
}

async function setupAccount() {
    const message = document.querySelector("#cuenta-mensaje");
    if (!message) return;
    const button = document.querySelector("#cerrar-sesion");
    try {
        const response = await fetch("/api/me", { cache: "no-store" });
        if (response.status === 401) { window.location.replace("login.html"); return; }
        if (!response.ok) throw new Error();
        const { usuario } = await response.json();
        document.querySelector("#cuenta-nombre").textContent = usuario.nombre;
        document.querySelector("#cuenta-correo").textContent = usuario.correo;
        await setupSimulatedPayments();
        await loadMembership();
        if (usuario.rol === 'admin') setupMembershipAdministration();
        setupRoutines(usuario);
        setupProductAdministration(usuario);
        setupOrdersAccount();
        setupTrainingAccount(usuario);
        setupFamilyRenewalsAccount(usuario);
    } catch { message.textContent = "No se pudo cargar tu cuenta. Intenta recargar la página."; }
    button.addEventListener("click", async () => {
        button.disabled = true;
        try {
            const response = await fetch("/api/logout", { method: "POST" });
            if (!response.ok) throw new Error();
            window.location.replace("login.html");
        } catch {
            message.textContent = "No se pudo cerrar sesión. Intenta nuevamente.";
            button.disabled = false;
        }
    });
    document.querySelector('#actualizar-membresia').addEventListener('click', loadMembership);
}

let membershipExpiryTimer;
let membershipLoadGeneration = 0;
let demoPaymentsEnabled = false;
let demoPaymentBusy = false;
let membershipSnapshot = null;
const membershipDate = value => value ? new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short'
}).format(new Date(value)) + ' (Bogotá)' : 'Pendiente de activación';

async function loadMembership() {
    const generation = ++membershipLoadGeneration;
    window.clearTimeout(membershipExpiryTimer);
    const target = document.querySelector('#cuenta-membresia');
    try {
        const response = await fetch('/api/membresia', { cache: 'no-store' });
        if (response.status === 401) { window.location.replace('login.html'); return; }
        if (!response.ok) throw new Error();
        const { membresia } = await response.json();
        if (generation !== membershipLoadGeneration) return;
        membershipSnapshot = membresia;
        document.querySelector('#pago-simulado').hidden = !demoPaymentsEnabled || membresia?.estado !== 'pendiente';
        target.replaceChildren();
        if (membresia) {
            for (const text of [
                `Plan: ${membresia.planNombre}`,
                `Precio: ${new Intl.NumberFormat('es-CO', { style: 'currency', currency: membresia.moneda }).format(membresia.precio)} / ${membresia.periodo}`,
                `Estado: ${membresia.estado}`,
                `Acceso: ${membresia.accesoActivo ? 'Habilitado' : 'No habilitado'}`,
                `Solicitud: ${membershipDate(membresia.solicitadaEn)}`,
                `Inicio: ${membershipDate(membresia.inicio)}`,
                `Vence: ${membershipDate(membresia.fin)}`
            ]) {
                const line = document.createElement('p');
                line.textContent = text;
                target.append(line);
            }
            if (membresia.pagoSimulado) {
                const payment = membresia.pagoSimulado;
                const receipt = document.createElement('p');
                receipt.textContent = `Último pago simulado: ${payment.resultado} · ${new Intl.NumberFormat('es-CO', { style: 'currency', currency: payment.moneda }).format(payment.monto)} · ${membershipDate(payment.registradaEn)}. Sin cobro real.`;
                target.append(receipt);
            }
            if (membresia.tipoAcceso === 'beneficiario') {
                const note = document.createElement('p'); note.textContent = `Acceso por el grupo familiar de ${membresia.titularNombre}. El titular gestiona la renovación.`; target.append(note);
            }
            if (membresia.accesoActivo) {
                membershipExpiryTimer = window.setTimeout(loadMembership,
                    Math.min(2147483647, Math.max(1000, new Date(membresia.fin).getTime() - Date.now() + 50)));
            }
            if (membresia.estado === 'vencida') {
                const note = document.createElement('p');
                note.textContent = membresia.tipoAcceso === 'beneficiario' ? 'El grupo familiar venció. Tu acceso se restablece cuando el titular renueve.' : 'Tu membresía venció. Puedes solicitar otro mes en Renovar membresía.';
                target.append(note);
            }
        } else {
            target.textContent = 'Aún no has solicitado una membresía.';
            const planId = new URLSearchParams(window.location.search).get('plan');
            if (!planId) return;
            const catalog = await fetch('/api/planes');
            if (!catalog.ok) throw new Error();
            const plan = (await catalog.json()).planes.find(item => item._id === planId);
            if (!plan || generation !== membershipLoadGeneration) return;
            const confirm = document.createElement('button');
            confirm.type = 'button';
            confirm.textContent = `Confirmar solicitud: ${plan.nombre}`;
            const note = document.createElement('p');
            note.textContent = 'La membresía quedará pendiente de activación. No se realiza ningún cobro.';
            target.append(note, confirm);
            confirm.addEventListener('click', async () => {
                confirm.disabled = true;
                try {
                    const result = await fetch('/api/membresia', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planId })
                    });
                    if (result.ok || result.status === 409) { await loadMembership(); return; }
                    note.textContent = (await result.json()).message;
                } catch { note.textContent = 'No se pudo enviar la solicitud.'; }
                finally { confirm.disabled = false; }
            });
        }
    } catch {
        if (generation === membershipLoadGeneration) {
            membershipSnapshot = null;
            target.textContent = 'No se pudo cargar la membresía. Recarga para intentar nuevamente.';
            document.querySelector('#pago-simulado').hidden = true;
        }
    }
    finally { if (generation === membershipLoadGeneration) document.dispatchEvent(new Event('membership-updated')); }
}

async function setupSimulatedPayments() {
    const button = document.querySelector('#simular-pago');
    const result = document.querySelector('#pago-resultado');
    const status = document.querySelector('#pago-mensaje');
    button.addEventListener('click', async () => {
        if (demoPaymentBusy || !demoPaymentsEnabled) return;
        demoPaymentBusy = true;
        button.disabled = result.disabled = true;
        status.textContent = 'Procesando simulación…';
        try {
            const response = await fetch('/api/pagos/simulados', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ resultado: result.value })
            });
            if (response.status === 401) { window.location.replace('login.html'); return; }
            const body = await response.json();
            status.textContent = body.message;
            if (response.status === 403) { demoPaymentsEnabled = false; document.querySelector('#pago-simulado').hidden = true; }
            await loadMembership();
        } catch { status.textContent = 'No se pudo confirmar el pago simulado. Actualiza la membresía antes de reintentar; una aprobación conserva sus fechas.'; }
        finally { demoPaymentBusy = false; button.disabled = result.disabled = false; }
    });
    try {
        const response = await fetch('/api/pagos/simulacion', { cache: 'no-store' });
        if (!response.ok) throw new Error();
        demoPaymentsEnabled = (await response.json()).habilitada === true;
    } catch { status.textContent = 'No se pudo comprobar la disponibilidad del pago simulado. Recarga la página para intentarlo.'; }
}

function setupMembershipAdministration() {
    const panel = document.querySelector('#administracion-membresias');
    const list = document.querySelector('#admin-lista');
    const status = document.querySelector('#admin-mensaje');
    const filter = document.querySelector('#admin-estado');
    const refresh = document.querySelector('#admin-actualizar');
    const more = document.querySelector('#admin-mas');
    let next = null;
    let busy = false;
    panel.hidden = false;
    const controls = disabled => {
        busy = disabled;
        for (const control of panel.querySelectorAll('button, select')) control.disabled = disabled;
    };
    const handleDenied = response => {
        if (response.status === 401) { window.location.replace('login.html'); return true; }
        if (response.status === 403) {
            panel.hidden = true;
            document.querySelector('#cuenta-mensaje').textContent = 'Ya no tienes permisos de administrador.';
            return true;
        }
        return false;
    };
    async function load(append = false) {
        if (busy) return;
        controls(true);
        status.textContent = 'Cargando membresías…';
        if (!append) { list.replaceChildren(); next = null; more.hidden = true; }
        try {
            const query = new URLSearchParams({ estado: filter.value });
            if (append && next) query.set('despues', next);
            const response = await fetch('/api/admin/membresias?' + query, { cache: 'no-store' });
            if (handleDenied(response)) return;
            if (!response.ok) throw new Error();
            const body = await response.json();
            for (const membership of body.membresias) {
                const card = document.createElement('article');
                const title = document.createElement('h3');
                title.textContent = membership.usuario?.nombre || 'Cuenta no disponible';
                card.append(title);
                for (const text of [
                    membership.usuario?.correo || membership._id,
                    `${membership.planNombre} · ${new Intl.NumberFormat('es-CO', { style: 'currency', currency: membership.moneda }).format(membership.precio)} / ${membership.periodo}`,
                    `Estado: ${membership.estado}`,
                    `Solicitud: ${membershipDate(membership.solicitadaEn)}`,
                    `Inicio: ${membershipDate(membership.inicio)}`,
                    `Vence: ${membershipDate(membership.fin)}`
                ]) {
                    const line = document.createElement('p');
                    line.textContent = text;
                    card.append(line);
                }
                if (membership.estado === 'pendiente') {
                    const activate = document.createElement('button');
                    activate.type = 'button';
                    activate.textContent = 'Activar por un mes';
                    activate.addEventListener('click', async () => {
                        if (busy) return;
                        controls(true);
                        status.textContent = 'Activando membresía…';
                        let activated = false;
                        try {
                            const result = await fetch(`/api/admin/membresias/${encodeURIComponent(membership._id)}/activar`, { method: 'POST' });
                            if (handleDenied(result)) return;
                            const body = await result.json();
                            status.textContent = body.message;
                            activated = result.ok;
                        } catch { status.textContent = 'No se pudo confirmar la activación. Actualiza la lista o vuelve a intentarlo; las fechas se conservan.'; }
                        finally { controls(false); }
                        if (activated) {
                            await load();
                            status.textContent = 'Membresía activada por un mes.';
                            await loadMembership();
                        }
                    });
                    card.append(activate);
                }
                list.append(card);
            }
            next = body.siguiente;
            more.hidden = !next;
            status.textContent = list.children.length ? `${list.children.length} ${list.children.length === 1 ? 'membresía mostrada' : 'membresías mostradas'}.` : 'No hay membresías en este estado.';
        } catch { status.textContent = 'No se pudieron cargar las membresías. Intenta actualizar la lista.'; }
        finally { controls(false); }
    }
    filter.addEventListener('change', () => load());
    refresh.addEventListener('click', () => load());
    more.addEventListener('click', () => load(true));
    load();
}
