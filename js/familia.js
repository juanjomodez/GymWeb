'use strict';

function setupFamilyRenewalsAccount(user) {
    const find = id => document.getElementById(id), familyForm = find('familia-invitar'), familyList = find('familia-lista'), familySummary = find('familia-resumen');
    let familyGeneration = 0, familyBusy = false, renewalBusy = false, renewalKey = null, hasPending = false;
    const money = row => new Intl.NumberFormat('es-CO', {style: 'currency', currency: row.moneda}).format(row.precio);
    async function familyAction(url, body) {
        if (familyBusy) return; familyBusy = true;
        for (const control of find('mi-familia').querySelectorAll('button, input')) control.disabled = true;
        try { const result = await trainingRequest(url, body); find('familia-accion').textContent = result.message; familyForm.reset(); }
        catch (error) { find('familia-accion').textContent = trainingFailure(error); }
        finally { familyBusy = false; for (const control of find('mi-familia').querySelectorAll('button, input')) control.disabled = false; }
        await loadMembership(); await loadFamily();
    }
    async function loadFamily() {
        const generation = ++familyGeneration;
        familySummary.replaceChildren(); familyList.replaceChildren(); familyForm.hidden = true; find('familia-mensaje').textContent = 'Cargando grupo…';
        try {
            const body = await trainingRequest('/api/familia'); if (generation !== familyGeneration) return;
            find('familia-mensaje').textContent = '';
            if (body.tipo === 'titular') {
                familySummary.append(trainingElement('p', `Ocupación: ${body.miembros.length + 1} de ${body.capacidad} personas, incluido el titular.`));
                if (!body.puedeInvitar) familySummary.append(trainingElement('p', 'Activa o renueva tu plan familiar para invitar. Puedes retirar vínculos existentes.'));
                familyForm.hidden = !body.puedeInvitar || body.miembros.length >= body.capacidad - 1;
                for (const member of body.miembros) {
                    const card = trainingElement('article'); card.append(trainingElement('h3', member.nombre), trainingElement('p', member.correo), trainingElement('p', member.estado === 'activo' ? 'Beneficiario activo' : 'Invitación pendiente de aceptación'));
                    card.append(trainingAction(member.estado === 'activo' ? 'Retirar beneficiario' : 'Retirar invitación', () => familyAction(`/api/familia/miembros/${member.usuarioId}/retirar`, {version: member.version}))); familyList.append(card);
                }
            } else if (body.tipo === 'beneficiario') {
                const link = body.vinculo;
                familySummary.append(trainingElement('p', `Titular: ${link.titularNombre}`), trainingElement('p', `Plan: ${link.planNombre || 'No disponible'}`), trainingElement('p', link.fin ? `Vence: ${trainingDate(link.fin)}` : 'Sin vigencia disponible'));
                if (link.estado === 'invitado') {
                    familySummary.append(trainingElement('p', 'Aceptar te vincula al grupo y habilita el acceso mientras la membresía del titular esté vigente.'));
                    familySummary.append(trainingAction('Aceptar invitación familiar', () => familyAction('/api/familia/aceptar', {version: link.version})));
                } else familySummary.append(trainingElement('p', link.accesoActivo ? 'Tu acceso familiar está habilitado.' : 'El grupo no tiene acceso vigente. El titular debe renovar.'));
                familySummary.append(trainingAction(link.estado === 'invitado' ? 'Rechazar invitación familiar' : 'Salir del grupo familiar', () => familyAction('/api/familia/salir', {version: link.version})));
            } else familySummary.append(trainingElement('p', 'No perteneces a un grupo familiar. El titular de un plan familiar puede invitar tu cuenta.'));
        } catch (error) { if (generation === familyGeneration) find('familia-mensaje').textContent = trainingFailure(error); }
    }
    familyForm.addEventListener('submit', event => { event.preventDefault(); if (familyForm.reportValidity()) familyAction('/api/familia/invitaciones', {correo: familyForm.elements.correo.value}); });
    find('familia-actualizar').addEventListener('click', () => { if (!familyBusy) { loadFamily(); loadMembership(); } });

    function renewalControls() {
        const membership = membershipSnapshot, eligible = membership && membership.tipoAcceso !== 'beneficiario' && ['activa', 'vencida'].includes(membership.estado);
        find('renovacion-solicitar').disabled = renewalBusy || !eligible || hasPending;
        find('renovacion-acceso').textContent = membership?.tipoAcceso === 'beneficiario' ? 'El titular gestiona la renovación de tu grupo.' : !eligible ? 'Activa una membresía propia para poder renovarla.' : hasPending ? demoPaymentsEnabled ? 'Ya hay una renovación pendiente. Puedes aprobar su pago simulado o cancelarla.' : 'Ya hay una renovación pendiente. El administrador puede aprobarla; también puedes cancelar la solicitud.' : 'La solicitud usa el precio actual del mismo plan. Tu acceso no cambia hasta su aprobación.';
    }
    async function renewalAction(url, body, admin = false) {
        if (renewalBusy) return; renewalBusy = true; renewalControls();
        const status = find(admin ? 'renovaciones-admin-accion' : 'renovacion-accion');
        try { const result = await trainingRequest(url, body); status.textContent = result.message; }
        catch (error) { status.textContent = trainingFailure(error); }
        finally { renewalBusy = false; }
        await loadMembership(); await Promise.all([renewals.load(), periods.load(), ...(adminList ? [adminList.load()] : [])]); renewalControls();
    }
    function renewalCard(row, admin = false) {
        const card = trainingElement('article'); card.append(trainingElement('h3', row.planNombre), trainingElement('p', `${money(row)} / ${row.periodo} · ${row.estado}`), trainingElement('p', 'Solicitada: ' + trainingDate(row.solicitadaEn)));
        if (admin) card.append(trainingElement('p', `${row.usuario?.nombre || 'Cuenta no disponible'} · ${row.usuario?.correo || ''}`));
        if (row.inicio && row.fin) card.append(trainingElement('p', `Periodo añadido: ${trainingDate(row.inicio)} → ${trainingDate(row.fin)}`));
        if (row.pagoSimulado) card.append(trainingElement('p', `Pago simulado ${row.pagoSimulado.resultado}. Sin cobro real.`));
        if (row.estado === 'pendiente') {
            if (admin) card.append(trainingAction('Aprobar renovación por un mes', () => renewalAction(`/api/admin/renovaciones/${row._id}/aprobar`, {}, true)));
            else {
                if (demoPaymentsEnabled) for (const [result, label] of [['aprobado', 'Simular aprobación de renovación'], ['rechazado', 'Simular rechazo de renovación']]) card.append(trainingAction(label, () => renewalAction(`/api/renovaciones/${row._id}/pago-simulado`, {resultado: result})));
                else card.append(trainingElement('p', 'El administrador puede aprobar esta solicitud. La simulación de pagos está deshabilitada.'));
                card.append(trainingAction('Cancelar solicitud de renovación', () => renewalAction(`/api/renovaciones/${row._id}/cancelar`, {})));
            }
        }
        return card;
    }
    const renewals = trainingList({container: find('renovaciones-lista'), status: find('renovaciones-mensaje'), more: find('renovaciones-mas'), url: '/api/renovaciones', key: 'renovaciones', render: row => renewalCard(row), afterLoad: (rows, append) => { if (!append) hasPending = false; hasPending ||= rows.some(row => row.estado === 'pendiente'); renewalControls(); }});
    const periods = trainingList({container: find('periodos-lista'), status: find('periodos-mensaje'), more: find('periodos-mas'), url: '/api/membresia/historial', key: 'periodos', render: row => {
        const card = trainingElement('article'); card.append(trainingElement('h3', row.planNombre), trainingElement('p', `${trainingDate(row.inicio)} → ${trainingDate(row.fin)}`), trainingElement('p', `${money(row)} · ${row.estado} · ${row.origen === 'pago-simulado' ? 'Pago simulado' : row.origen === 'administrador' ? 'Aprobación administrativa' : 'Periodo anterior'}`));
        if (row.pagoSimulado) card.append(trainingElement('p', `Comprobante simulado: ${row.pagoSimulado.resultado}. Sin cobro real.`)); return card;
    }});
    let adminList = null;
    if (user.rol === 'admin') {
        find('renovaciones-admin').hidden = false;
        adminList = trainingList({container: find('renovaciones-admin-lista'), status: find('renovaciones-admin-mensaje'), more: find('renovaciones-admin-mas'), url: '/api/admin/renovaciones', key: 'renovaciones', query: () => new URLSearchParams({estado: find('renovaciones-admin-estado').value}), render: row => renewalCard(row, true), denied: error => { if (error.status === 403) find('renovaciones-admin').hidden = true; }});
        find('renovaciones-admin-estado').addEventListener('change', () => adminList.load()); find('renovaciones-admin-actualizar').addEventListener('click', () => adminList.load()); adminList.load();
    }
    find('renovacion-solicitar').addEventListener('click', async () => {
        if (renewalBusy || find('renovacion-solicitar').disabled) return; renewalBusy = true; renewalKey ??= crypto.randomUUID(); renewalControls();
        try { const result = await trainingRequest('/api/renovaciones', {clave: renewalKey}); find('renovacion-accion').textContent = result.message; renewalKey = null; }
        catch (error) { find('renovacion-accion').textContent = trainingFailure(error); if ([400, 403, 409].includes(error.status)) renewalKey = null; }
        finally { renewalBusy = false; }
        await renewals.load(); renewalControls();
    });
    const refresh = () => { if (!familyBusy) loadFamily(); if (!renewalBusy) { renewalControls(); renewals.load(); periods.load(); } };
    find('renovaciones-actualizar').addEventListener('click', () => { loadMembership(); refresh(); });
    document.addEventListener('membership-updated', refresh); document.addEventListener('visibilitychange', () => { if (!document.hidden) { loadMembership(); refresh(); if (adminList) adminList.load(); } }); refresh();
}
