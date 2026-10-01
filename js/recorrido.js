// Interfaz del recorrido por áreas y ficha de máquina. No depende de Three.js:
// sin WebGL las pestañas cambian de área y la ficha muestra los músculos como lista.
import { AREAS, MAQUINAS } from "./maquinas.js";

const NOMBRES = {
    pectorales: "Pectorales", deltoides: "Deltoides", biceps: "Bíceps", triceps: "Tríceps",
    antebrazos: "Antebrazos", abdominales: "Abdominales", oblicuos: "Oblicuos", trapecio: "Trapecio",
    dorsales: "Dorsales", lumbares: "Zona lumbar", gluteos: "Glúteos", cuadriceps: "Cuádriceps",
    isquiotibiales: "Isquiotibiales", gemelos: "Gemelos"
};

export function iniciarRecorrido() {
    const seccion = document.querySelector("#recorrido");
    const ficha = document.querySelector("#ficha-maquina");
    if (!seccion || !ficha) return null;

    const oyentes = { area: [], abrir: [], cerrar: [], destacar: [], mapa: [] };
    const emitir = (evento, dato) => oyentes[evento].forEach((fn) => fn(dato));
    const pestanas = seccion.querySelector(".recorrido-tabs");
    const lista = seccion.querySelector(".recorrido-maquinas");
    const titulo = seccion.querySelector("#area-titulo");
    const texto = seccion.querySelector("#area-texto");
    const contador = seccion.querySelector(".recorrido-contador");
    let activa = -1;
    let origenFoco = null;

    AREAS.forEach((area, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.setAttribute("role", "tab");
        b.id = `tab-${area.id}`;
        b.setAttribute("aria-controls", "recorrido-panel");
        b.textContent = area.nombre;
        b.addEventListener("click", () => irArea(i));
        pestanas.append(b);
    });

    const con3D = () => document.documentElement.classList.contains("con-3d");

    function irArea(i, { instantaneo = false } = {}) {
        if (!con3D()) { ponerArea(i); return; }
        const r = seccion.getBoundingClientRect();
        const recorridoTotal = r.height - window.innerHeight;
        const destino = window.scrollY + r.top + recorridoTotal * (i + .5) / AREAS.length;
        const suave = !instantaneo && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: destino, behavior: suave ? "smooth" : "instant" });
        ponerArea(i);
    }

    function ponerArea(i) {
        if (i === activa) return;
        activa = i;
        const area = AREAS[i];
        [...pestanas.children].forEach((b, j) => {
            b.setAttribute("aria-selected", String(j === i));
            b.tabIndex = j === i ? 0 : -1;
        });
        titulo.textContent = area.titulo;
        texto.textContent = area.texto;
        contador.textContent = `${String(i + 1).padStart(2, "0")} / ${String(AREAS.length).padStart(2, "0")}`;
        lista.replaceChildren(...MAQUINAS.filter((m) => m.area === area.id).map((m) => {
            const li = document.createElement("li");
            const b = document.createElement("button");
            b.type = "button";
            b.dataset.maquina = m.id;
            b.innerHTML = `<span></span><strong></strong><em>Ver ejercicio</em>`;
            b.querySelector("strong").textContent = m.nombre;
            b.addEventListener("click", () => abrir(m.id, b));
            b.addEventListener("pointerenter", () => emitir("destacar", m.id));
            b.addEventListener("pointerleave", () => emitir("destacar", null));
            li.append(b);
            return li;
        }));
        seccion.querySelector(".recorrido-info").classList.remove("cambio-area");
        void seccion.offsetWidth;
        seccion.querySelector(".recorrido-info").classList.add("cambio-area");
        emitir("area", i);
    }

    // Navegación por teclado entre pestañas
    pestanas.addEventListener("keydown", (e) => {
        const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!dir) return;
        const i = (activa + dir + AREAS.length) % AREAS.length;
        irArea(i);
        if (!con3D()) pestanas.children[i].focus();
    });

    function progreso() {
        const r = seccion.getBoundingClientRect();
        const total = r.height - window.innerHeight;
        return total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 0;
    }

    const alDesplazar = () => {
        if (!con3D()) return;
        ponerArea(Math.min(AREAS.length - 1, Math.floor(progreso() * AREAS.length)));
    };
    window.addEventListener("scroll", alDesplazar, { passive: true });

    // ---------- ficha ----------
    const chips = (ids, clase) => ids.map((id) => {
        const li = document.createElement("li");
        li.className = clase;
        li.textContent = NOMBRES[id] || id;
        return li;
    });

    function abrir(id, origen) {
        const m = MAQUINAS.find((x) => x.id === id);
        if (!m) return;
        origenFoco = origen || document.activeElement;
        const area = AREAS.find((a) => a.id === m.area);
        ficha.querySelector(".ficha-area").textContent = area.titulo;
        ficha.querySelector("#ficha-titulo").textContent = m.nombre;
        ficha.querySelector(".ficha-ejercicio").textContent = m.ejercicio;
        ficha.querySelector(".ficha-descripcion").textContent = m.descripcion;
        ficha.querySelector(".chips-principales").replaceChildren(...chips(m.musculos.principales, "chip-principal"));
        ficha.querySelector(".chips-secundarios").replaceChildren(...chips(m.musculos.secundarios, "chip-secundario"));
        ficha.querySelector(".ficha-pasos").replaceChildren(...m.pasos.map((p) => {
            const li = document.createElement("li");
            li.textContent = p;
            return li;
        }));
        ficha.hidden = false;
        document.body.classList.add("ficha-abierta");
        requestAnimationFrame(() => ficha.classList.add("ficha-visible"));
        ficha.querySelector(".ficha-cerrar").focus({ preventScroll: true });
        emitir("abrir", m);
    }

    function cerrar() {
        if (ficha.hidden) return;
        ficha.classList.remove("ficha-visible");
        document.body.classList.remove("ficha-abierta");
        window.setTimeout(() => { if (!ficha.classList.contains("ficha-visible")) ficha.hidden = true; }, 420);
        origenFoco?.focus?.({ preventScroll: true });
        emitir("cerrar");
    }

    ficha.querySelector(".ficha-cerrar").addEventListener("click", cerrar);
    document.querySelector(".ficha-fondo")?.addEventListener("click", cerrar);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrar(); });

    document.querySelectorAll("[data-abrir-mapa]").forEach((b) => b.addEventListener("click", () => emitir("mapa")));

    ponerArea(0);
    alDesplazar();

    return {
        seccion,
        ficha,
        progreso,
        get activa() { return activa; },
        abrir,
        cerrar,
        irArea,
        on(evento, fn) { (oyentes[evento] ||= []).push(fn); }
    };
}
