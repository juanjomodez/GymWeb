// Equipos del gimnasio modelados con geometría procedural (Lathe, Extrude, Tube,
// RoundedBox). El escenario completo se arma en escenario.js.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import * as T from "./texturas.js";
import { mapas } from "./recursos.js";

const EJE_Y = new THREE.Vector3(0, 1, 0);
let cacheMateriales;

// Materiales PBR. Los que tienen texturas reales (cuero, acero) las reciben de `recursos`;
// las piezas pequeñas usan relieve procedural para no repetir patrones visibles.
export function materiales(recursos) {
    if (cacheMateriales) return cacheMateriales;
    const moleteLargo = T.moleteado();
    moleteLargo.repeat.set(3, 40);
    const moleteCorto = T.moleteado();
    moleteCorto.repeat.set(3, 4);
    const cuerda = T.moleteado();
    cuerda.repeat.set(2, 90);
    const grano = T.tapizado();
    grano.repeat.set(2, 2);
    const perforado = T.perforaciones();
    perforado.repeat.set(1, 3);
    const cuero = mapas(recursos, "cuero", [1.4, 1.4]);
    const metal = mapas(recursos, "metal", [1, 1]);

    cacheMateriales = {
        cromo: new THREE.MeshPhysicalMaterial({ color: 0xf4f4f6, metalness: 1, roughness: .07, clearcoat: .3, clearcoatRoughness: .08 }),
        cromoMoleteado: new THREE.MeshStandardMaterial({ color: 0xd6d7db, metalness: 1, roughness: .28, bumpMap: moleteLargo, bumpScale: 2 }),
        cromoMoleteadoCorto: new THREE.MeshStandardMaterial({ color: 0xd6d7db, metalness: 1, roughness: .26, bumpMap: moleteCorto, bumpScale: 2 }),
        aluminio: new THREE.MeshStandardMaterial({ color: 0x9a9da3, metalness: 1, roughness: .34 }),
        acero: new THREE.MeshStandardMaterial({
            color: 0x18181b, metalness: .6, roughness: metal.arm ? .95 : .42,
            roughnessMap: metal.arm ?? null, normalMap: metal.normal ?? null, normalScale: new THREE.Vector2(.12, .12)
        }),
        aceroPerforado: new THREE.MeshStandardMaterial({ map: perforado, metalness: .6, roughness: .45 }),
        caucho: new THREE.MeshStandardMaterial({ color: 0x111113, roughness: .78, bumpMap: grano, bumpScale: .5 }),
        cauchoRojo: new THREE.MeshStandardMaterial({ color: 0xa3101a, roughness: .7, bumpMap: grano, bumpScale: .5 }),
        hierro: new THREE.MeshStandardMaterial({ color: 0x19191b, metalness: .6, roughness: .55, bumpMap: grano, bumpScale: .9 }),
        rojo: new THREE.MeshPhysicalMaterial({ color: 0xc8101a, metalness: .3, roughness: .3, clearcoat: 1, clearcoatRoughness: .12 }),
        tapiz: new THREE.MeshPhysicalMaterial({
            color: 0x131315, roughness: cuero.arm ? 1 : .5, roughnessMap: cuero.arm ?? null,
            normalMap: cuero.normal ?? null, normalScale: new THREE.Vector2(.9, .9),
            sheen: .4, sheenColor: 0x303034, sheenRoughness: .6
        }),
        plastico: new THREE.MeshPhysicalMaterial({ color: 0x0f0f11, roughness: .38, clearcoat: .5, clearcoatRoughness: .3 }),
        espuma: new THREE.MeshStandardMaterial({ color: 0x1c1c1f, roughness: .95, bumpMap: grano, bumpScale: .4 }),
        cuerda: new THREE.MeshStandardMaterial({ color: 0x151517, roughness: .9, bumpMap: cuerda, bumpScale: 3 }),
        ledRojo: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, .14, .17), toneMapped: false }),
        ledBlanco: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.55, 2.5), toneMapped: false })
    };
    return cacheMateriales;
}

// ---------- utilidades ----------

export function malla(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
}

export function grupo(...hijos) {
    const g = new THREE.Group();
    if (hijos.length) g.add(...hijos);
    return g;
}

// Redondea las esquinas de un perfil 2D para que el torno tenga bordes suaves.
function perfil(puntos, radio = .004, pasos = 3) {
    const salida = [];
    puntos.forEach((p, i) => {
        const actual = new THREE.Vector2(...p);
        if (i === 0 || i === puntos.length - 1) { salida.push(actual); return; }
        const previo = new THREE.Vector2(...puntos[i - 1]).sub(actual);
        const siguiente = new THREE.Vector2(...puntos[i + 1]).sub(actual);
        const p0 = actual.clone().add(previo.setLength(Math.min(radio, previo.length() / 2)));
        const p2 = actual.clone().add(siguiente.setLength(Math.min(radio, siguiente.length() / 2)));
        for (let s = 0; s <= pasos; s++) {
            const t = s / pasos, a = (1 - t) ** 2, b = 2 * (1 - t) * t, c = t * t;
            salida.push(new THREE.Vector2(a * p0.x + b * actual.x + c * p2.x, a * p0.y + b * actual.y + c * p2.y));
        }
    });
    return salida;
}

// Cilindro entre dos puntos.
export function barra(a, b, radio, mat, segmentos = 20) {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const dir = vb.clone().sub(va);
    const m = malla(new THREE.CylinderGeometry(radio, radio, dir.length(), segmentos), mat);
    m.position.copy(va).add(vb).multiplyScalar(.5);
    m.quaternion.setFromUnitVectors(EJE_Y, dir.normalize());
    return m;
}

// Perfil de acero cuadrado entre dos puntos.
export function viga(a, b, ancho, mat) {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const dir = vb.clone().sub(va);
    const m = malla(new RoundedBoxGeometry(ancho, dir.length(), ancho, 2, ancho * .18), mat);
    m.position.copy(va).add(vb).multiplyScalar(.5);
    m.quaternion.setFromUnitVectors(EJE_Y, dir.normalize());
    return m;
}

export function caja(w, h, d, mat, x = 0, y = 0, z = 0, radio = Math.min(w, h, d) * .2) {
    return malla(new RoundedBoxGeometry(w, h, d, 3, radio), mat, x, y, z);
}

export function tubo(puntos, radio, mat, segmentos = 64) {
    const curva = new THREE.CatmullRomCurve3(puntos.map((p) => new THREE.Vector3(...p)));
    return malla(new THREE.TubeGeometry(curva, segmentos, radio, 14, false), mat);
}

// ---------- pesas ----------

const cacheGeo = new Map();
function enCache(clave, crear) {
    if (!cacheGeo.has(clave)) cacheGeo.set(clave, crear());
    return cacheGeo.get(clave);
}

function geoHexagono(radio, ancho) {
    return enCache(`hex${radio}-${ancho}`, () => {
        const forma = new THREE.Shape();
        for (let i = 0; i <= 6; i++) {
            const a = i * Math.PI / 3;
            const x = Math.cos(a) * radio, y = Math.sin(a) * radio;
            i ? forma.lineTo(x, y) : forma.moveTo(x, y);
        }
        const bisel = radio * .09;
        const geo = new THREE.ExtrudeGeometry(forma, {
            depth: Math.max(.001, ancho - bisel * 2), bevelEnabled: true,
            bevelThickness: bisel, bevelSize: bisel, bevelSegments: 5, curveSegments: 1
        });
        geo.center();
        geo.rotateY(Math.PI / 2);
        return geo;
    });
}

// Mancuerna hexagonal. El eje del agarre queda sobre X.
export function mancuerna({ radio = .075, ancho = .065, agarre = .13, banda = false, logo = false } = {}) {
    const M = materiales();
    const g = grupo();
    const collar = .018;
    const centro = agarre / 2 + collar + ancho / 2;
    g.add(malla(new THREE.CylinderGeometry(.0165, .0165, agarre + .01, 28), M.cromoMoleteadoCorto, 0, 0, 0, 0, 0, Math.PI / 2));
    const geoCollar = enCache("collar", () => new THREE.LatheGeometry(perfil([[.0001, 0], [.022, 0], [.022, .006], [.03, .012], [.03, collar], [.0001, collar]], .002), 32));
    for (const lado of [-1, 1]) {
        const c = malla(geoCollar, M.cromo, lado * agarre / 2, 0, 0, 0, 0, lado * -Math.PI / 2);
        g.add(c);
        g.add(malla(geoHexagono(radio, ancho), M.caucho, lado * centro, 0, 0));
        if (banda) {
            g.add(malla(geoHexagono(radio * 1.012, ancho * .14), M.rojo, lado * (centro - ancho * .18), 0, 0));
        }
        if (logo) {
            const tapa = new THREE.Mesh(
                new THREE.CircleGeometry(radio * .58, 64),
                new THREE.MeshStandardMaterial({ map: T.tapaLogo(), metalness: .85, roughness: .22 })
            );
            tapa.position.x = lado * (centro + ancho / 2 + .0008);
            tapa.rotation.y = lado * Math.PI / 2;
            g.add(tapa);
        }
    }
    g.userData.largo = (centro + ancho / 2) * 2;
    return g;
}

function geoDisco(R, t) {
    return enCache(`disco${R}-${t}`, () => {
        const h = t / 2, ri = .0262, hub = .07;
        const pts = perfil([
            [ri, 0], [ri, -h], [hub, -h], [hub + .008, -h * .72], [R - .032, -h * .72], [R - .014, -h],
            [R, -h], [R, h], [R - .014, h], [R - .032, h * .72], [hub + .008, h * .72], [hub, h], [ri, h], [ri, 0]
        ], .0045);
        const geo = new THREE.LatheGeometry(pts, 72);
        geo.rotateZ(-Math.PI / 2);
        return geo;
    });
}

// Disco bumper con inserto metálico. Eje sobre X.
export function disco({ R = .225, t = .055, rojo = false } = {}) {
    const M = materiales();
    return grupo(
        malla(geoDisco(R, t), rojo ? M.cauchoRojo : M.caucho),
        malla(enCache("inserto" + t, () => new THREE.CylinderGeometry(.062, .062, t * .76, 40, 1, true)), M.cromo, 0, 0, 0, 0, 0, Math.PI / 2)
    );
}

// Barra olímpica con discos. `discos` es la carga de cada lado, de adentro hacia afuera.
export function barraOlimpica(discos = []) {
    const M = materiales();
    const g = grupo(
        malla(new THREE.CylinderGeometry(.014, .014, 1.31, 24), M.cromoMoleteado, 0, 0, 0, 0, 0, Math.PI / 2)
    );
    for (const lado of [-1, 1]) {
        g.add(malla(new THREE.CylinderGeometry(.034, .034, .028, 32), M.cromo, lado * .669, 0, 0, 0, 0, Math.PI / 2));
        g.add(malla(new THREE.CylinderGeometry(.025, .025, .415, 32), M.cromo, lado * .8905, 0, 0, 0, 0, Math.PI / 2));
        let x = .688;
        discos.forEach((d) => {
            const t = d.t ?? .055;
            const p = disco(d);
            p.position.x = lado * (x + t / 2);
            g.add(p);
            x += t + .003;
        });
        if (discos.length) g.add(malla(new THREE.TorusGeometry(.03, .012, 12, 32), M.rojo, lado * (x + .012), 0, 0, 0, Math.PI / 2, 0));
    }
    return g;
}

// ---------- equipos ----------

export function rackPotencia() {
    const M = materiales();
    const W = 1.22, D = 1.2, H = 2.3, s = .075;
    const g = grupo();
    for (const x of [-W / 2, W / 2]) {
        for (const z of [-D / 2, D / 2]) g.add(caja(s, H, s, M.aceroPerforado, x, H / 2, z, .01));
        g.add(viga([x, H - .04, -D / 2], [x, H - .04, D / 2], s, M.acero));
        g.add(viga([x, .04, -D / 2 - .18], [x, .04, D / 2 + .18], s, M.acero));
        // Ganchos J y barras de seguridad
        g.add(caja(.09, .06, .13, M.rojo, x, 1.36, D / 2 + .08, .012));
        g.add(caja(.09, .09, .022, M.rojo, x, 1.405, D / 2 + .135, .008));
        g.add(viga([x * .9, .82, -D / 2 - .06], [x * .9, .82, D / 2 + .32], .055, M.rojo));
    }
    for (const z of [-D / 2, D / 2]) g.add(viga([-W / 2, H - .04, z], [W / 2, H - .04, z], s, M.acero));
    g.add(viga([-W / 2, .04, -D / 2], [W / 2, .04, -D / 2], s, M.acero));
    g.add(barra([-W / 2 - .12, H - .14, D / 2 + .14], [W / 2 + .12, H - .14, D / 2 + .14], .016, M.cromoMoleteado));
    for (const x of [-W / 2, W / 2]) g.add(viga([x, H - .14, D / 2], [x, H - .14, D / 2 + .16], .05, M.acero));
    // Cuernos traseros con discos guardados
    for (const x of [-W / 2, W / 2]) {
        g.add(barra([x, .5, -D / 2], [x * 1.35, .5, -D / 2], .025, M.cromo));
        const d = disco({ R: .225, t: .06, rojo: x > 0 });
        d.position.set(x * 1.31, .5, -D / 2);
        g.add(d);
    }
    const b = barraOlimpica([{ rojo: true }, { rojo: true }, { R: .2, t: .04 }]);
    b.position.set(0, 1.43, D / 2 + .08);
    g.add(b);
    return g;
}

export function banco() {
    const M = materiales();
    return grupo(
        caja(.3, .075, 1.18, M.tapiz, 0, .45, 0, .03),
        caja(.304, .012, 1.184, M.rojo, 0, .408, 0, .005),
        viga([0, .36, -.5], [0, .36, .52], .065, M.acero),
        viga([0, .04, .5], [0, .38, .5], .06, M.acero),
        viga([-.25, .035, .5], [.25, .035, .5], .06, M.acero),
        viga([0, .04, -.48], [0, .38, -.48], .06, M.acero),
        viga([-.23, .035, -.48], [.23, .035, -.48], .06, M.acero),
        caja(.06, .035, .07, M.caucho, -.27, .02, .5), caja(.06, .035, .07, M.caucho, .27, .02, .5)
    );
}

export function estacionPress() {
    const M = materiales();
    const g = banco();
    for (const x of [-.56, .56]) {
        g.add(viga([x, 0, -.6], [x, 1.18, -.6], .07, M.acero));
        g.add(viga([x, .035, -.86], [x, .035, -.3], .065, M.acero));
        g.add(caja(.085, .05, .12, M.rojo, x, 1.04, -.53, .012));
        g.add(caja(.085, .08, .02, M.rojo, x, 1.08, -.48, .008));
    }
    g.add(viga([-.56, .5, -.6], [.56, .5, -.6], .06, M.acero));
    const b = barraOlimpica([{ rojo: true }, { R: .2, t: .04 }]);
    b.position.set(0, 1.105, -.53);
    g.add(b);
    return g;
}

export function rackMancuernas() {
    const M = materiales();
    const g = grupo();
    const L = 2.5;
    for (const x of [-L / 2, L / 2]) {
        g.add(caja(.05, .86, .62, M.acero, x, .43, 0, .015));
        g.add(caja(.052, .05, .64, M.rojo, x, .86, 0, .012));
    }
    const niveles = [
        { y: .34, tallas: 6, base: .074 },
        { y: .74, tallas: 6, base: .05 }
    ];
    niveles.forEach(({ y, tallas, base }, nivel) => {
        for (const z of [-.13, .13]) g.add(viga([-L / 2, y + (z > 0 ? -.03 : .03), z], [L / 2, y + (z > 0 ? -.03 : .03), z], .045, M.acero));
        let x = -L / 2 + .1;
        for (let i = 0; i < tallas; i++) {
            const radio = base + i * .0055;
            const ancho = .055 + i * .005 + nivel * -.012;
            for (let p = 0; p < 2; p++) {
                const m = mancuerna({ radio, ancho, banda: i % 2 === 0 });
                m.rotation.set(Math.atan2(.06, .26), Math.PI / 2, 0);
                x += radio;
                m.position.set(x, y + radio * .9, 0);
                x += radio + .012;
                g.add(m);
            }
            x += .02;
        }
    });
    return g;
}

export function poleaAlta() {
    const M = materiales();
    const g = grupo();
    g.add(viga([0, .045, -.85], [0, .045, .8], .09, M.acero));
    g.add(viga([-.38, .04, -.85], [.38, .04, -.85], .08, M.acero));
    g.add(viga([-.3, .04, .8], [.3, .04, .8], .07, M.acero));
    for (const x of [-.3, .3]) g.add(viga([x, 0, -.66], [x, 2.28, -.66], .08, M.acero));
    g.add(viga([-.34, 2.27, -.66], [.34, 2.27, -.66], .08, M.acero));
    g.add(viga([0, 2.27, -.66], [0, 2.27, .46], .08, M.acero));
    // Pila de pesas
    for (let i = 0; i < 14; i++) {
        g.add(caja(.44, .041, .22, i === 13 ? M.rojo : M.hierro, 0, .12 + i * .046, -.66, .006));
    }
    for (const x of [-.16, .16]) g.add(barra([x, .06, -.66], [x, 2.22, -.66], .011, M.cromo));
    g.add(barra([-.25, .44, -.66], [-.2, .44, -.66], .009, M.rojo));
    const panel = new THREE.MeshStandardMaterial({ map: T.panelMarca(), roughness: .5, metalness: .3 });
    for (const x of [-.345, .345]) g.add(caja(.022, 1.95, .34, panel, x, 1.12, -.66, .008));
    // Poleas y cable
    for (const z of [.46, -.62]) {
        g.add(malla(new THREE.TorusGeometry(.055, .014, 12, 40), M.aluminio, 0, 2.2, z, 0, Math.PI / 2, 0));
        g.add(malla(new THREE.CylinderGeometry(.045, .045, .022, 24), M.acero, 0, 2.2, z, 0, 0, Math.PI / 2));
    }
    g.add(barra([0, 2.255, -.62], [0, 2.255, .46], .005, M.caucho));
    g.add(barra([0, 2.15, .515], [0, 1.83, .46], .005, M.caucho));
    g.add(barra([0, 2.15, -.675], [0, .76, -.66], .005, M.caucho));
    // Barra de jalón
    g.add(tubo([[-.64, 1.64, .46], [-.55, 1.74, .46], [-.3, 1.79, .46], [0, 1.795, .46], [.3, 1.79, .46], [.55, 1.74, .46], [.64, 1.64, .46]], .013, M.cromo));
    for (const x of [-.6, .6]) g.add(barra([x * 1.02, 1.62, .46], [x * .9, 1.72, .46], .02, M.caucho));
    g.add(barra([0, 1.8, .46], [0, 1.84, .46], .02, M.acero));
    // Asiento y rodillos
    g.add(viga([0, .05, .45], [0, .5, .45], .07, M.acero));
    g.add(caja(.42, .075, .38, M.tapiz, 0, .53, .44, .03));
    g.add(viga([0, .5, .36], [0, .8, .25], .055, M.acero));
    for (const x of [-.13, .13]) g.add(malla(new THREE.CylinderGeometry(.06, .06, .2, 28), M.tapiz, x, .82, .25, 0, 0, Math.PI / 2));
    g.add(barra([-.23, .82, .25], [.23, .82, .25], .015, M.cromo));
    return g;
}

export function prensaPiernas() {
    const M = materiales();
    const g = grupo();
    for (const x of [-.38, .38]) g.add(viga([x, .05, -1.35], [x, .05, 1.05], .08, M.acero));
    for (const z of [-1.35, -.05, 1.05]) g.add(viga([-.42, .05, z], [.42, .05, z], .07, M.acero));
    const inicio = new THREE.Vector3(0, .42, -.05), fin = new THREE.Vector3(0, 1.72, -1.35);
    for (const x of [-.3, .3]) {
        g.add(viga([x, inicio.y, inicio.z], [x, fin.y, fin.z], .085, M.acero));
        g.add(viga([x, .05, fin.z], [x, fin.y, fin.z], .08, M.acero));
        g.add(viga([x, .05, inicio.z], [x, inicio.y, inicio.z], .08, M.acero));
    }
    // Carro con plataforma
    const p = inicio.clone().lerp(fin, .4);
    const carro = grupo(
        caja(.72, .08, .52, M.acero, 0, 0, 0, .02),
        caja(.82, .045, .66, M.aluminio, 0, .03, 0, .012),
        caja(.84, .018, .68, M.rojo, 0, .0, 0, .006)
    );
    carro.position.copy(p).add(new THREE.Vector3(0, .05, .05));
    carro.rotation.x = Math.PI / 4;
    const plato = caja(.84, .045, .66, M.aluminio, 0, 0, 0, .012);
    plato.position.copy(p).add(new THREE.Vector3(0, -.1, .2));
    plato.rotation.x = -Math.PI / 4;
    const bordePlato = caja(.86, .02, .68, M.rojo, 0, 0, 0, .006);
    bordePlato.position.copy(plato.position).add(new THREE.Vector3(0, .02, -.02));
    bordePlato.rotation.x = -Math.PI / 4;
    g.add(carro, plato, bordePlato);
    for (const lado of [-1, 1]) {
        const base = p.clone().add(new THREE.Vector3(0, .08, -.02));
        g.add(barra([lado * .36, base.y, base.z], [lado * .66, base.y, base.z], .025, M.cromo));
        [.225, .225, .2].forEach((R, i) => {
            const d = disco({ R, t: .05, rojo: i === 0 });
            d.position.set(lado * (.42 + i * .055), base.y, base.z);
            g.add(d);
        });
    }
    // Asiento reclinado
    g.add(viga([0, .05, .5], [0, .4, .55], .07, M.acero));
    g.add(viga([0, .05, 1.0], [0, .62, .92], .07, M.acero));
    const asiento = caja(.52, .075, .44, M.tapiz, 0, .46, .52, .03);
    asiento.rotation.x = -.18;
    const respaldo = caja(.52, .075, .78, M.tapiz, 0, .8, .98, .03);
    respaldo.rotation.x = -.72;
    g.add(asiento, respaldo);
    for (const x of [-.34, .34]) {
        g.add(barra([x, .52, .62], [x, .52, .3], .015, M.cromo));
        g.add(barra([x, .52, .42], [x, .52, .3], .022, M.caucho));
        g.add(viga([x, .05, .62], [x, .52, .62], .04, M.acero));
    }
    return g;
}

export function caminadora() {
    const M = materiales();
    const banda = T.bandaCaminadora();
    const g = grupo(
        caja(.88, .15, 1.95, M.plastico, 0, .12, 0, .045),
        caja(.1, .04, 1.72, M.aluminio, -.38, .205, .05, .015),
        caja(.1, .04, 1.72, M.aluminio, .38, .205, .05, .015),
        caja(.88, .26, .4, M.plastico, 0, .22, -.95, .06),
        caja(.89, .028, .41, M.rojo, 0, .31, -.95, .01)
    );
    const cinta = malla(new THREE.PlaneGeometry(.62, 1.72), new THREE.MeshStandardMaterial({ map: banda, roughness: .85 }), 0, .2, .05, -Math.PI / 2);
    g.add(cinta);
    for (const x of [-.4, .4]) {
        g.add(viga([x, .3, -.98], [x * .92, 1.2, -.74], .07, M.plastico));
        g.add(barra([x * 1.03, 1.08, -.72], [x * 1.05, 1.02, -.28], .019, M.caucho));
    }
    const consola = grupo(caja(.86, .34, .1, M.plastico, 0, 0, 0, .035));
    const pantalla = new THREE.Mesh(
        new THREE.PlaneGeometry(.5, .25),
        new THREE.MeshBasicMaterial({ map: T.pantalla(["VELOCIDAD", "8.5", "km/h  ·  12% inclinación"]), toneMapped: false, color: new THREE.Color(1.25, 1.25, 1.25) })
    );
    pantalla.position.z = .052;
    consola.add(pantalla);
    consola.position.set(0, 1.28, -.68);
    consola.rotation.x = -.45;
    g.add(consola);
    g.userData.animar = (dt) => { banda.offset.y += dt * .9; };
    return g;
}

export function bicicleta() {
    const M = materiales();
    const g = grupo();
    for (const z of [.5, -.5]) {
        g.add(viga([-.3, .04, z], [.3, .04, z], .07, M.acero));
        for (const x of [-.3, .3]) g.add(caja(.07, .03, .08, M.caucho, x, .015, z));
    }
    g.add(viga([0, .07, .5], [0, .36, -.32], .075, M.acero));
    g.add(viga([0, .07, -.5], [0, .3, -.36], .07, M.acero));
    g.add(viga([0, .3, .2], [0, .88, .32], .055, M.rojo));
    g.add(viga([0, .34, -.38], [0, 1.02, -.48], .06, M.acero));
    const volante = grupo(
        malla(new THREE.CylinderGeometry(.24, .24, .045, 56), M.cromo, 0, 0, 0, 0, 0, Math.PI / 2),
        malla(new THREE.TorusGeometry(.24, .012, 10, 64), M.rojo, 0, 0, 0, 0, Math.PI / 2, 0),
        malla(new THREE.CylinderGeometry(.05, .05, .07, 24), M.acero, 0, 0, 0, 0, 0, Math.PI / 2)
    );
    volante.position.set(0, .42, -.36);
    g.add(volante);
    const biela = grupo(
        malla(new THREE.CylinderGeometry(.08, .08, .03, 32), M.aluminio, 0, 0, 0, 0, 0, Math.PI / 2),
        caja(.025, .17, .03, M.aluminio, .05, -.07, 0, .008), caja(.025, .17, .03, M.aluminio, -.05, .07, 0, .008),
        caja(.1, .025, .06, M.caucho, .1, -.15, 0, .008), caja(.1, .025, .06, M.caucho, -.1, .15, 0, .008)
    );
    biela.position.set(0, .4, -.02);
    g.add(biela);
    const sillin = malla(new THREE.SphereGeometry(1, 32, 16), M.tapiz, 0, .91, .33);
    sillin.scale.set(.11, .035, .15);
    g.add(sillin);
    g.add(tubo([[-.25, 1.08, -.36], [-.23, 1.04, -.47], [0, 1.02, -.5], [.23, 1.04, -.47], [.25, 1.08, -.36]], .018, M.caucho));
    const consola = caja(.2, .12, .05, M.plastico, 0, 1.14, -.5, .015);
    consola.rotation.x = -.5;
    const pantalla = new THREE.Mesh(new THREE.PlaneGeometry(.17, .085), new THREE.MeshBasicMaterial({ map: T.pantalla(["RPM", "92", "ritmo constante"]), toneMapped: false }));
    pantalla.position.z = .027;
    consola.add(pantalla);
    g.add(consola);
    g.userData.animar = (dt) => { volante.rotation.x -= dt * 6; biela.rotation.x -= dt * 2.2; };
    return g;
}

function geoPesaRusa() {
    return enCache("pesaRusa", () => {
        const pts = [[.0001, 0], [.066, 0]];
        for (let a = -55; a <= 90; a += 7.25) {
            const r = THREE.MathUtils.degToRad(a);
            pts.push([Math.max(.0001, .115 * Math.cos(r)), .1002 + .1 * Math.sin(r)]);
        }
        return new THREE.LatheGeometry(perfil(pts, .006), 56);
    });
}

export function pesaRusa(escala = 1, rojo = false) {
    const M = materiales();
    const mat = rojo ? M.rojo : M.hierro;
    const g = grupo(
        malla(geoPesaRusa(), mat),
        tubo([[-.07, .16, 0], [-.088, .235, 0], [-.07, .3, 0], [0, .322, 0], [.07, .3, 0], [.088, .235, 0], [.07, .16, 0]], .017, mat, 48)
    );
    g.scale.setScalar(escala);
    return g;
}

export function zonaPesasRusas() {
    const g = grupo();
    [.8, .88, .96, 1.04, 1.12, 1.2].forEach((e, i) => {
        const k = pesaRusa(e, i % 2 === 1);
        k.position.set(i * .38, 0, 0);
        k.rotation.y = i * .35;
        g.add(k);
    });
    const M = materiales();
    for (let i = 0; i < 3; i++) {
        const balon = grupo(malla(new THREE.SphereGeometry(.16, 40, 28), M.caucho));
        for (const r of [0, Math.PI / 2]) balon.add(malla(new THREE.TorusGeometry(.161, .006, 8, 64), M.cauchoRojo, 0, 0, 0, 0, r, 0));
        balon.position.set(.3 + i * .42, .16, .75);
        balon.rotation.set(i, i * 2, 0);
        g.add(balon);
    }
    return g;
}

export function cuerdasBatalla() {
    const M = materiales();
    const g = grupo(
        caja(.36, .04, .36, M.acero, 0, .02, 0, .01),
        viga([0, .04, 0], [0, .4, 0], .08, M.acero),
        malla(new THREE.TorusGeometry(.07, .014, 10, 32), M.cromo, 0, .36, .07)
    );
    for (const lado of [-1, 1]) {
        const pts = [[0, .36, .1]];
        for (let i = 1; i <= 18; i++) {
            const z = .1 + i * .19;
            pts.push([lado * (.05 + .3 * i / 18) + Math.sin(i * 1.1 + lado) * .16 * Math.min(1, i / 4), .03 + (i < 2 ? .2 : 0), z]);
        }
        g.add(tubo(pts, .019, M.cuerda, 220));
        const fin = pts.at(-1);
        g.add(barra([fin[0], .03, fin[2] - .02], [fin[0], .03, fin[2] + .2], .024, M.cauchoRojo));
    }
    return g;
}

export function cajones() {
    const M = materiales();
    const g = grupo();
    [.3, .45, .6].forEach((h, i) => {
        g.add(caja(.76, h, .6, M.espuma, 0, h / 2, i * .78, .05));
        g.add(caja(.765, .02, .605, M.rojo, 0, h - .03, i * .78, .008));
    });
    return g;
}

// Árbol de discos con cargas de distintos tamaños.
export function arbolDiscos() {
    const M = materiales();
    const g = grupo(
        caja(.7, .05, .7, M.acero, 0, .025, 0, .01),
        viga([0, .04, 0], [0, 1.3, 0], .07, M.acero)
    );
    [[.95, .225, true], [.95, .225, false], [.6, .2, false], [.6, .2, true], [.3, .16, false], [.3, .16, false]].forEach(([y, R, rojo], i) => {
        const lado = i % 2 ? 1 : -1;
        g.add(barra([0, y, 0], [lado * .26, y + .04, 0], .022, M.cromo));
        [0, 1].forEach((n) => {
            const d = disco({ R, t: .05, rojo });
            d.position.set(lado * (.08 + n * .056), y + .01, 0);
            g.add(d);
        });
    });
    return g;
}
