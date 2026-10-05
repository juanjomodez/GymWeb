'use strict';

const trainingDate = value => new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) + ' (Bogotá)';
const trainingElement = (tag, text, className) => { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; if (className) element.className = className; return element; };
async function trainingRequest(url, body) {
    const response = await fetch(url, { cache: 'no-store', ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
    if (response.status === 401) window.location.replace('login.html');
    let data; try { data = await response.json(); } catch { throw new Error('No se pudo leer la respuesta. Comprueba que estás usando el backend.'); }
    if (!response.ok) throw Object.assign(new Error(data.message), { status: response.status });
    return data;
}
const trainingFailure = error => error.status ? error.message : 'No se pudo confirmar la operación. Actualiza la agenda o los mensajes antes de reintentar.';
function trainingAction(text, action) {
    const button = trainingElement('button', text); button.type = 'button';
    button.addEventListener('click', async () => { if (button.disabled) return; button.disabled = true; try { await action(button); } finally { button.disabled = false; } });
    return button;
}
function trainerCard(trainer) {
    const card = trainingElement('article'), image = document.createElement('img'); image.src = trainer.imagen; image.alt = trainer.nombre;
    card.append(image, trainingElement('h3', trainer.nombre), trainingElement('p', trainer.especialidad), trainingElement('p', trainer.descripcion)); return card;
}
function trainingList({ container, status, more, url, key, render, query = () => new URLSearchParams(), afterLoad = () => {}, denied = () => {} }) {
    let next = null, generation = 0, timer, controller;
    function clearContent() { container.replaceChildren(); next = null; more.hidden = true; }
    function clear() { generation++; controller?.abort(); window.clearTimeout(timer); clearContent(); }
    async function load(append = false) {
        const current = ++generation; controller?.abort(); controller = new AbortController(); window.clearTimeout(timer);
        if (!append) clearContent(); more.disabled = true; status.textContent = 'Cargando…';
        try {
            const params = query(); if (append && next) params.set('despues', next);
            const response = await fetch(url + '?' + params, { cache: 'no-store', signal: controller.signal });
            if (current !== generation) return;
            if (response.status === 401) { clearContent(); window.location.replace('login.html'); return; }
            const body = await response.json(); if (current !== generation) return;
            if (!response.ok) throw Object.assign(new Error(body.message), { status: response.status });
            if (body.accesoHasta) {
                const remaining = new Date(body.accesoHasta) - Date.now();
                if (!Number.isFinite(remaining) || remaining <= 0) throw Object.assign(new Error('Tu membresía venció. Actualiza tu membresía.'), { status: 403 });
                timer = window.setTimeout(() => { clear(); load(); }, Math.min(2147483647, remaining + 20));
            }
            for (const row of body[key]) container.append(render(row)); next = body.siguiente; more.hidden = !next;
            const count = container.children.length, singular = { entrenadores: 'entrenador', horarios: 'horario', reservas: 'reserva', conversaciones: 'conversación', renovaciones: 'renovación', periodos: 'periodo' }[key];
            status.textContent = count ? `${count} ${count === 1 ? singular : key}.` : `No hay ${key} para mostrar.`;
            afterLoad(body[key], append);
        } catch (error) { if (current !== generation || error.name === 'AbortError') return; clearContent(); status.textContent = trainingFailure(error); denied(error); }
        finally { if (current === generation) more.disabled = false; }
    }
    more.addEventListener('click', () => load(true)); return { load, clear };
}
document.addEventListener('DOMContentLoaded', () => {
    const container = document.querySelector('#entrenadores-lista'); if (!container) return;
    const catalog = trainingList({ container, status: document.querySelector('#entrenadores-mensaje'), more: document.querySelector('#entrenadores-mas'), url: '/api/entrenadores', key: 'entrenadores', render: trainer => {
        const card = trainerCard(trainer), link = trainingElement('a', 'Ver citas y mensajes'); link.href = 'micuenta.html#mis-reservas'; card.append(link); return card;
    } });
    document.querySelector('#entrenadores-actualizar').addEventListener('click', () => catalog.load()); catalog.load();
});

function setupTrainingChat(panel, staff = false) {
    const select = name => panel.querySelector(`[data-${name}]`);
    const thread = select('chat-thread'), messages = select('messages-list'), messageMore = select('messages-more'), form = select('message-form'), messageStatus = select('message-status');
    let selected = null, older = null, busy = false, attempt = null, timer, generation = 0, controller;
    const pendingMessages = new Map(), sendLabel = staff ? 'Enviar respuesta' : 'Enviar mensaje';
    function controls(value) { busy = value; for (const control of panel.querySelectorAll('button, textarea, select')) control.disabled = value; form.elements.texto.readOnly = Boolean(attempt); }
    function clearThread(forgetAttempts = false) { selected = null; generation++; controller?.abort(); window.clearTimeout(timer); messages.replaceChildren(); thread.hidden = true; older = null; messageMore.hidden = true; attempt = null; if (forgetAttempts) pendingMessages.clear(); form.reset(); form.elements.texto.readOnly = false; form.querySelector('button').textContent = sendLabel; messageStatus.textContent = ''; }
    function selectConversation(conversation) {
        clearThread(); selected = conversation; attempt = pendingMessages.get(conversation._id) || null;
        if (attempt) { form.elements.texto.value = attempt.texto; form.elements.texto.readOnly = true; form.querySelector('button').textContent = 'Reintentar el mismo mensaje'; messageStatus.textContent = 'Este envío no se pudo confirmar. Se conserva el texto y la clave para reintentarlo sin duplicados.'; }
        select('chat-title').textContent = staff ? `Conversación con ${conversation.miembroNombre}` : `Conversación con ${conversation.entrenadorNombre}`; thread.hidden = false;
    }
    const conversations = trainingList({ container: select('chat-list'), status: select('chat-status'), more: select('chat-more'), url: staff ? '/api/entrenador/conversaciones' : '/api/conversaciones', key: 'conversaciones', denied: error => { if (error.status === 403) clearThread(true); }, render: conversation => {
        const card = trainingElement('article'); card.append(trainingElement('h3', staff ? conversation.miembroNombre : conversation.entrenadorNombre), trainingElement('p', conversation.ultimoMensajeEn ? 'Último mensaje: ' + trainingDate(conversation.ultimoMensajeEn) : 'Sin mensajes todavía.'));
        card.append(trainingAction('Leer conversación', async () => { if (busy) return; selectConversation(conversation); await loadMessages(); })); return card;
    } });
    async function loadMessages(previous = false) {
        if (!selected || busy) return;
        const current = ++generation, id = selected._id; controller?.abort(); controller = new AbortController(); controls(true); window.clearTimeout(timer);
        try {
            const response = await fetch(`/api/conversaciones/${id}/mensajes` + (previous && older ? `?despues=${older}` : ''), { cache: 'no-store', signal: controller.signal });
            if (current !== generation) return;
            if (response.status === 401) { clearThread(true); window.location.replace('login.html'); return; }
            const body = await response.json(); if (current !== generation) return;
            if (!response.ok) throw Object.assign(new Error(body.message), { status: response.status });
            const remaining = new Date(body.accesoHasta) - Date.now(); if (!Number.isFinite(remaining) || remaining <= 0) throw Object.assign(new Error('La membresía Premium del miembro venció.'), { status: 403 });
            if (!previous) messages.replaceChildren(); const fragment = document.createDocumentFragment();
            for (const message of body.mensajes) {
                const card = trainingElement('article', undefined, 'chat-mensaje'); card.append(trainingElement('p', `${message.autor === 'entrenador' ? 'Entrenador' : 'Miembro'} · ${trainingDate(message.creadoEn)}`, 'chat-autor'), trainingElement('p', message.texto, 'chat-texto')); fragment.append(card);
            }
            if (previous) messages.prepend(fragment); else messages.append(fragment);
            older = body.siguiente; messageMore.hidden = !older;
            if (!body.mensajes.length) messages.append(trainingElement('p', 'Todavía no hay mensajes en esta conversación.'));
            timer = window.setTimeout(() => { clearThread(true); select('chat-status').textContent = 'La membresía Premium venció. Actualiza para comprobar el acceso.'; }, Math.min(2147483647, remaining + 20));
        } catch (error) { if (current !== generation || error.name === 'AbortError') return; messages.replaceChildren(); messageStatus.textContent = trainingFailure(error); if ([403, 404, 409].includes(error.status)) { clearThread(true); select('chat-status').textContent = trainingFailure(error); } }
        finally { controls(false); }
    }
    async function openTrainer(id) {
        if (busy || !id) return;
        controls(true);
        try { const body = await trainingRequest('/api/conversaciones', { entrenadorId: id }); selectConversation(body.conversacion); }
        catch (error) { select('chat-status').textContent = trainingFailure(error); }
        finally { controls(false); }
        if (selected) await loadMessages(); await conversations.load();
    }
    form.addEventListener('submit', async event => {
        event.preventDefault(); if (!selected || busy || !form.reportValidity()) return;
        attempt ??= { clave: crypto.randomUUID(), texto: form.elements.texto.value.trim() }; if (!attempt.texto) { attempt = null; messageStatus.textContent = 'Escribe un mensaje.'; return; }
        pendingMessages.set(selected._id, attempt);
        const id = selected._id; controls(true); messageStatus.textContent = 'Enviando…';
        try { const result = await trainingRequest(`/api/conversaciones/${id}/mensajes`, attempt); messageStatus.textContent = result.message; pendingMessages.delete(id); attempt = null; form.reset(); form.querySelector('button').textContent = sendLabel; }
        catch (error) { messageStatus.textContent = trainingFailure(error); if ([400, 403, 404, 409].includes(error.status)) { pendingMessages.delete(id); attempt = null; form.querySelector('button').textContent = sendLabel; } else { form.querySelector('button').textContent = 'Reintentar el mismo mensaje'; messageStatus.textContent += ' Se conserva el texto y la clave para evitar duplicados.'; } }
        finally { controls(false); }
        await loadMessages(); await conversations.load();
    });
    select('chat-refresh').addEventListener('click', () => { if (!busy) conversations.load(); }); select('messages-refresh').addEventListener('click', () => loadMessages()); messageMore.addEventListener('click', () => loadMessages(true));
    return { refresh: () => { if (!busy) { conversations.load(); if (selected) loadMessages(); } }, openTrainer, clear: () => { clearThread(true); conversations.clear(); } };
}

function setupTrainingAccount(user) {
    if (!document.querySelector('#mis-reservas')) return;
    const find = id => document.getElementById(id), actionStatus = find('reserva-accion'), attempts = new Map();
    const memberChat = setupTrainingChat(find('chat-miembro')), profiles = new Map(); let trainerNext = null, premiumAccess = false, refreshGeneration = 0;
    function fillOptions(select, rows, placeholder) {
        const value = select.value; select.replaceChildren(trainingElement('option', placeholder)); select.firstElementChild.value = '';
        for (const trainer of rows) { const option = trainingElement('option', trainer.nombre); option.value = trainer._id; select.append(option); } select.value = value;
    }
    async function loadProfiles(append = false) {
        try { const body = await trainingRequest('/api/entrenadores' + (append && trainerNext ? '?despues=' + trainerNext : '')); if (!append) profiles.clear(); for (const row of body.entrenadores) profiles.set(row._id, row); trainerNext = body.siguiente; find('reserva-entrenadores-mas').hidden = !trainerNext; fillOptions(find('reserva-entrenador'), profiles.values(), 'Todos los entrenadores'); fillOptions(find('chat-entrenador'), profiles.values(), 'Selecciona un entrenador'); }
        catch (error) { actionStatus.textContent = trainingFailure(error); }
    }
    const slots = trainingList({ container: find('horarios-lista'), status: find('horarios-mensaje'), more: find('horarios-mas'), url: '/api/horarios', key: 'horarios', query: () => new URLSearchParams(find('reserva-entrenador').value ? { entrenadorId: find('reserva-entrenador').value } : {}), render: slot => {
        const card = trainingElement('article'); card.append(trainingElement('h3', slot.entrenadorNombre), trainingElement('p', trainingDate(slot.inicio)), trainingElement('p', 'Duración: 60 minutos'));
        card.append(trainingAction('Reservar esta cita', async () => {
            if (!attempts.has(slot._id)) attempts.set(slot._id, crypto.randomUUID());
            try { const body = await trainingRequest('/api/reservas', { horarioId: slot._id, clave: attempts.get(slot._id) }); actionStatus.textContent = body.message; attempts.delete(slot._id); }
            catch (error) { actionStatus.textContent = trainingFailure(error); if ([400, 403, 409].includes(error.status)) attempts.delete(slot._id); }
            await Promise.all([slots.load(), bookings.load()]);
        })); return card;
    } });
    function bookingCard(booking, staff = false, administrative = false) {
        const card = trainingElement('article'); const finished = new Date(booking.fin) <= new Date();
        card.append(trainingElement('h3', booking.entrenadorNombre), trainingElement('p', trainingDate(booking.inicio)), trainingElement('p', booking.estado === 'cancelada' ? `Cancelada por ${booking.cancelacionOrigen || 'el gimnasio'}` : finished ? 'Finalizada' : 'Confirmada · 60 minutos'));
        if (staff || administrative) card.append(trainingElement('p', 'Miembro: ' + booking.miembroNombre));
        if (booking.estado === 'confirmada' && new Date(booking.inicio) > new Date() && !administrative) card.append(trainingAction(staff ? 'Cancelar cita y cerrar horario' : 'Cancelar mi reserva', async () => {
            try { const body = await trainingRequest(`/api/${staff ? 'entrenador/' : ''}reservas/${booking._id}/cancelar`, {}); (staff ? find('entrenador-reservas-mensaje') : actionStatus).textContent = body.message; } catch (error) { (staff ? find('entrenador-reservas-mensaje') : actionStatus).textContent = trainingFailure(error); }
            if (staff) await staffBookings.load(); else await Promise.all([bookings.load(), ...(premiumAccess ? [slots.load()] : [])]);
        })); return card;
    }
    const bookings = trainingList({ container: find('reservas-lista'), status: find('reservas-mensaje'), more: find('reservas-mas'), url: '/api/reservas', key: 'reservas', query: () => new URLSearchParams(find('reservas-estado').value ? { estado: find('reservas-estado').value } : {}), render: booking => bookingCard(booking) });
    const staffChat = setupTrainingChat(find('chat-entrenador-panel'), true);
    const staffBookings = trainingList({ container: find('entrenador-reservas-lista'), status: find('entrenador-reservas-mensaje'), more: find('entrenador-reservas-mas'), url: '/api/entrenador/reservas', key: 'reservas', render: booking => bookingCard(booking, true), denied: error => { if (error.status === 403) { find('panel-entrenador').hidden = true; staffChat.clear(); } } });
    function showTrainer(profile) {
        find('panel-entrenador').hidden = !profile;
        if (profile) { find('portal-entrenador-nombre').textContent = profile.nombre; staffBookings.load(); staffChat.refresh(); }
        else { staffBookings.clear(); staffChat.clear(); }
    }
    find('reserva-entrenador').addEventListener('change', () => { if (premiumAccess) slots.load(); }); find('horarios-actualizar').addEventListener('click', () => refresh()); find('reserva-entrenadores-mas').addEventListener('click', () => { if (premiumAccess) loadProfiles(true); });
    find('reservas-actualizar').addEventListener('click', () => bookings.load()); find('reservas-estado').addEventListener('change', () => bookings.load()); find('entrenador-reservas-actualizar').addEventListener('click', () => refresh());
    find('chat-abrir').addEventListener('click', () => { if (!find('chat-entrenador').value) { find('chat-miembro').querySelector('[data-chat-status]').textContent = 'Selecciona un entrenador.'; return; } memberChat.openTrainer(find('chat-entrenador').value); });
    function showPremium(enabled, message = 'Necesitas una membresía Premium vigente para reservar y conversar con entrenadores.') {
        premiumAccess = enabled;
        find('reserva-controles').hidden = !enabled; find('chat-miembro-controles').hidden = !enabled;
        find('chat-miembro').querySelector('[data-chat-refresh]').hidden = !enabled;
        if (!enabled) { slots.clear(); memberChat.clear(); find('horarios-mensaje').textContent = message; find('chat-miembro').querySelector('[data-chat-status]').textContent = message; }
    }
    async function refresh() {
        const current = ++refreshGeneration;
        try {
            const access = await trainingRequest('/api/entrenamiento/acceso');
            if (current !== refreshGeneration) return;
            showPremium(access.premium); showTrainer(access.entrenador);
            if (access.premium) { loadProfiles(); slots.load(); memberChat.refresh(); }
        } catch (error) {
            if (current !== refreshGeneration) return;
            showPremium(false, trainingFailure(error)); showTrainer(null);
            actionStatus.textContent = trainingFailure(error);
        }
        if (current === refreshGeneration) bookings.load();
    }
    document.addEventListener('membership-updated', refresh); document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); }); refresh();
    if (user.rol === 'admin') setupTrainingAdministration(booking => bookingCard(booking, false, true), refresh);
}

function setupTrainingAdministration(bookingCard, refreshMember) {
    const find = id => document.getElementById(id), panel = find('administracion-entrenadores'), form = find('entrenador-formulario'), slotForm = find('horario-formulario'), team = new Map();
    let editing = null, busy = false; panel.hidden = false;
    const denied = error => { if (error.status === 403) { panel.hidden = true; find('cuenta-mensaje').textContent = 'Ya no tienes permisos de administrador.'; } };
    const agendaQuery = () => new URLSearchParams(find('agenda-entrenador').value ? { entrenadorId: find('agenda-entrenador').value } : {});
    const reservations = trainingList({ container: find('reservas-admin-lista'), status: find('reservas-admin-mensaje'), more: find('reservas-admin-mas'), url: '/api/admin/reservas', key: 'reservas', query: agendaQuery, render: bookingCard, denied });
    const agenda = trainingList({ container: find('agenda-lista'), status: find('agenda-mensaje'), more: find('agenda-mas'), url: '/api/admin/horarios', key: 'horarios', query: agendaQuery, denied, render: slot => {
        const card = trainingElement('article'); card.append(trainingElement('h3', slot.entrenadorNombre), trainingElement('p', trainingDate(slot.inicio)), trainingElement('p', 'Estado: ' + slot.estado));
        if (new Date(slot.inicio) > new Date()) card.append(trainingAction(slot.estado === 'cerrado' ? 'Abrir horario' : 'Cerrar horario y cancelar cita', async () => {
            try { const body = await trainingRequest(`/api/admin/horarios/${slot._id}/${slot.estado === 'cerrado' ? 'abrir' : 'cerrar'}`, { version: slot.version }); find('horario-form-mensaje').textContent = body.message; } catch (error) { find('horario-form-mensaje').textContent = trainingFailure(error); denied(error); }
            await Promise.all([agenda.load(), reservations.load()]); refreshMember();
        })); return card;
    } });
    function reset() { editing = null; form.reset(); find('entrenador-vinculo').hidden = false; form.elements.correo.required = true; find('entrenador-cancelar').hidden = true; find('entrenador-editor-titulo').textContent = find('entrenador-guardar').textContent = 'Crear entrenador'; }
    function options() {
        for (const [id, placeholder, available] of [['horario-entrenador', 'Selecciona un entrenador habilitado', true], ['agenda-entrenador', 'Todos los entrenadores', false]]) {
            const select = find(id), value = select.value; select.replaceChildren(trainingElement('option', placeholder)); select.firstElementChild.value = '';
            for (const trainer of team.values()) if (!available || trainer.disponible) { const option = trainingElement('option', trainer.nombre); option.value = trainer._id; select.append(option); } select.value = value;
        }
    }
    const trainers = trainingList({ container: find('entrenadores-admin-lista'), status: find('entrenadores-admin-mensaje'), more: find('entrenadores-admin-mas'), url: '/api/admin/entrenadores', key: 'entrenadores', query: () => new URLSearchParams({ disponibilidad: find('entrenadores-disponibilidad').value }), denied, afterLoad: (rows, append) => { if (!append) team.clear(); for (const row of rows) team.set(row._id, row); options(); }, render: trainer => {
        const card = trainerCard(trainer); card.classList.add('entrenador-admin-tarjeta'); card.append(trainingElement('p', trainer.disponible ? 'Habilitado' : 'Deshabilitado'));
        card.append(trainingAction('Editar entrenador', async () => { if (busy) return; editing = trainer; for (const key of ['nombre', 'especialidad', 'descripcion', 'imagen']) form.elements[key].value = trainer[key]; form.elements.disponible.checked = trainer.disponible; form.elements.correo.required = false; find('entrenador-vinculo').hidden = true; find('entrenador-cancelar').hidden = false; find('entrenador-editor-titulo').textContent = 'Editar entrenador'; find('entrenador-guardar').textContent = 'Guardar entrenador'; form.scrollIntoView({ block: 'start' }); form.elements.nombre.focus({ preventScroll: true }); })); return card;
    } });
    function controls(disabled) { busy = disabled; for (const control of panel.querySelectorAll('button, input, textarea, select')) control.disabled = disabled; }
    form.addEventListener('submit', async event => {
        event.preventDefault(); if (busy || !form.reportValidity()) return;
        const input = Object.fromEntries(['nombre', 'especialidad', 'descripcion', 'imagen'].map(key => [key, form.elements[key].value])); input.disponible = form.elements.disponible.checked; if (editing) input.version = editing.version; else input.correo = form.elements.correo.value;
        controls(true); find('entrenador-form-mensaje').textContent = 'Guardando…';
        try { const body = await trainingRequest('/api/admin/entrenadores' + (editing ? '/' + editing._id : ''), input); find('entrenador-form-mensaje').textContent = body.message; reset(); }
        catch (error) { find('entrenador-form-mensaje').textContent = trainingFailure(error); denied(error); }
        finally { controls(false); }
        await Promise.all([trainers.load(), agenda.load(), reservations.load()]); refreshMember();
    });
    slotForm.addEventListener('submit', async event => {
        event.preventDefault(); if (busy || !slotForm.reportValidity()) return;
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:00$/.test(slotForm.elements.inicio.value)) { find('horario-form-mensaje').textContent = 'Selecciona una hora exacta, sin minutos adicionales.'; return; }
        const inicio = new Date(slotForm.elements.inicio.value + ':00-05:00').toISOString(); controls(true);
        try { const body = await trainingRequest('/api/admin/horarios', { entrenadorId: slotForm.elements.entrenadorId.value, inicio }); find('horario-form-mensaje').textContent = body.message; }
        catch (error) { find('horario-form-mensaje').textContent = trainingFailure(error); denied(error); }
        finally { controls(false); }
        await agenda.load(); refreshMember();
    });
    find('entrenador-cancelar').addEventListener('click', reset); find('entrenadores-admin-actualizar').addEventListener('click', () => trainers.load()); find('entrenadores-disponibilidad').addEventListener('change', () => trainers.load());
    const refreshAgenda = () => { agenda.load(); reservations.load(); }; find('agenda-entrenador').addEventListener('change', refreshAgenda); find('agenda-actualizar').addEventListener('click', refreshAgenda);
    reset(); trainers.load(); refreshAgenda();
}
