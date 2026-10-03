// Escena principal: el gimnasio 3D detrás del contenido, con la cámara guiada por el scroll,
// transiciones hacia las secciones 2D y vista cenital navegable.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { cargarRecursos } from "./recursos.js";
import { construirGimnasio } from "./escenario.js";
import { AREAS, MAQUINAS } from "./maquinas.js";
import { crearVitrina } from "./productos.js";
import { crearAcabado } from "./post.js";
import { crearMapa } from "./mapa.js";

const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const tactil = window.matchMedia("(pointer: coarse)").matches;
const esMovil = () => window.innerWidth < 760;
const FOV = 42;

// Tomas de cámara por elemento (id). `desplaz` mueve el sujeto en pantalla
// (fracción del ancho/alto; positivo = derecha/abajo) para dejar sitio al texto.
const TOMAS = {
    inicio: { pos: [-.2, 1.62, 10.28], mira: [0, 1.4, 9], desplaz: [.24, 0], movil: { pos: [0, 1.62, 10.75], mira: [0, 1.48, 9], desplaz: [0, .2] } },
    "intro-planes": {
        pos: [9, 2.15, 14.4], mira: [9, 1.3, 6.4],
        // En vertical la vitrina no cabe: la cámara la recorre de lado a lado con el scroll.
        panoramicaMovil: [{ pos: [6, 1.9, 11.4], mira: [6, 1.25, 6.8] }, { pos: [12, 1.9, 11.4], mira: [12, 1.25, 6.8] }]
    },
    planes: { pos: [6.6, 2.6, 11.6], mira: [9.4, 1.1, 6.2] },
    "intro-entrenadores": {
        pos: [-11.2, 1.8, -9.6], mira: [-17.9, 2.05, -9.6],
        panoramicaMovil: [{ pos: [-14.4, 2.1, -6.9], mira: [-17.9, 2.1, -6.9] }, { pos: [-14.4, 2.1, -12.3], mira: [-17.9, 2.1, -12.3] }]
    },
    entrenadores: { pos: [-12.6, 2.4, -6.2], mira: [-17.9, 1.9, -10.6] },
    rutinas: { pos: [-2.2, 1.7, -12.2], mira: [-8.8, 1, -17.6] },
    "intro-productos": { pos: [12.4, 2.05, 1.9], mira: [17.9, 1.75, 7.6] },
    productos: { pos: [13.6, 2.7, .6], mira: [17.4, 1.2, 7.8] },
    contacto: { pos: [3.4, 2.3, 13.6], mira: [0, 1.5, 7] }
};
const SECCIONES_2D = ["planes", "entrenadores", "rutinas", "productos", "contacto"];

function leerContenido() {
    const entrenadores = [...document.querySelectorAll("#entrenadores article")].map((a) => ({
        nombre: a.querySelector("h3")?.textContent.trim() ?? "",
        imagen: a.querySelector("img")?.getAttribute("src") ?? ""
    }));
    const planes = [...document.querySelectorAll("#planes article")].map((a) => ({
        nombre: a.querySelector("h3")?.textContent.trim() ?? "",
        precio: (a.querySelector(".valor-precio")?.textContent.trim() ?? "").toUpperCase()
    }));
    return { entrenadores, planes };
}

export async function iniciarExperiencia({ recorrido }) {
    const raiz = document.documentElement;
    const barra = document.querySelector(".cargador");
    const textoCarga = barra?.querySelector(".cargador-texto");
    const progreso = (p) => barra?.style.setProperty("--progreso", p.toFixed(3));
    const recursos = await cargarRecursos((p) => progreso(p * .6));
    performance.mark("gym:recursos");
    try { await Promise.race([document.fonts.load("400 64px Anton"), new Promise((r) => setTimeout(r, 2500))]); } catch { /* sin fuente web */ }

    const canvas = document.querySelector("#escena-3d");
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    const calidad = esMovil() || tactil ? "baja" : "alta";
    let ratio = Math.min(window.devicePixelRatio, calidad === "alta" ? 1.6 : 1.25);
    renderer.setPixelRatio(ratio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = calidad === "alta";
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;

    const escena = new THREE.Scene();
    escena.background = new THREE.Color(0x0b0b0d);
    escena.fog = new THREE.Fog(0x0b0b0d, 22, 60);
    const pmrem = new THREE.PMREMGenerator(renderer);
    escena.environment = recursos.hdri
        ? pmrem.fromEquirectangular(recursos.hdri).texture
        : pmrem.fromScene(new RoomEnvironment(), .04).texture;
    escena.environmentIntensity = recursos.hdri ? .45 : .3;
    recursos.hdri?.dispose();

    const gym = construirGimnasio({ calidad, recursos, ...leerContenido() });
    escena.add(gym.escena);
    performance.mark("gym:construido");

    const camara = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, .05, 320);

    // ---------- postproceso ----------
    const objetivo = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: calidad === "alta" ? 4 : 0 });
    const composer = new EffectComposer(renderer, objetivo);

    // Compila los shaders en paralelo (KHR_parallel_shader_compile) sin bloquear la página.
    // Se compila contra el render target del composer: sin tone mapping, igual que al dibujar.
    if (textoCarga) textoCarga.textContent = "Encendiendo las luces";
    progreso(.7);
    renderer.setRenderTarget(composer.readBuffer);
    try { await renderer.compileAsync(escena, camara); } catch (e) { console.warn("compileAsync no disponible", e); }
    renderer.setRenderTarget(null);
    performance.mark("gym:compilado");
    progreso(1);
    composer.addPass(new RenderPass(escena, camara));
    let gtao = null;
    if (calidad === "alta") {
        gtao = new GTAOPass(escena, camara, window.innerWidth, window.innerHeight);
        gtao.updateGtaoMaterial({ radius: .5, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 16 });
        gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
        gtao.blendIntensity = .85;
        composer.addPass(gtao);
    }
    const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), .5, .55, .9);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    const acabado = crearAcabado();
    composer.addPass(acabado);
    let usarComposer = true;

    // ---------- tomas ligadas al scroll ----------
    const v3 = (a) => new THREE.Vector3(...a);
    const alejarEnVertical = (pos, mira) => {
        // En pantallas verticales la cámara retrocede para conservar el encuadre horizontal.
        const aspecto = window.innerWidth / window.innerHeight;
        return aspecto < 1 ? mira.clone().add(pos.clone().sub(mira).multiplyScalar(1 + (1 - aspecto) * 1.15)) : pos;
    };
    const toma = (t) => {
        const usarMovil = esMovil() && t.movil;
        const m = usarMovil ? t.movil : t;
        const mira = v3(m.mira);
        const pos = usarMovil ? v3(m.pos) : alejarEnVertical(v3(m.pos), mira);
        const d = (esMovil() && !usarMovil) ? [0, 0] : (m.desplaz ?? [0, 0]);
        return { pos, mira, desplaz: new THREE.Vector2(...d) };
    };
    const tomaArea = (area) => {
        const mira = v3(area.camara.mira);
        return { pos: alejarEnVertical(v3(area.camara.pos), mira), mira, desplaz: new THREE.Vector2(esMovil() ? 0 : .14, esMovil() ? -.12 : 0) };
    };
    let anclas = [];

    function calcularAnclas() {
        const maximo = document.documentElement.scrollHeight - window.innerHeight;
        const vh = window.innerHeight;
        const lista = [];
        const topeDe = (el) => el.getBoundingClientRect().top + window.scrollY;
        for (const [id, t] of Object.entries(TOMAS)) {
            const el = document.getElementById(id);
            if (!el || !el.offsetHeight) continue;
            const limitar = (y) => Math.min(maximo, Math.max(0, y));
            if (esMovil() && t.panoramicaMovil) {
                t.panoramicaMovil.forEach((p, i) => {
                    const y = topeDe(el) + el.offsetHeight * (.3 + i * .4) - vh / 2;
                    lista.push({ y: limitar(y), ...toma(p) });
                });
                continue;
            }
            let y = topeDe(el) + el.offsetHeight / 2 - vh / 2;
            if (id === "inicio") y = 0;
            if (id === "contacto") y = maximo;
            lista.push({ y: limitar(y), ...toma(t) });
        }
        const sec = recorrido?.seccion;
        if (sec) {
            const y0 = topeDe(sec), total = sec.offsetHeight - vh;
            AREAS.forEach((area, i) => {
                const t = tomaArea(area);
                lista.push({ y: y0 + total * (i + .12) / AREAS.length, ...t });
                lista.push({ y: y0 + total * (i + .88) / AREAS.length, ...t });
            });
        }
        anclas = lista.sort((a, b) => a.y - b.y);
    }

    const deseada = { pos: new THREE.Vector3(), mira: new THREE.Vector3(), desplaz: new THREE.Vector2(), fov: FOV };
    const actual = { pos: new THREE.Vector3(), mira: new THREE.Vector3(), desplaz: new THREE.Vector2(), fov: FOV };
    const suave = (t) => t * t * (3 - 2 * t);

    function tomaPorScroll() {
        const y = window.scrollY;
        let i = 0;
        while (i < anclas.length - 2 && anclas[i + 1].y <= y) i++;
        const a = anclas[i], b = anclas[Math.min(i + 1, anclas.length - 1)];
        const t = b.y > a.y ? suave(Math.min(1, Math.max(0, (y - a.y) / (b.y - a.y)))) : 0;
        deseada.pos.lerpVectors(a.pos, b.pos, t);
        deseada.mira.lerpVectors(a.mira, b.mira, t);
        deseada.desplaz.lerpVectors(a.desplaz, b.desplaz, t);
        deseada.fov = FOV;
    }

    // ---------- velo de transición hacia las secciones 2D ----------
    const secciones2D = SECCIONES_2D.map((id) => document.getElementById(id)).filter(Boolean);
    function calcularVelo() {
        const vh = window.innerHeight, vw = window.innerWidth;
        let maximo = 0;
        for (const el of secciones2D) {
            const r = el.getBoundingClientRect();
            const entrada = (vh - r.top) / (vh * .75);
            const salida = r.bottom / (vh * .75);
            const v = reducido ? (r.top < vh && r.bottom > 0 ? 1 : 0) : Math.min(1, Math.max(0, Math.min(entrada, salida)));
            maximo = Math.max(maximo, v);
            // El contenido 2D se revela siguiendo la misma diagonal que el barrido del shader.
            if (v >= .999 || reducido) {
                el.style.clipPath = "";
            } else {
                const xArriba = vw * (1.4 * v - .4 * (r.top / vh));
                const xAbajo = vw * (1.4 * v - .4 * (r.bottom / vh));
                el.style.clipPath = `polygon(0 0, ${xArriba.toFixed(1)}px 0, ${xAbajo.toFixed(1)}px 100%, 0 100%)`;
            }
            el.style.setProperty("--v", v.toFixed(3));
        }
        return maximo;
    }

    // ---------- enfoque al abrir una ficha ----------
    let enfoque = null;
    let destacada = null;
    const anclasMaquina = gym.anclas;

    function tomaMaquina(id) {
        const a = anclasMaquina[id];
        const area = AREAS.find((x) => x.id === MAQUINAS.find((m) => m.id === id).area);
        const desde = v3(area.camara.pos).sub(a.centro).setY(0).normalize();
        const distancia = Math.max(3.2, a.radio * 3.1);
        return {
            pos: a.centro.clone().addScaledVector(desde, distancia).setY(Math.max(1.6, a.punto.y * .85)),
            mira: a.centro.clone().setY(a.punto.y * .42),
            desplaz: new THREE.Vector2(esMovil() ? 0 : -.16, esMovil() ? -.24 : 0)
        };
    }

    let visor = null;
    recorrido?.on("abrir", async (m) => {
        if (mapa?.activo) mapa.cerrar(AREAS.findIndex((a) => a.id === m.area));
        enfoque = tomaMaquina(m.id);
        destacada = m.id;
        try {
            if (!visor) {
                const { VisorAnatomico } = await import("./anatomia.js");
                visor = new VisorAnatomico(document.querySelector("#visor-anatomia"));
                recorrido.ficha.querySelectorAll("[data-lado]").forEach((b) => b.addEventListener("click", () => visor.girar(b.dataset.lado)));
            }
            visor.mostrar(m.musculos);
            visor.iniciar();
        } catch (error) {
            console.error("No se pudo cargar el visor anatómico", error);
        }
    });
    recorrido?.on("cerrar", () => {
        enfoque = null;
        destacada = null;
        visor?.detener();
    });
    let hover = null;
    recorrido?.on("destacar", (id) => { hover = id; });

    // ---------- vista cenital ----------
    const mapa = crearMapa({ gym, camara, recorrido });
    recorrido?.on("mapa", () => mapa?.abrir());

    // ---------- puntos sobre las máquinas ----------
    const capaPuntos = document.querySelector(".recorrido-puntos");
    const puntos = MAQUINAS.map((m) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "punto";
        b.tabIndex = -1;
        b.innerHTML = `<span class="punto-nucleo"></span><span class="punto-etiqueta"></span>`;
        b.querySelector(".punto-etiqueta").textContent = m.nombre;
        b.addEventListener("click", () => recorrido.abrir(m.id, b));
        b.addEventListener("pointerenter", () => { hover = m.id; });
        b.addEventListener("pointerleave", () => { hover = null; });
        capaPuntos?.append(b);
        return { m, b };
    });
    const proyectado = new THREE.Vector3();

    function actualizarPuntos() {
        const sec = recorrido?.seccion;
        if (!sec) return;
        const r = sec.getBoundingClientRect();
        const enVista = r.top < window.innerHeight * .4 && r.bottom > window.innerHeight * .6 && !enfoque && !mapa?.activo;
        const area = AREAS[recorrido.activa]?.id;
        for (const { m, b } of puntos) {
            const a = anclasMaquina[m.id];
            let visible = enVista && m.area === area && a;
            if (visible) {
                proyectado.copy(a.punto).project(camara);
                visible = proyectado.z < 1 && Math.abs(proyectado.x) < .95 && Math.abs(proyectado.y) < .9;
                if (visible) {
                    const x = (proyectado.x + 1) / 2 * window.innerWidth;
                    const y = (1 - proyectado.y) / 2 * window.innerHeight;
                    b.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
                }
            }
            b.classList.toggle("visible", Boolean(visible));
        }
    }

    function actualizarSelectores(dt) {
        const area = AREAS[recorrido?.activa]?.id;
        const sec = recorrido?.seccion?.getBoundingClientRect();
        const enRecorrido = sec && sec.top < window.innerHeight * .5 && sec.bottom > window.innerHeight * .5 && !mapa?.activo;
        for (const m of MAQUINAS) {
            const a = anclasMaquina[m.id];
            if (!a) continue;
            const objetivoOpacidad = m.id === destacada || m.id === hover ? 1 : enRecorrido && m.area === area && !destacada ? .3 : 0;
            a.selector.material.opacity += (objetivoOpacidad - a.selector.material.opacity) * Math.min(1, dt * 6);
            a.selector.visible = a.selector.material.opacity > .01;
        }
    }

    // ---------- interacción y tamaño ----------
    const puntero = new THREE.Vector2();
    const punteroSuave = new THREE.Vector2();
    if (!tactil && !reducido) {
        window.addEventListener("pointermove", (e) => {
            puntero.set(e.clientX / window.innerWidth * 2 - 1, e.clientY / window.innerHeight * 2 - 1);
        }, { passive: true });
    }

    function ajustar() {
        const w = window.innerWidth, h = window.innerHeight;
        renderer.setSize(w, h);
        composer.setPixelRatio(ratio);
        composer.setSize(w, h);
        acabado.uniforms.uResolucion.value.set(w * ratio, h * ratio);
        camara.aspect = w / h;
        camara.updateProjectionMatrix();
        calcularAnclas();
    }
    window.addEventListener("resize", ajustar);
    new ResizeObserver(calcularAnclas).observe(document.body);
    ajustar();

    tomaPorScroll();
    actual.pos.copy(deseada.pos);
    actual.mira.copy(deseada.mira);
    actual.desplaz.copy(deseada.desplaz);

    const vitrina = crearVitrina(document.querySelector("#vitrina-3d"), [...document.querySelectorAll(".producto-3d")]);

    // ---------- bucle ----------
    const reloj = new THREE.Clock();
    const derecha = new THREE.Vector3();
    let muestras = 0, acumulado = 0, nivel = 0, primerCuadro = true;
    let veloSuave = 0;

    function cuadro() {
        const dt = Math.min(reloj.getDelta(), .1);
        const t = reloj.elapsedTime;
        const w = window.innerWidth, h = window.innerHeight;

        if (mapa?.activo) {
            const m = mapa.toma(w / h, !esMovil());
            deseada.pos.copy(m.pos);
            deseada.mira.copy(m.mira);
            deseada.desplaz.copy(m.desplaz);
            deseada.fov = m.fov;
        } else if (enfoque) {
            deseada.pos.copy(enfoque.pos);
            deseada.mira.copy(enfoque.mira);
            deseada.desplaz.copy(enfoque.desplaz);
            deseada.fov = FOV;
        } else {
            tomaPorScroll();
        }
        const k = reducido ? 1 : 1 - Math.exp(-dt * (mapa?.activo ? 2.4 : 3.2));
        actual.pos.lerp(deseada.pos, k);
        actual.mira.lerp(deseada.mira, k);
        actual.desplaz.lerp(deseada.desplaz, k);
        actual.fov += (deseada.fov - actual.fov) * k;

        punteroSuave.lerp(mapa?.activo ? puntero.set(0, 0) : puntero, 1 - Math.exp(-dt * 2.5));
        camara.position.copy(actual.pos);
        camara.lookAt(actual.mira);
        derecha.setFromMatrixColumn(camara.matrix, 0);
        camara.position.addScaledVector(derecha, punteroSuave.x * .12).y -= punteroSuave.y * .06;
        camara.lookAt(actual.mira);
        if (Math.abs(camara.fov - actual.fov) > .01) camara.fov = actual.fov;
        camara.setViewOffset(w, h, -actual.desplaz.x * w, -actual.desplaz.y * h, w, h);

        // En la vista cenital se retira el techo y se despeja la niebla.
        const altura = camara.position.y;
        gym.techo.visible = altura < 8.5;
        const lejos = altura > 12;
        escena.fog.near += ((lejos ? 200 : 22) - escena.fog.near) * k;
        escena.fog.far += ((lejos ? 420 : 60) - escena.fog.far) * k;
        renderer.toneMappingExposure += ((lejos ? 1.9 : 1) - renderer.toneMappingExposure) * k;

        if (!reducido) {
            gym.heroe.rotation.y = t * .45 + window.scrollY * .002;
            gym.heroe.rotation.z = Math.sin(t * .7) * .12;
            gym.heroe.position.y = 1.42 + Math.sin(t * 1.2) * .035;
            gym.animables.forEach((fn) => fn(dt, t));
            if (gym.letreroMaterial) gym.letreroMaterial.emissiveIntensity = 2.3 + Math.sin(t * 2) * .1 + (Math.random() > .996 ? -1.4 : 0);
        }
        actualizarSelectores(dt);
        actualizarPuntos();
        mapa?.actualizar(dt);

        const velo = mapa?.activo || enfoque ? 0 : calcularVelo();
        veloSuave += (velo - veloSuave) * Math.min(1, dt * 12);
        acabado.uniforms.uVelo.value = veloSuave;
        acabado.uniforms.uBarrido.value = reducido ? 0 : veloSuave;
        acabado.uniforms.uTiempo.value = t;

        if (primerCuadro) renderer.shadowMap.needsUpdate = true;
        usarComposer ? composer.render(dt) : renderer.render(escena, camara);
        vitrina.render(dt);

        if (primerCuadro) {
            primerCuadro = false;
            raiz.classList.add("escena-lista");
            performance.mark("gym:primer-cuadro");
        } else if (nivel < 2 && t > 1.5) {
            // Calidad adaptativa por pasos: primero se apaga la oclusión, luego bloom y resolución.
            muestras++;
            acumulado += dt;
            if (muestras === 60) {
                if (acumulado / 60 > 1 / 42) {
                    if (nivel === 0 && gtao) { gtao.enabled = false; }
                    else { ratio = 1; usarComposer = false; renderer.setPixelRatio(ratio); ajustar(); nivel = 1; }
                    nivel++;
                } else {
                    nivel = 2;
                }
                muestras = 0;
                acumulado = 0;
            }
        }
        requestAnimationFrame(cuadro);
    }
    requestAnimationFrame(cuadro);
}
