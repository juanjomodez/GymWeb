// Punto de entrada de la portada. El recorrido funciona sin 3D; la escena se
// carga aparte y, si falla (sin WebGL o sin CDN), la página vuelve al diseño plano.
import { iniciarRecorrido } from "./recorrido.js";

const raiz = document.documentElement;
const recorrido = iniciarRecorrido();
iniciarIndice();

// Marca en el índice lateral la sección visible (las tomas de introducción cuentan para su sección).
function iniciarIndice() {
    const enlaces = [...document.querySelectorAll(".indice a[data-seccion]")];
    if (!enlaces.length) return;
    const inicios = enlaces.map((a) => document.getElementById(`intro-${a.dataset.seccion}`) || document.getElementById(a.dataset.seccion));
    const actualizar = () => {
        const centro = window.innerHeight * .5;
        let activa = 0;
        inicios.forEach((el, i) => { if (el && el.getBoundingClientRect().top < centro) activa = i; });
        enlaces.forEach((a, i) => a.setAttribute("aria-current", String(i === activa)));
    };
    window.addEventListener("scroll", actualizar, { passive: true });
    actualizar();
}

function sin3D(error) {
    if (error) console.error("Experiencia 3D desactivada:", error);
    raiz.classList.remove("con-3d");
    raiz.classList.add("escena-lista");
}

if (raiz.classList.contains("con-3d")) {
    import("./experiencia.js")
        .then(({ iniciarExperiencia }) => iniciarExperiencia({ recorrido }))
        .catch(sin3D);
} else {
    sin3D();
}
