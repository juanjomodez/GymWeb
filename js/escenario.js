// Escenario completo: sala con materiales PBR, techo industrial con luz de área,
// letreros corpóreos, vitrina de planes, muro del equipo, tienda y equipos por zona.
import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import * as T from "./texturas.js";
import { mapas } from "./recursos.js";
import { letras, materialesLetrero, rotuloPiso } from "./texto3d.js";
import { crearProducto } from "./productos.js";
import { AREAS } from "./maquinas.js";
import {
    materiales, malla, grupo, caja, viga, mancuerna, pesaRusa, banco, arbolDiscos,
    rackPotencia, estacionPress, rackMancuernas, poleaAlta, prensaPiernas, caminadora,
    bicicleta, zonaPesasRusas, cuerdasBatalla, cajones
} from "./modelos.js";

// Material de superficie con texturas reales; si no cargaron, usa la textura de canvas de respaldo.
function superficie(recursos, nombre, repetir, opciones = {}, respaldo = null) {
    const m = mapas(recursos, nombre, repetir);
    if (!m.color && !m.normal && respaldo) {
        respaldo.repeat.set(...repetir);
        return new THREE.MeshStandardMaterial({ map: respaldo, roughness: .85, ...opciones });
    }
    return new THREE.MeshStandardMaterial({
        map: m.color ?? null, normalMap: m.normal ?? null, roughnessMap: m.arm ?? null, aoMap: m.arm ?? null,
        roughness: 1, ...opciones
    });
}

function plano(w, h, mat, x, y, z, rx = -Math.PI / 2, ry = 0) {
    const m = malla(new THREE.PlaneGeometry(w, h), mat, x, y, z, rx, ry, 0);
    m.castShadow = false;
    return m;
}

// Letrero de pared: letras retroiluminadas con una línea LED roja debajo.
function letreroPared(fuente, texto, { tamano = .85, intensidad = .6 } = {}) {
    const M = materiales();
    const g = grupo();
    const t = letras(fuente, texto, { tamano, profundidad: .08, materiales: materialesLetrero({ frente: "blanco", intensidad }) });
    t.position.z = .06;
    g.add(t);
    g.add(caja(t.userData.ancho + .5, .035, .03, M.ledRojo, 0, -.22, .03, .008));
    return g;
}

function vitrinaPlanes(fuente, planes) {
    const M = materiales();
    const g = grupo();
    const animables = [];
    // Panel de fondo de la vitrina
    g.add(caja(9.4, 3.2, .18, M.plastico, 0, 1.6, -1.7, .03));
    g.add(caja(9.4, .03, .02, M.ledRojo, 0, .04, -1.6, .006));
    if (fuente) {
        const titulo = letras(fuente, "ELIGE TU PLAN", { tamano: .62, profundidad: .1, materiales: materialesLetrero({ frente: "blanco", intensidad: .5 }) });
        titulo.position.set(0, 2.15, -1.55);
        g.add(titulo);
    }
    const objetos = [
        () => mancuerna({ radio: .085, ancho: .075, banda: true }),
        () => {
            const c = grupo();
            [[0, 0, .9], [-.24, .1, .78], [.24, .1, .78], [-.13, -.17, .72], [.13, -.17, .72]].forEach(([x, z, e], i) => {
                const k = pesaRusa(e, i === 0);
                k.position.set(x, 0, z);
                k.rotation.y = i;
                c.add(k);
            });
            return c;
        },
        () => mancuerna({ radio: .1, ancho: .09, banda: true, logo: true })
    ];
    planes.slice(0, 3).forEach((plan, i) => {
        const x = (i - 1) * 3;
        g.add(caja(1.15, .95, 1.15, M.plastico, x, .475, 0, .04));
        g.add(caja(1.2, .04, 1.2, M.acero, x, .97, 0, .01));
        g.add(caja(1.21, .014, 1.21, M.ledRojo, x, .945, 0, .005));
        if (fuente) {
            const nombre = letras(fuente, plan.nombre.replace(/^Plan\s+/i, "").toUpperCase(), { tamano: .2, profundidad: .02, materiales: materialesLetrero({ frente: "mate" }) });
            nombre.position.set(x, .55, .585);
            const precio = letras(fuente, plan.precio, { tamano: .12, profundidad: .015, materiales: materialesLetrero({ frente: "rojo", intensidad: 1.6 }) });
            precio.position.set(x, .32, .585);
            g.add(nombre, precio);
        }
        const objeto = objetos[i]();
        objeto.scale.setScalar(i === 1 ? 1.25 : 1.7);
        const flota = i !== 1;
        objeto.position.set(x, flota ? 1.38 : .99, 0);
        g.add(objeto);
        animables.push((dt, t) => {
            objeto.rotation.y += dt * (flota ? .5 : .15);
            if (flota) objeto.position.y = 1.42 + Math.sin(t * 1.3 + i) * .03;
        });
    });
    // Un solo panel de luz de área para toda la vitrina (menos luces = shaders más ligeros).
    const luz = new THREE.RectAreaLight(0xfff4ea, 9, 8.6, 1.6);
    luz.position.set(0, 4.2, 1.2);
    luz.lookAt(0, .9, 0);
    g.add(luz);
    return { grupo: g, animables };
}

function muroEquipo(fuente, entrenadores) {
    const M = materiales();
    const g = grupo();
    const cargador = new THREE.TextureLoader();
    if (fuente) {
        const titulo = letreroPared(fuente, "NUESTRO EQUIPO", { tamano: .62, intensidad: .25 });
        titulo.position.set(0, 3.25, 0);
        g.add(titulo);
    }
    entrenadores.slice(0, 5).forEach((e, i) => {
        const x = (i - (Math.min(entrenadores.length, 5) - 1) / 2) * 1.32;
        g.add(caja(1.1, 1.46, .05, M.acero, x, 1.95, .03, .01));
        const foto = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: .45 });
        const cuadro = malla(new THREE.PlaneGeometry(1.02, 1.38), foto, x, 1.95, .058, 0, 0, 0);
        cuadro.castShadow = false;
        g.add(cuadro);
        cargador.load(e.imagen, (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            // Recorte tipo "cover" para el marco vertical.
            const proporcion = (tex.image.width / tex.image.height) / (1.02 / 1.38);
            if (proporcion > 1) { tex.repeat.set(1 / proporcion, 1); tex.offset.set((1 - 1 / proporcion) / 2, 0); }
            else { tex.repeat.set(1, proporcion); tex.offset.set(0, (1 - proporcion) * .7); }
            foto.map = tex;
            foto.color.set(0xffffff);
            foto.needsUpdate = true;
        });
        if (fuente) {
            const nombre = letras(fuente, e.nombre.toUpperCase(), { tamano: .085, profundidad: .01, materiales: materialesLetrero({ frente: "mate" }) });
            nombre.position.set(x, 1.08, .03);
            g.add(nombre);
        }
    });
    return g;
}

function tienda(fuente, recursos) {
    const M = materiales();
    const g = grupo();
    const madera = superficie(recursos, "madera", [1, 2], {}, T.plataforma());
    // Estantería contra el muro (eje local x = a lo largo del muro, z = hacia la sala)
    g.add(caja(6.4, 2.5, .05, M.acero, 0, 1.3, .02, .01));
    for (const x of [-3.2, 0, 3.2]) g.add(caja(.05, 2.5, .44, M.acero, x, 1.3, .22, .01));
    const tipos = ["proteina", "creatina", "shaker"];
    const moldes = Object.fromEntries(tipos.map((t) => [t, crearProducto(t)]));
    [.3, .82, 1.34, 1.86].forEach((y, fila) => {
        g.add(caja(6.36, .035, .44, madera, 0, y, .22, .008));
        g.add(caja(6.3, .012, .012, M.ledBlanco, 0, y + .5, .4, .004));
        if (fila === 3) return;
        for (let i = 0; i < 11; i++) {
            const tipo = tipos[(i + fila) % 3];
            const p = moldes[tipo]?.clone();
            if (!p) continue;
            p.position.set(-2.9 + i * .58, y + .02, .2);
            p.rotation.y = (Math.random() - .5) * .3;
            p.traverse((o) => { o.castShadow = true; });
            g.add(p);
        }
    });
    // Mostrador
    g.add(caja(3.2, 1.0, .9, M.plastico, 0, .5, 2.3, .03));
    g.add(caja(3.3, .05, 1.0, madera, 0, 1.03, 2.3, .01));
    g.add(caja(3.2, .02, .02, M.ledRojo, 0, .08, 2.76, .005));
    ["proteina", "shaker", "creatina"].forEach((tipo, i) => {
        const p = moldes[tipo]?.clone();
        if (!p) return;
        p.position.set(-.8 + i * .8, 1.055, 2.2);
        p.scale.setScalar(1.4);
        g.add(p);
    });
    if (fuente) {
        const nombre = letreroPared(fuente, "GYMFLOW STORE", { tamano: .58 });
        nombre.position.set(0, 3.25, 0);
        g.add(nombre);
    }
    return g;
}

function marcoZona(ancho, fondo) {
    const canvas = document.createElement("canvas");
    const escala = 48;
    canvas.width = Math.round(ancho * escala);
    canvas.height = Math.round(fondo * escala);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "rgba(237,28,36,.16)";
    ctx.strokeStyle = "rgba(255,70,76,1)";
    ctx.lineWidth = 7;
    ctx.setLineDash([26, 14]);
    ctx.beginPath();
    ctx.roundRect(6, 6, canvas.width - 12, canvas.height - 12, 28);
    ctx.fill();
    ctx.stroke();
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

export function construirGimnasio({ calidad = "alta", recursos = {}, entrenadores = [], planes = [] } = {}) {
    RectAreaLightUniformsLib.init();
    const M = materiales(recursos);
    const fuente = recursos.fuente;
    const escena = grupo();
    const techo = grupo();
    const animables = [];
    const anclas = {};
    const zonasMapa = {};

    // ---------- sala ----------
    escena.add(plano(36, 44, superficie(recursos, "caucho", [18, 22], { color: 0x9a9a9e, normalScale: new THREE.Vector2(.7, .7) }, T.pisoCaucho()), 0, 0, -8));
    const muroMat = superficie(recursos, "concreto", [11, 2.4], { color: 0x55555a }, T.concreto());
    const muroFondo = superficie(recursos, "concreto", [9, 2.4], { color: 0x55555a }, T.concreto());
    escena.add(plano(44, 7.5, muroMat, -18, 3.75, -8, 0, Math.PI / 2));
    escena.add(plano(44, 7.5, muroMat, 18, 3.75, -8, 0, -Math.PI / 2));
    escena.add(plano(36, 7.5, muroFondo, 0, 3.75, -30, 0, 0));
    // Zócalo de caucho en los muros
    for (const x of [-17.97, 17.97]) escena.add(caja(.04, .5, 44, M.caucho, x, .25, -8, .01));
    escena.add(caja(36, .5, .04, M.caucho, 0, .25, -29.97, .01));

    // Techo industrial: losa, vigas, ducto y paneles LED con luz de área real.
    techo.add(plano(36, 44, new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 1 }), 0, 7.5, -8, Math.PI / 2));
    for (let z = 10; z >= -28; z -= 6) techo.add(caja(36, .36, .2, M.acero, 0, 7.15, z, .02));
    const ducto = malla(new THREE.CylinderGeometry(.36, .36, 44, 32, 1, true), M.aluminio, -2.5, 6.55, -8, Math.PI / 2, 0, 0);
    ducto.castShadow = false;
    techo.add(ducto);
    // Paneles visibles en el techo; la luz real la aportan pocas luces de área largas,
    // porque cada RectAreaLight agranda todos los shaders (y su tiempo de compilación).
    const paneles = [[-8.5, -1.5], [8.5, -1.5], [-8, -17], [8.5, -17], [0, -9], [0, 6], [15.6, 7]];
    for (const [x, z] of paneles) {
        techo.add(caja(1.3, .06, 6.5, M.ledBlanco, x, 7.0, z, .01));
        techo.add(caja(1.42, .08, 6.62, M.acero, x, 7.06, z, .01));
    }
    for (const [x, z, largo, intensidad] of [[-8.3, -9.5, 22, 6.5], [8.5, -9.5, 22, 6.5], [4, 6.5, 9, 5]]) {
        const luz = new THREE.RectAreaLight(0xfff1e4, intensidad, 2.6, largo);
        luz.position.set(x, 6.96, z);
        luz.rotation.x = -Math.PI / 2;
        escena.add(luz);
    }
    escena.add(techo);

    // Franjas LED rojas y columnas
    for (const x of [-17.9, 17.9]) escena.add(caja(.04, .05, 44, M.ledRojo, x, 2.95, -8, .01));
    escena.add(caja(36, .05, .04, M.ledRojo, 0, .55, -29.9, .01));
    for (const [x, z] of [[-12, -7], [12, -7], [-12, -21], [12, -21]]) {
        escena.add(caja(.7, 7.5, .7, muroMat, x, 3.75, z, .02));
        escena.add(caja(.04, 5.5, .04, M.ledRojo, x + .36 * Math.sign(-x), 3.3, z + .36, .01));
    }
    const espejo = new THREE.MeshPhysicalMaterial({ color: 0x0c0c0e, metalness: 1, roughness: .04 });
    for (const z of [-1, -5]) escena.add(caja(.04, 2.3, 3.6, espejo, 17.95, 1.55, z, .01));

    // ---------- letreros ----------
    let letreroMaterial = null;
    if (fuente) {
        const mats = materialesLetrero({ frente: "rojo", intensidad: 2.4 });
        letreroMaterial = mats[0];
        const marca = letras(fuente, "GYMFLOW", { tamano: 2.5, profundidad: .2, materiales: mats });
        marca.position.set(0, 3.7, -29.78);
        const lema = letras(fuente, "ENTRENA · MEJORA · SUPERA", { tamano: .42, profundidad: .05, materiales: materialesLetrero({ frente: "blanco", intensidad: .8 }) });
        lema.position.set(0, 2.85, -29.85);
        const halo = new THREE.Mesh(new THREE.PlaneGeometry(16, 6), new THREE.MeshBasicMaterial({ map: T.halo(), color: 0xff1a24, transparent: true, opacity: .55, depthWrite: false, toneMapped: false }));
        halo.position.set(0, 4.9, -29.93);
        escena.add(marca, lema, halo);
        const zonasPared = [
            ["PESO LIBRE", -17.9, -1.5, Math.PI / 2],
            ["CARDIO", -17.9, -17, Math.PI / 2],
            ["MÁQUINAS", 17.9, -3, -Math.PI / 2],
            ["FUNCIONAL", 17.9, -17, -Math.PI / 2]
        ];
        for (const [texto, x, z, ry] of zonasPared) {
            const l = letreroPared(fuente, texto);
            l.position.set(x, 4.25, z);
            l.rotation.y = ry;
            escena.add(l);
        }
    } else {
        const letrero = new THREE.Mesh(new THREE.PlaneGeometry(13, 3.25), new THREE.MeshBasicMaterial({ map: T.neon("GYMFLOW"), transparent: true, toneMapped: false, depthWrite: false }));
        letrero.position.set(0, 4.7, -29.85);
        escena.add(letrero);
    }

    // ---------- pisos especiales y rótulos ----------
    const madera = superficie(recursos, "madera", [1, 2], {}, T.plataforma());
    const plataforma = grupo(
        plano(1.3, 2.6, madera, 0, .012, 0),
        plano(.65, 2.6, M.caucho, -.975, .012, 0),
        plano(.65, 2.6, M.caucho, .975, .012, 0)
    );
    plataforma.position.set(-9.6, 0, -4);
    plataforma.rotation.y = .2;
    escena.add(plataforma);
    escena.add(plano(6.5, 13, superficie(recursos, "pista", [2, 4], { color: 0x8c8c8c }, T.cesped()), 8.4, .01, -17.2));
    const rotulos = [["PESO LIBRE", -10.2, 2.9], ["MÁQUINAS", 10.2, 2.3], ["CARDIO", -9, -12.9], ["FUNCIONAL", 8.4, -11.4]];
    for (const [texto, x, z] of rotulos) {
        const r = rotuloPiso(texto, { ancho: 5, alto: 1 });
        r.position.set(x, .018, z);
        escena.add(r);
    }

    // ---------- héroe ----------
    const heroe = mancuerna({ radio: .11, ancho: .095, agarre: .14, banda: true, logo: true });
    heroe.position.set(0, 1.42, 9);
    escena.add(heroe);
    escena.add(malla(new THREE.CylinderGeometry(.85, .95, .1, 64), M.plastico, 0, .05, 9));
    escena.add(malla(new THREE.TorusGeometry(.9, .012, 8, 96), M.ledRojo, 0, .1, 9, Math.PI / 2, 0, 0));
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 4.4), new THREE.MeshBasicMaterial({ map: T.halo(), color: 0xff1a24, transparent: true, opacity: .3, depthWrite: false, toneMapped: false }));
    halo.rotation.x = -Math.PI / 2;
    halo.position.set(0, .015, 9);
    escena.add(halo);

    // ---------- vitrina, muro del equipo y tienda ----------
    const vitrina = vitrinaPlanes(fuente, planes);
    vitrina.grupo.position.set(9, 0, 7.2);
    escena.add(vitrina.grupo);
    animables.push(...vitrina.animables);

    const equipo = muroEquipo(fuente, entrenadores);
    equipo.position.set(-17.95, 0, -9.6);
    equipo.rotation.y = Math.PI / 2;
    escena.add(equipo);
    // Baña solo los retratos: queda por debajo del letrero para no encandilarlo.
    const lavado = new THREE.RectAreaLight(0xfff4ea, 3.2, 7.5, .4);
    lavado.position.set(-16.4, 2.95, -9.6);
    lavado.lookAt(-17.9, 1.7, -9.6);
    escena.add(lavado);

    const store = tienda(fuente, recursos);
    store.position.set(17.95, 0, 7);
    store.rotation.y = -Math.PI / 2;
    escena.add(store);

    // ---------- equipos por zona ----------
    const colocar = (id, objeto, x, z, ry = 0) => {
        objeto.position.set(x, 0, z);
        objeto.rotation.y = ry;
        escena.add(objeto);
        if (objeto.userData.animar) animables.push(objeto.userData.animar);
        if (!id) return objeto;
        objeto.updateMatrixWorld(true);
        const caja3 = new THREE.Box3().setFromObject(objeto);
        const centro = caja3.getCenter(new THREE.Vector3());
        const tam = caja3.getSize(new THREE.Vector3());
        const radio = Math.max(tam.x, tam.z) * .52 + .2;
        const selector = new THREE.Mesh(
            new THREE.RingGeometry(radio - .035, radio, 96),
            new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, .18, .2), transparent: true, opacity: 0, toneMapped: false, depthWrite: false })
        );
        selector.rotation.x = -Math.PI / 2;
        selector.position.set(centro.x, .03, centro.z);
        escena.add(selector);
        anclas[id] = { punto: new THREE.Vector3(centro.x, caja3.max.y + .3, centro.z), centro, radio, selector };
        return objeto;
    };

    colocar("rack-sentadilla", rackPotencia(), -9.6, -4, .2);
    colocar("press-banca", estacionPress(), -6.3, .9, .45);
    colocar("mancuernas", rackMancuernas(), -14.6, -.8, Math.PI / 2);
    colocar(null, banco(), -12.2, -.9, Math.PI / 2 + .1);
    colocar(null, arbolDiscos(), -6.4, -4.8, .3);
    const sueltas = mancuerna({ radio: .085, ancho: .07, banda: true });
    sueltas.position.set(-7.6, .074, 2.2);
    sueltas.rotation.y = .9;
    escena.add(sueltas);

    colocar("polea-alta", poleaAlta(), 5.6, -3.6, -.3);
    colocar("prensa", prensaPiernas(), 10.2, -2.2, -.55);

    const filaCardio = grupo();
    for (const x of [-1.35, 0, 1.35]) {
        const c = caminadora();
        c.position.x = x;
        filaCardio.add(c);
        animables.push(c.userData.animar);
    }
    colocar("caminadora", filaCardio, -8.8, -17.6, 0);
    const bicis = grupo();
    for (const x of [0, 1.1]) {
        const b = bicicleta();
        b.position.x = x;
        bicis.add(b);
        animables.push(b.userData.animar);
    }
    colocar("bicicleta", bicis, -4.6, -16.2, 0);

    colocar("pesa-rusa", zonaPesasRusas(), 5.2, -14.4, 0);
    colocar("cuerdas", cuerdasBatalla(), 8.6, -22.2, 0);
    colocar("cajon", cajones(), 11.3, -18.8, 0);

    // ---------- zonas del mapa (vista cenital) ----------
    for (const area of AREAS) {
        const { x: [x0, x1], z: [z0, z1] } = area.plano;
        const marco = new THREE.Mesh(
            new THREE.PlaneGeometry(x1 - x0, z1 - z0),
            new THREE.MeshBasicMaterial({ map: marcoZona(x1 - x0, z1 - z0), transparent: true, opacity: 0, depthWrite: false, toneMapped: false })
        );
        marco.rotation.x = -Math.PI / 2;
        marco.position.set((x0 + x1) / 2, .04, (z0 + z1) / 2);
        marco.visible = false;
        escena.add(marco);
        // La etiqueta va hacia el borde frontal de la zona para no tapar los equipos.
        zonasMapa[area.id] = { malla: marco, centro: marco.position.clone(), etiqueta: new THREE.Vector3((x0 + x1) / 2, 0, z1 - 1.3) };
    }

    // ---------- iluminación ----------
    escena.add(new THREE.HemisphereLight(0xfff4ec, 0x1a0606, .22));
    const sol = new THREE.DirectionalLight(0xfff1e2, .9);
    sol.position.set(5, 16, 6);
    sol.target.position.set(0, 0, -8);
    if (calidad !== "baja") {
        sol.castShadow = true;
        sol.shadow.mapSize.set(4096, 4096);
        Object.assign(sol.shadow.camera, { left: -22, right: 22, top: 26, bottom: -26, near: 1, far: 50 });
        sol.shadow.bias = -.0004;
        sol.shadow.normalBias = .03;
    }
    escena.add(sol, sol.target);
    const focoHeroe = new THREE.SpotLight(0xffffff, 60, 8, .35, .5, 1.5);
    focoHeroe.position.set(1.4, 4.2, 10.6);
    focoHeroe.target = heroe;
    const contraluz = new THREE.PointLight(0xff1a28, 14, 5, 1.6);
    contraluz.position.set(-.9, 1.9, 7.9);
    const rojoFondo = new THREE.PointLight(0xff1a28, 50, 16, 1.4);
    rojoFondo.position.set(0, 4, -27);
    escena.add(focoHeroe, contraluz, rojoFondo);

    return { escena, anclas, animables, heroe, letreroMaterial, techo, zonasMapa };
}
