// Productos 3D de la tienda. Un solo renderer transparente dibuja cada producto
// dentro del rectángulo de su tarjeta (técnica de viewport + scissor).
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import * as T from "./texturas.js";

function perfil(puntos) {
    return puntos.map(([r, y]) => new THREE.Vector2(r, y));
}

function tarro({ radio, alto, cuerpo, tapa, etiqueta }) {
    const g = new THREE.Group();
    const r = radio;
    const cuerpoGeo = new THREE.LatheGeometry(perfil([
        [.0001, 0], [r * .9, 0], [r * .97, .004], [r, .014], [r, alto * .86], [r * .96, alto * .9], [r * .9, alto * .92], [.0001, alto * .92]
    ]), 72);
    g.add(new THREE.Mesh(cuerpoGeo, new THREE.MeshPhysicalMaterial({ color: cuerpo, roughness: .28, clearcoat: 1, clearcoatRoughness: .15 })));

    const mapa = T.etiquetaProducto(etiqueta);
    mapa.offset.x = .25;
    const banda = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 1.004, r * 1.004, alto * .62, 96, 1, true),
        new THREE.MeshPhysicalMaterial({ map: mapa, roughness: .35, clearcoat: .8, clearcoatRoughness: .2 })
    );
    banda.position.y = alto * .44;
    g.add(banda);

    const estrias = T.moleteado();
    estrias.repeat.set(30, .5);
    const tapaGeo = new THREE.LatheGeometry(perfil([
        [.0001, alto * .9], [r * 1.03, alto * .9], [r * 1.045, alto * .91], [r * 1.045, alto * 1.07], [r * 1.02, alto * 1.09], [r * .9, alto * 1.1], [.0001, alto * 1.1]
    ]), 96);
    g.add(new THREE.Mesh(tapaGeo, new THREE.MeshPhysicalMaterial({ color: tapa, roughness: .35, clearcoat: .7, bumpMap: estrias, bumpScale: 1.5 })));
    return g;
}

function shaker() {
    const g = new THREE.Group();
    const cuerpo = new THREE.LatheGeometry(perfil([
        [.0001, 0], [.038, 0], [.042, .006], [.048, .16], [.0485, .17]
    ]), 72);
    g.add(new THREE.Mesh(cuerpo, new THREE.MeshPhysicalMaterial({
        color: 0x2a2a30, roughness: .08, clearcoat: 1, transparent: true, opacity: .5, side: THREE.DoubleSide, depthWrite: false
    })));
    const batido = new THREE.Mesh(
        new THREE.CylinderGeometry(.044, .039, .095, 48),
        new THREE.MeshPhysicalMaterial({ color: 0x7a3b22, roughness: .4, sheen: 1, sheenColor: 0xc06040 })
    );
    batido.position.y = .05;
    g.add(batido);
    const marcas = T.marcasShaker();
    marcas.offset.x = .25;
    const decal = new THREE.Mesh(
        new THREE.CylinderGeometry(.0465, .0425, .15, 72, 1, true),
        new THREE.MeshBasicMaterial({ map: marcas, transparent: true, depthWrite: false })
    );
    decal.position.y = .085;
    g.add(decal);
    const negro = new THREE.MeshPhysicalMaterial({ color: 0x0d0d0f, roughness: .3, clearcoat: .8 });
    const rojo = new THREE.MeshPhysicalMaterial({ color: 0xd3121b, roughness: .28, clearcoat: 1 });
    const tapa = new THREE.LatheGeometry(perfil([
        [.0001, .165], [.05, .165], [.051, .2], [.044, .215], [.022, .222], [.0001, .222]
    ]), 72);
    g.add(new THREE.Mesh(tapa, negro));
    const tapon = new THREE.Mesh(new THREE.CylinderGeometry(.016, .018, .022, 32), rojo);
    tapon.position.set(.012, .228, 0);
    g.add(tapon);
    const asa = new THREE.Mesh(new THREE.TorusGeometry(.022, .006, 12, 32, Math.PI), negro);
    asa.position.set(-.035, .205, 0);
    asa.rotation.z = Math.PI / 2;
    g.add(asa);
    return g;
}

export function crearProducto(tipo) {
    return CATALOGO[tipo]?.() ?? null;
}

const CATALOGO = {
    proteina: () => tarro({
        radio: .078, alto: .2, cuerpo: 0x111113, tapa: 0xd3121b,
        etiqueta: { titulo: "WHEY", subtitulo: "PROTEÍNA DE SUERO", fondo: "#111113", acento: "#ed1c24" }
    }),
    creatina: () => tarro({
        radio: .058, alto: .15, cuerpo: 0xf2f0ee, tapa: 0x111113,
        etiqueta: { titulo: "CREATINA", subtitulo: "MONOHIDRATO", fondo: "#f2f0ee", acento: "#ed1c24", textoColor: "#141416" }
    }),
    shaker
};

export function crearVitrina(canvas, slots) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setClearColor(0x000000, 0);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const entorno = pmrem.fromScene(new RoomEnvironment(), .04).texture;
    const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const items = slots.map((slot) => {
        const crear = CATALOGO[slot.dataset.producto];
        if (!crear) return null;
        const escena = new THREE.Scene();
        escena.environment = entorno;
        escena.environmentIntensity = .7;
        const clave = new THREE.DirectionalLight(0xffffff, 2.4);
        clave.position.set(.6, 1, 1);
        const borde = new THREE.PointLight(0xff2a36, 2.2, 2, 1.2);
        borde.position.set(-.4, .3, -.35);
        escena.add(clave, borde);
        const modelo = crear();
        const caja = new THREE.Box3().setFromObject(modelo);
        const alto = caja.max.y - caja.min.y;
        modelo.position.y = -caja.min.y - alto / 2;
        const pivote = new THREE.Group();
        pivote.add(modelo);
        escena.add(pivote);
        const camara = new THREE.PerspectiveCamera(26, 1, .01, 10);
        camara.position.set(0, .06, alto * 2.9 + .12);
        camara.lookAt(0, 0, 0);
        const estado = { slot, escena, camara, pivote, giro: 0, encima: false, inclinacion: 0, escala: 0, tarjeta: slot.closest("article") };
        estado.tarjeta?.addEventListener("pointerenter", () => { estado.encima = true; });
        estado.tarjeta?.addEventListener("pointerleave", () => { estado.encima = false; estado.inclinacion = 0; });
        estado.tarjeta?.addEventListener("pointermove", (e) => {
            const r = estado.tarjeta.getBoundingClientRect();
            estado.inclinacion = ((e.clientY - r.top) / r.height - .5) * .5;
        });
        return estado;
    }).filter(Boolean);

    const ajustar = () => renderer.setSize(window.innerWidth, window.innerHeight);
    ajustar();
    window.addEventListener("resize", ajustar);

    return {
        render(dt) {
            renderer.setScissorTest(false);
            renderer.clear();
            renderer.setScissorTest(true);
            const altoVentana = window.innerHeight;
            for (const it of items) {
                const r = it.slot.getBoundingClientRect();
                const visible = r.bottom > 0 && r.top < altoVentana && r.width > 0;
                const lista = !it.tarjeta?.classList.contains("animar-entrada") || it.tarjeta.classList.contains("entrada-visible");
                if (!visible || !lista) continue;
                it.escala += (1 - it.escala) * Math.min(1, dt * (reducido ? 60 : 4));
                it.tiempo = (it.tiempo || 0) + dt;
                if (reducido) {
                    it.giro = 0;
                } else if (it.encima) {
                    it.giro += dt * 2.2;
                } else {
                    // En reposo se balancea mirando al frente para que la etiqueta se lea.
                    const vuelta = Math.round(it.giro / (Math.PI * 2)) * Math.PI * 2;
                    const objetivo = vuelta + Math.sin(it.tiempo * .7) * .5;
                    it.giro += (objetivo - it.giro) * Math.min(1, dt * 2.5);
                }
                it.pivote.rotation.set(THREE.MathUtils.lerp(it.pivote.rotation.x, it.inclinacion, .1), it.giro, 0);
                it.pivote.scale.setScalar(.75 + it.escala * .25);
                it.pivote.position.y = reducido ? 0 : Math.sin(it.giro * 1.3) * .006;
                renderer.setViewport(r.left, altoVentana - r.bottom, r.width, r.height);
                renderer.setScissor(r.left, altoVentana - r.bottom, r.width, r.height);
                it.camara.aspect = r.width / r.height;
                it.camara.updateProjectionMatrix();
                renderer.render(it.escena, it.camara);
            }
        }
    };
}
