// Carga de texturas PBR, HDRI y fuente con progreso real para la pantalla de carga.
// Si un archivo falla, el material correspondiente queda sin ese mapa (no se rompe la escena).
import * as THREE from "three";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { FontLoader } from "three/addons/loaders/FontLoader.js";

const RUTA = "assets/";
const SUPERFICIES = {
    caucho: ["color", "normal", "arm"],
    concreto: ["color", "normal", "arm"],
    madera: ["color", "normal", "arm"],
    pista: ["color", "normal", "arm"],
    cuero: ["normal", "arm"],
    metal: ["normal", "arm"]
};

export function cargarRecursos(alProgresar = () => { }) {
    const gestor = new THREE.LoadingManager();
    gestor.onProgress = (_url, cargados, total) => alProgresar(cargados / total);
    const texturas = new THREE.TextureLoader(gestor);
    const recursos = { superficies: {}, hdri: null, fuente: null };

    const pendientes = [];
    for (const [nombre, mapas] of Object.entries(SUPERFICIES)) {
        recursos.superficies[nombre] = {};
        for (const mapa of mapas) {
            pendientes.push(texturas.loadAsync(`${RUTA}texturas/${nombre}_${mapa}.jpg`).then((tex) => {
                tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
                tex.anisotropy = 8;
                if (mapa === "color") tex.colorSpace = THREE.SRGBColorSpace;
                recursos.superficies[nombre][mapa] = tex;
            }).catch((e) => console.warn("Textura no disponible:", nombre, mapa, e)));
        }
    }
    pendientes.push(new RGBELoader(gestor).loadAsync(`${RUTA}hdri/gimnasio_1k.hdr`)
        .then((tex) => { tex.mapping = THREE.EquirectangularReflectionMapping; recursos.hdri = tex; })
        .catch((e) => console.warn("HDRI no disponible", e)));
    pendientes.push(new FontLoader(gestor).loadAsync(`${RUTA}fuentes/anton.json`)
        .then((f) => { recursos.fuente = f; })
        .catch((e) => console.warn("Fuente 3D no disponible", e)));

    return Promise.all(pendientes).then(() => recursos);
}

// Devuelve un juego de mapas con su propia repetición (clona las texturas compartidas).
export function mapas(recursos, nombre, repetir = [1, 1]) {
    const base = recursos?.superficies?.[nombre] || {};
    const salida = {};
    for (const [clave, tex] of Object.entries(base)) {
        const t = tex.clone();
        t.repeat.set(...repetir);
        t.needsUpdate = true;
        salida[clave] = t;
    }
    return salida;
}
