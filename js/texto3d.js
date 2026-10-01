// Texto integrado en el espacio: letras corpóreas extruidas (fuente Anton) y
// rótulos pintados sobre el piso.
import * as THREE from "three";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";

const cacheMateriales = new Map();

// Materiales típicos de letrero: frente acrílico iluminado y cantos de aluminio negro.
export function materialesLetrero({ frente = "blanco", intensidad = 1 } = {}) {
    const clave = `${frente}-${intensidad}`;
    if (cacheMateriales.has(clave)) return cacheMateriales.get(clave);
    const colores = {
        blanco: new THREE.Color(1, .98, .96),
        rojo: new THREE.Color(1, .07, .1),
        mate: new THREE.Color(.9, .89, .88)
    };
    const base = colores[frente] || colores.blanco;
    const caraFrontal = frente === "mate"
        ? new THREE.MeshStandardMaterial({ color: base, roughness: .55, metalness: .05 })
        // Acrílico retroiluminado: albedo oscuro (no refleja el HDRI) y el brillo lo da el emisivo.
        : new THREE.MeshStandardMaterial({ color: base.clone().multiplyScalar(.3), emissive: base, emissiveIntensity: intensidad, roughness: .6 });
    const canto = new THREE.MeshStandardMaterial({ color: 0x141416, metalness: .85, roughness: .35 });
    const par = [caraFrontal, canto];
    cacheMateriales.set(clave, par);
    return par;
}

// Letras extruidas. El origen queda en la base del texto (centrado, a la izquierda o a la derecha).
export function letras(fuente, texto, { tamano = 1, profundidad = .1, alinear = "centro", materiales = materialesLetrero(), sombra = true } = {}) {
    const geo = new TextGeometry(texto, {
        font: fuente,
        size: tamano,
        depth: profundidad,
        curveSegments: 5,
        bevelEnabled: true,
        bevelThickness: Math.min(.012, tamano * .015),
        bevelSize: Math.min(.008, tamano * .01),
        bevelSegments: 2
    });
    geo.computeBoundingBox();
    const b = geo.boundingBox;
    const dx = alinear === "centro" ? -(b.max.x + b.min.x) / 2 : alinear === "derecha" ? -b.max.x : -b.min.x;
    geo.translate(dx, -b.min.y, -profundidad / 2);
    const malla = new THREE.Mesh(geo, materiales);
    malla.castShadow = sombra;
    malla.receiveShadow = true;
    malla.userData.ancho = b.max.x - b.min.x;
    return malla;
}

// Rótulo pintado en el piso, legible desde la entrada y desde la vista cenital.
export function rotuloPiso(texto, { ancho = 6, alto = 1.2, color = "rgba(246,244,242,.82)", linea = true } = {}) {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = Math.round(1024 * alto / ancho);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let tamano = canvas.height * .78;
    ctx.font = `400 ${tamano}px Anton, Impact, "Arial Narrow", sans-serif`;
    while (ctx.measureText(texto).width > canvas.width * .94 && tamano > 10) {
        tamano -= 4;
        ctx.font = `400 ${tamano}px Anton, Impact, "Arial Narrow", sans-serif`;
    }
    ctx.fillText(texto, canvas.width / 2, canvas.height * .54);
    if (linea) {
        ctx.fillStyle = "rgba(237,28,36,.9)";
        ctx.fillRect(canvas.width * .06, canvas.height - 10, canvas.width * .88, 8);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const malla = new THREE.Mesh(
        new THREE.PlaneGeometry(ancho, alto),
        new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: .7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
    );
    malla.rotation.x = -Math.PI / 2;
    malla.receiveShadow = true;
    return malla;
}
