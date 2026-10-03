"use strict";

const routineLevelLabels = { principiante: 'Principiante', intermedio: 'Intermedio', avanzado: 'Avanzado' };

function routineCard(routine) {
    const card = document.createElement('article');
    const title = document.createElement('h3');
    title.textContent = routine.nombre;
    const objective = document.createElement('p');
    objective.textContent = routine.objetivo;
    const level = document.createElement('p');
    level.textContent = `Nivel: ${routineLevelLabels[routine.nivel]}`;
    const wrapper = document.createElement('div');
    wrapper.className = 'rutina-tabla';
    const table = document.createElement('table');
    const caption = document.createElement('caption');
    caption.textContent = 'Ejercicios de la rutina';
    const head = document.createElement('thead');
    const headers = document.createElement('tr');
    for (const name of ['Ejercicio', 'Series', 'Repeticiones o duración', 'Descanso']) {
        const cell = document.createElement('th');
        cell.scope = 'col';
        cell.textContent = name;
        headers.append(cell);
    }
    head.append(headers);
    const body = document.createElement('tbody');
    for (const exercise of routine.ejercicios) {
        const row = document.createElement('tr');
        for (const value of [exercise.nombre, exercise.series, exercise.repeticiones, `${exercise.descansoSegundos} s`]) {
            const cell = document.createElement('td');
            cell.textContent = value;
            row.append(cell);
        }
        body.append(row);
    }
    table.append(caption, head, body);
    wrapper.append(table);
    card.append(title, objective, level, wrapper);
    return card;
}

function setupRoutines(user) {
    const list = document.querySelector('#rutinas-lista');
    const status = document.querySelector('#rutinas-mensaje');
    const filter = document.querySelector('#rutinas-nivel');
    const refresh = document.querySelector('#rutinas-actualizar');
    const more = document.querySelector('#rutinas-mas');
    let next = null;
    let generation = 0;
    let expiryTimer;
    let controller;
    const clear = () => { list.replaceChildren(); next = null; more.hidden = true; };
    async function load(append = false) {
        const current = ++generation;
        controller?.abort();
        controller = new AbortController();
        window.clearTimeout(expiryTimer);
        if (!append) clear();
        refresh.disabled = more.disabled = filter.disabled = true;
        status.textContent = 'Comprobando acceso y cargando rutinas…';
        try {
            const query = new URLSearchParams();
            if (filter.value) query.set('nivel', filter.value);
            if (append && next) query.set('despues', next);
            const response = await fetch('/api/rutinas?' + query, { cache: 'no-store', signal: controller.signal });
            if (current !== generation) return;
            if (response.status === 401) { clear(); window.location.replace('login.html'); return; }
            const body = await response.json();
            if (current !== generation) return;
            if (!response.ok) { clear(); status.textContent = body.message; return; }
            const remaining = new Date(body.accesoHasta).getTime() - Date.now();
            if (!Number.isFinite(remaining) || remaining <= 0) {
                clear(); status.textContent = 'Tu membresía venció. Actualiza tu membresía para comprobar el acceso.'; return;
            }
            for (const routine of body.rutinas) list.append(routineCard(routine));
            next = body.siguiente;
            more.hidden = !next;
            status.textContent = list.children.length ? `${list.children.length} ${list.children.length === 1 ? 'rutina disponible' : 'rutinas disponibles'}.` : 'Todavía no hay rutinas disponibles para este nivel.';
            expiryTimer = window.setTimeout(() => { clear(); load(); loadMembership(); }, Math.min(2147483647, remaining + 50));
        } catch (error) {
            if (current !== generation || error.name === 'AbortError') return;
            clear(); status.textContent = 'No se pudieron cargar las rutinas. Intenta actualizar.';
        } finally {
            if (current === generation) refresh.disabled = more.disabled = filter.disabled = false;
        }
    }
    refresh.addEventListener('click', () => load());
    filter.addEventListener('change', () => load());
    more.addEventListener('click', () => load(true));
    document.addEventListener('membership-updated', () => load());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
    load();
    if (user.rol === 'admin') setupRoutineAdministration(() => load());
}

function setupRoutineAdministration(refreshMemberRoutines) {
    const panel = document.querySelector('#administracion-rutinas');
    const list = document.querySelector('#rutinas-admin-lista');
    const status = document.querySelector('#rutinas-admin-mensaje');
    const filter = document.querySelector('#rutinas-disponibilidad');
    const refresh = document.querySelector('#rutinas-admin-actualizar');
    const more = document.querySelector('#rutinas-admin-mas');
    const form = document.querySelector('#rutina-formulario');
    const formStatus = document.querySelector('#rutina-form-mensaje');
    const exercises = document.querySelector('#rutina-ejercicios');
    const add = document.querySelector('#rutina-agregar');
    const cancel = document.querySelector('#rutina-cancelar');
    const submit = document.querySelector('#rutina-guardar');
    let editing = null;
    let next = null;
    let busy = false;
    let exerciseSequence = 0;
    panel.hidden = false;
    function controls(disabled) {
        busy = disabled;
        for (const control of panel.querySelectorAll('button, input, textarea, select')) control.disabled = disabled;
        if (!disabled) add.disabled = exercises.children.length >= 20;
    }
    function denied(response) {
        if (response.status === 401) { window.location.replace('login.html'); return true; }
        if (response.status === 403) {
            panel.hidden = true;
            document.querySelector('#administracion-membresias').hidden = true;
            document.querySelector('#cuenta-mensaje').textContent = 'Ya no tienes permisos de administrador.';
            return true;
        }
        return false;
    }
    function addExercise(value = {}) {
        if (exercises.children.length >= 20) return;
        const row = document.createElement('fieldset');
        row.className = 'rutina-ejercicio';
        const legend = document.createElement('legend');
        legend.textContent = 'Ejercicio';
        row.append(legend);
        const sequence = ++exerciseSequence;
        for (const [name, label, type, min, max, defaultValue] of [
            ['nombre', 'Nombre del ejercicio', 'text', 2, 100, ''],
            ['series', 'Series', 'number', 1, 20, 3],
            ['repeticiones', 'Repeticiones o duración', 'text', 1, 40, ''],
            ['descansoSegundos', 'Descanso en segundos', 'number', 0, 600, 60]
        ]) {
            const wrapper = document.createElement('div');
            const title = document.createElement('label');
            const input = document.createElement('input');
            input.id = `ejercicio-${sequence}-${name}`;
            title.htmlFor = input.id;
            title.textContent = label;
            input.type = type;
            input.dataset.field = name;
            input.required = true;
            if (type === 'number') { input.min = min; input.max = max; input.step = 1; }
            else { input.minLength = min; input.maxLength = max; }
            input.value = value[name] ?? defaultValue;
            wrapper.append(title, input);
            row.append(wrapper);
        }
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = 'Quitar ejercicio';
        remove.addEventListener('click', () => {
            if (busy) return;
            if (exercises.children.length === 1) { formStatus.textContent = 'La rutina necesita al menos un ejercicio.'; return; }
            row.remove(); add.disabled = false;
        });
        row.append(remove);
        exercises.append(row);
        add.disabled = exercises.children.length >= 20;
    }
    function reset() {
        editing = null;
        form.reset();
        exercises.replaceChildren();
        addExercise();
        document.querySelector('#rutina-editor-titulo').textContent = 'Crear rutina';
        submit.textContent = 'Crear rutina';
        cancel.hidden = true;
    }
    function edit(routine) {
        if (busy) return;
        editing = routine;
        form.elements.nombre.value = routine.nombre;
        form.elements.objetivo.value = routine.objetivo;
        form.elements.nivel.value = routine.nivel;
        form.elements.disponible.checked = routine.disponible;
        exercises.replaceChildren();
        for (const exercise of routine.ejercicios) addExercise(exercise);
        document.querySelector('#rutina-editor-titulo').textContent = 'Editar rutina';
        submit.textContent = 'Guardar cambios';
        cancel.hidden = false;
        formStatus.textContent = '';
        form.scrollIntoView({ block: 'start', behavior: 'auto' });
        form.elements.nombre.focus({ preventScroll: true });
    }
    async function load(append = false) {
        if (busy) return;
        controls(true);
        if (!append) { list.replaceChildren(); next = null; more.hidden = true; }
        status.textContent = 'Cargando catálogo…';
        try {
            const query = new URLSearchParams({ disponibilidad: filter.value });
            if (append && next) query.set('despues', next);
            const response = await fetch('/api/admin/rutinas?' + query, { cache: 'no-store' });
            if (denied(response)) return;
            const body = await response.json();
            if (!response.ok) { status.textContent = body.message; return; }
            for (const routine of body.rutinas) {
                const card = routineCard(routine);
                const availability = document.createElement('p');
                availability.textContent = routine.disponible ? 'Disponible para miembros' : 'Deshabilitada';
                const editButton = document.createElement('button');
                editButton.type = 'button'; editButton.textContent = 'Editar rutina';
                editButton.addEventListener('click', () => edit(routine));
                const toggle = document.createElement('button');
                toggle.type = 'button'; toggle.textContent = routine.disponible ? 'Deshabilitar' : 'Habilitar';
                toggle.addEventListener('click', async () => {
                    if (busy) return;
                    controls(true);
                    let changed = false;
                    try {
                        const response = await fetch(`/api/admin/rutinas/${routine._id}/disponibilidad`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ disponible: !routine.disponible, version: routine.version })
                        });
                        if (denied(response)) return;
                        const body = await response.json();
                        status.textContent = body.message;
                        changed = response.ok;
                        if (changed && editing?._id === routine._id && editing.version === routine.version) editAfterToggle(body.rutina);
                    } catch { status.textContent = 'No se pudo confirmar el cambio. Actualiza el catálogo antes de reintentar.'; }
                    finally { controls(false); }
                    if (changed) { await load(); refreshMemberRoutines(); }
                });
                card.append(availability, editButton, toggle);
                list.append(card);
            }
            next = body.siguiente;
            more.hidden = !next;
            status.textContent = list.children.length ? `${list.children.length} ${list.children.length === 1 ? 'rutina en el catálogo' : 'rutinas en el catálogo'}.` : 'No hay rutinas en este estado. Puedes crear una abajo.';
        } catch { status.textContent = 'No se pudo cargar el catálogo. Intenta actualizar.'; }
        finally { controls(false); }
    }
    // Conservar los cambios de contenido del formulario al cambiar disponibilidad.
    function editAfterToggle(routine) {
        editing = { ...editing, version: routine.version };
        form.elements.disponible.checked = routine.disponible;
    }
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (busy || !form.reportValidity()) return;
        const payload = {
            nombre: form.elements.nombre.value, objetivo: form.elements.objetivo.value,
            nivel: form.elements.nivel.value, disponible: form.elements.disponible.checked,
            ejercicios: [...exercises.children].map(row => Object.fromEntries([...row.querySelectorAll('input')].map(input => [input.dataset.field, input.type === 'number' ? Number(input.value) : input.value]))),
            ...(editing ? { version: editing.version } : {})
        };
        controls(true);
        formStatus.textContent = 'Guardando rutina…';
        let saved = false;
        try {
            const response = await fetch(editing ? `/api/admin/rutinas/${editing._id}` : '/api/admin/rutinas', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            });
            if (denied(response)) return;
            const body = await response.json();
            formStatus.textContent = body.message;
            saved = response.ok;
            if (saved) reset();
        } catch { formStatus.textContent = 'No se pudo confirmar el guardado. Actualiza el catálogo antes de reintentar; tus datos siguen en el formulario.'; }
        finally { controls(false); }
        if (saved) { await load(); refreshMemberRoutines(); }
    });
    add.addEventListener('click', () => { if (!busy) addExercise(); });
    cancel.addEventListener('click', () => { if (!busy) { reset(); formStatus.textContent = ''; } });
    filter.addEventListener('change', () => load());
    refresh.addEventListener('click', () => load());
    more.addEventListener('click', () => load(true));
    reset();
    load();
}
