// Vista cenital: la cámara sube sobre el gimnasio, se oculta el techo y cada zona
// queda marcada en el piso. Elegir una zona hace descender la cámara hasta ella.
import * as THREE from "three";
import { AREAS, MAQUINAS } from "./maquinas.js";

const ANCHO_SALA = 36, FONDO_SALA = 46, CENTRO_Z = -8.6;

export function crearMapa({ gym, camara, recorrido }) {
    const ui = document.querySelector(".mapa-ui");
    const capa = ui?.querySelector(".mapa-etiquetas");
    if (!ui || !capa) return null;
    let activo = false;
    let hover = null;
    const proyectado = new THREE.Vector3();

    const zonas = AREAS.map((area, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "mapa-zona";
        const cantidad = MAQUINAS.filter((m) => m.area === area.id).length;
        b.innerHTML = `<strong></strong><span>${cantidad} ${cantidad === 1 ? "equipo" : "equipos"} · Entrar</span>`;
        b.querySelector("strong").textContent = area.nombre;
        b.addEventListener("click", () => cerrar(i));
        b.addEventListener("pointerenter", () => { hover = area.id; });
        b.addEventListener("pointerleave", () => { hover = null; });
        b.addEventListener("focus", () => { hover = area.id; });
        b.addEventListener("blur", () => { hover = null; });
        capa.append(b);
        return { area, b, i };
    });
    const puntos = MAQUINAS.map((m) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "mapa-maquina";
        b.setAttribute("aria-label", `${m.nombre}: ver ejercicio`);
        b.innerHTML = `<span></span><em></em>`;
        b.querySelector("em").textContent = m.nombre;
        b.addEventListener("click", () => {
            cerrar(AREAS.findIndex((a) => a.id === m.area));
            recorrido.abrir(m.id, b);
        });
        capa.append(b);
        return { m, b };
    });

    function abrir() {
        if (activo) return;
        activo = true;
        recorrido.cerrar();
        ui.hidden = false;
        document.body.classList.add("modo-mapa");
        Object.values(gym.zonasMapa).forEach((z) => { z.malla.visible = true; });
        requestAnimationFrame(() => ui.classList.add("mapa-visible"));
        window.setTimeout(() => zonas[Math.max(0, recorrido.activa)]?.b.focus({ preventScroll: true }), 300);
    }

    function cerrar(indiceArea = null) {
        if (!activo) return;
        activo = false;
        ui.classList.remove("mapa-visible");
        document.body.classList.remove("modo-mapa");
        window.setTimeout(() => { if (!activo) ui.hidden = true; }, 450);
        if (indiceArea !== null) recorrido.irArea(indiceArea, { instantaneo: true });
    }

    ui.querySelector(".mapa-cerrar")?.addEventListener("click", () => cerrar());
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && activo) cerrar(); });

    // Toma cenital calculada para que la sala entera quepa en pantalla.
    function toma(aspecto, enEscritorio) {
        const fov = enEscritorio ? 30 : 42;
        const medioV = THREE.MathUtils.degToRad(fov / 2);
        const medioH = Math.atan(Math.tan(medioV) * aspecto);
        const distancia = Math.max((FONDO_SALA / 2) / Math.tan(medioV) * .92, (ANCHO_SALA / 2) / Math.tan(medioH)) * 1.04;
        const inclinacion = .2;
        return {
            fov,
            pos: new THREE.Vector3(0, distancia * Math.cos(inclinacion), CENTRO_Z + distancia * Math.sin(inclinacion)),
            mira: new THREE.Vector3(0, 0, CENTRO_Z),
            desplaz: new THREE.Vector2(enEscritorio ? .11 : 0, enEscritorio ? 0 : -.13)
        };
    }

    function actualizar(dt) {
        const k = Math.min(1, dt * 7);
        const altura = camara.position.y;
        const listo = activo && altura > 30;
        for (const { area, b } of zonas) {
            const z = gym.zonasMapa[area.id];
            const objetivo = activo ? (hover === area.id ? 1 : .55) : 0;
            z.malla.material.opacity += (objetivo - z.malla.material.opacity) * k;
            if (!activo && z.malla.material.opacity < .01) z.malla.visible = false;
            proyectado.copy(z.etiqueta).project(camara);
            b.style.transform = `translate3d(${((proyectado.x + 1) / 2 * window.innerWidth).toFixed(1)}px, ${((1 - proyectado.y) / 2 * window.innerHeight).toFixed(1)}px, 0)`;
            b.classList.toggle("visible", listo);
            b.classList.toggle("activa", hover === area.id);
        }
        for (const { m, b } of puntos) {
            const a = gym.anclas[m.id];
            if (!a) continue;
            proyectado.copy(a.centro).setY(.1).project(camara);
            b.style.transform = `translate3d(${((proyectado.x + 1) / 2 * window.innerWidth).toFixed(1)}px, ${((1 - proyectado.y) / 2 * window.innerHeight).toFixed(1)}px, 0)`;
            b.classList.toggle("visible", listo);
        }
    }

    return {
        get activo() { return activo; },
        abrir,
        cerrar,
        toma,
        actualizar
    };
}
