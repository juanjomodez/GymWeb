// Texturas procedurales generadas con canvas: no requieren descargar imágenes.
import * as THREE from "three";

function lienzo(ancho, alto = ancho) {
    const canvas = document.createElement("canvas");
    canvas.width = ancho;
    canvas.height = alto;
    return [canvas, canvas.getContext("2d")];
}

function textura(canvas, { repetir = [1, 1], color = true, anisotropia = 8 } = {}) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(...repetir);
    tex.anisotropy = anisotropia;
    if (color) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function ruido(ctx, ancho, alto, cantidad, tono, alfa) {
    for (let i = 0; i < cantidad; i++) {
        const v = tono + (Math.random() - .5) * 40;
        ctx.fillStyle = `rgba(${v},${v},${v},${alfa * Math.random()})`;
        ctx.fillRect(Math.random() * ancho, Math.random() * alto, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
}

// Moleteado en diamante de las barras (se usa como bumpMap).
export function moleteado() {
    const [canvas, ctx] = lienzo(128);
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = "#1c1c1c";
    ctx.lineWidth = 3;
    for (let i = -128; i <= 256; i += 16) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 128, 128); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(i, 128); ctx.lineTo(i + 128, 0); ctx.stroke();
    }
    return textura(canvas, { repetir: [6, 1], color: false });
}

// Piso de caucho en baldosas con motas, como el de un gimnasio.
export function pisoCaucho() {
    const [canvas, ctx] = lienzo(512);
    ctx.fillStyle = "#18181b";
    ctx.fillRect(0, 0, 512, 512);
    ruido(ctx, 512, 512, 9000, 70, .55);
    ruido(ctx, 512, 512, 1600, 150, .25);
    ctx.strokeStyle = "rgba(0,0,0,.85)";
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, 512, 512);
    ctx.strokeStyle = "rgba(255,255,255,.035)";
    ctx.lineWidth = 1;
    ctx.strokeRect(3, 3, 506, 506);
    return textura(canvas, { repetir: [36, 44] });
}

// Plataforma de levantamiento: madera al centro y caucho a los lados.
export function plataforma() {
    const [canvas, ctx] = lienzo(512);
    ctx.fillStyle = "#121214";
    ctx.fillRect(0, 0, 512, 512);
    ruido(ctx, 512, 512, 5000, 60, .5);
    const madera = ctx.createLinearGradient(128, 0, 384, 0);
    madera.addColorStop(0, "#6b4528");
    madera.addColorStop(.5, "#8a5a35");
    madera.addColorStop(1, "#6b4528");
    ctx.fillStyle = madera;
    ctx.fillRect(128, 0, 256, 512);
    for (let i = 0; i < 70; i++) {
        ctx.strokeStyle = `rgba(40,20,8,${.15 + Math.random() * .25})`;
        ctx.lineWidth = 1 + Math.random() * 2;
        const x = 128 + Math.random() * 256;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.bezierCurveTo(x + 8, 170, x - 8, 340, x + 4, 512);
        ctx.stroke();
    }
    ctx.strokeStyle = "rgba(0,0,0,.5)";
    for (let x = 128; x <= 384; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke(); }
    ctx.fillStyle = "rgba(237,28,36,.9)";
    ctx.font = "800 34px Inter, Segoe UI, Arial";
    ctx.textAlign = "center";
    ctx.save();
    ctx.translate(256, 256);
    ctx.fillText("GYMFLOW", 0, 12);
    ctx.restore();
    return textura(canvas);
}

// Césped artificial para la zona funcional, con líneas de sprint.
export function cesped() {
    const [canvas, ctx] = lienzo(512, 1024);
    ctx.fillStyle = "#1d211f";
    ctx.fillRect(0, 0, 512, 1024);
    for (let i = 0; i < 26000; i++) {
        const v = 30 + Math.random() * 30;
        ctx.fillStyle = `rgba(${v},${v + 8},${v + 2},.8)`;
        ctx.fillRect(Math.random() * 512, Math.random() * 1024, 1, 3);
    }
    ctx.fillStyle = "rgba(220,220,220,.32)";
    ctx.fillRect(24, 0, 8, 1024);
    ctx.fillRect(480, 0, 8, 1024);
    for (let y = 120; y < 1024; y += 200) ctx.fillRect(24, y, 464, 6);
    ctx.fillStyle = "rgba(237,28,36,.55)";
    ctx.font = "900 64px Inter, Segoe UI, Arial";
    ctx.textAlign = "center";
    ctx.fillText("GYMFLOW", 256, 560);
    return textura(canvas);
}

// Concreto oscuro para muros.
export function concreto() {
    const [canvas, ctx] = lienzo(512);
    ctx.fillStyle = "#1a1a1d";
    ctx.fillRect(0, 0, 512, 512);
    ruido(ctx, 512, 512, 14000, 45, .35);
    for (let i = 0; i < 40; i++) {
        const g = ctx.createRadialGradient(Math.random() * 512, Math.random() * 512, 0, Math.random() * 512, Math.random() * 512, 80 + Math.random() * 120);
        g.addColorStop(0, "rgba(255,255,255,.025)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 512, 512);
    }
    return textura(canvas, { repetir: [8, 2] });
}

// Perforaciones de los parales del rack (mapa de color).
export function perforaciones() {
    const [canvas, ctx] = lienzo(64, 512);
    ctx.fillStyle = "#1d1d20";
    ctx.fillRect(0, 0, 64, 512);
    ruido(ctx, 64, 512, 600, 60, .3);
    for (let y = 16; y < 512; y += 32) {
        ctx.fillStyle = "#020202";
        ctx.beginPath();
        ctx.arc(32, y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.18)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }
    return textura(canvas);
}

// Tapizado con relieve de cuero sintético (bumpMap).
export function tapizado() {
    const [canvas, ctx] = lienzo(256);
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 9000; i++) {
        const v = 100 + Math.random() * 60;
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.beginPath();
        ctx.arc(Math.random() * 256, Math.random() * 256, Math.random() * 1.6, 0, Math.PI * 2);
        ctx.fill();
    }
    return textura(canvas, { repetir: [4, 4], color: false });
}

// Banda de la caminadora: listones que se desplazan al animar el offset.
export function bandaCaminadora() {
    const [canvas, ctx] = lienzo(64, 256);
    ctx.fillStyle = "#0f0f10";
    ctx.fillRect(0, 0, 64, 256);
    ruido(ctx, 64, 256, 1400, 45, .5);
    ctx.fillStyle = "rgba(255,255,255,.06)";
    for (let y = 0; y < 256; y += 16) ctx.fillRect(0, y, 64, 2);
    return textura(canvas, { repetir: [1, 6] });
}

// Pantalla de consola (cardio) con métricas.
export function pantalla(lineas, acento = "#ff343b") {
    const [canvas, ctx] = lienzo(512, 256);
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "#09090b");
    g.addColorStop(1, "#160608");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 256);
    ctx.strokeStyle = "rgba(255,52,59,.35)";
    ctx.lineWidth = 2;
    for (let x = 0; x < 512; x += 32) { ctx.beginPath(); ctx.moveTo(x, 200); ctx.lineTo(x, 236); ctx.stroke(); }
    ctx.fillStyle = acento;
    ctx.font = "800 26px Inter, Segoe UI, Arial";
    ctx.fillText(lineas[0], 28, 48);
    ctx.font = "900 88px Inter, Segoe UI, Arial";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(lineas[1], 28, 150);
    ctx.font = "700 24px Inter, Segoe UI, Arial";
    ctx.fillStyle = "#aaa7a7";
    ctx.fillText(lineas[2], 28, 190);
    // Barras de intensidad
    for (let i = 0; i < 12; i++) {
        ctx.fillStyle = i < 8 ? acento : "rgba(255,255,255,.12)";
        const h = 16 + i * 6;
        ctx.fillRect(330 + i * 14, 180 - h, 9, h);
    }
    return textura(canvas, { repetir: [1, 1] });
}

// Letrero de neón con resplandor.
export function neon(texto, { color = "#ff2a33", ancho = 1024, alto = 256, tamano = 150 } = {}) {
    const [canvas, ctx] = lienzo(ancho, alto);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 ${tamano}px Inter, Segoe UI, Arial`;
    ctx.shadowColor = color;
    for (const blur of [60, 30, 12]) {
        ctx.shadowBlur = blur;
        ctx.fillStyle = color;
        ctx.fillText(texto, ancho / 2, alto / 2);
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffe4e5";
    ctx.fillText(texto, ancho / 2, alto / 2);
    const tex = textura(canvas);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
}

// Fibras musculares (bumpMap): líneas que corren de polo a polo de la esfera.
export function fibras() {
    const [canvas, ctx] = lienzo(256, 64);
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, 256, 64);
    for (let x = 0; x < 256; x += 3) {
        const v = 90 + Math.random() * 80;
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(x, 0, 1.5, 64);
    }
    return textura(canvas, { color: false });
}

// Degradado radial para halos de luz en el piso.
export function halo() {
    const [canvas, ctx] = lienzo(256);
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(.45, "rgba(255,255,255,.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const tex = textura(canvas);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
}

// Logo grabado en la tapa de la mancuerna.
export function tapaLogo() {
    const [canvas, ctx] = lienzo(256);
    const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
    g.addColorStop(0, "#d9d9dc");
    g.addColorStop(1, "#8d8d92");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = "rgba(0,0,0,.25)";
    for (let r = 20; r < 128; r += 3) { ctx.beginPath(); ctx.arc(128, 128, r, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = "#ed1c24";
    ctx.beginPath(); ctx.arc(128, 128, 84, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "900 92px Inter, Segoe UI, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("GF", 128, 134);
    const tex = textura(canvas);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
}

// Panel lateral de máquina con la marca.
export function panelMarca(texto = "GYMFLOW") {
    const [canvas, ctx] = lienzo(256, 1024);
    ctx.fillStyle = "#141416";
    ctx.fillRect(0, 0, 256, 1024);
    ruido(ctx, 256, 1024, 3000, 50, .3);
    ctx.fillStyle = "#ed1c24";
    ctx.fillRect(0, 0, 18, 1024);
    ctx.save();
    ctx.translate(150, 512);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = "#f6f4f2";
    ctx.font = "900 104px Inter, Segoe UI, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(texto, 0, 0);
    ctx.restore();
    const tex = textura(canvas);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
}

// Etiqueta envolvente para botes de suplementos.
export function etiquetaProducto({ titulo, subtitulo, fondo, acento, textoColor = "#ffffff" }) {
    const [canvas, ctx] = lienzo(1024, 512);
    ctx.fillStyle = fondo;
    ctx.fillRect(0, 0, 1024, 512);
    ruido(ctx, 1024, 512, 6000, fondo === "#f2f0ee" ? 220 : 40, .25);
    // Franja diagonal de acento
    ctx.fillStyle = acento;
    ctx.beginPath();
    ctx.moveTo(0, 380); ctx.lineTo(1024, 300); ctx.lineTo(1024, 350); ctx.lineTo(0, 430);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = .35;
    ctx.beginPath();
    ctx.moveTo(0, 440); ctx.lineTo(1024, 360); ctx.lineTo(1024, 372); ctx.lineTo(0, 452);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    // Frente centrado en u = .25 para que mire a la cámara.
    for (const centro of [256, 768]) {
        ctx.textAlign = "center";
        ctx.fillStyle = acento;
        ctx.font = "800 34px Inter, Segoe UI, Arial";
        ctx.fillText("GYMFLOW", centro, 92);
        ctx.fillStyle = textoColor;
        ctx.font = "900 92px Inter, Segoe UI, Arial";
        ctx.fillText(titulo, centro, 196);
        ctx.font = "700 32px Inter, Segoe UI, Arial";
        ctx.globalAlpha = .75;
        ctx.fillText(subtitulo, centro, 250);
        ctx.globalAlpha = 1;
    }
    return textura(canvas, { repetir: [1, 1] });
}

// Marcas de medida del shaker.
export function marcasShaker() {
    const [canvas, ctx] = lienzo(512, 512);
    ctx.clearRect(0, 0, 512, 512);
    ctx.fillStyle = "rgba(255,255,255,.9)";
    ctx.font = "700 22px Inter, Segoe UI, Arial";
    for (let i = 0; i < 6; i++) {
        const y = 440 - i * 64;
        ctx.fillRect(96, y, i % 2 ? 26 : 44, 4);
        ctx.fillText(`${(i + 1) * 100}`, 150, y + 9);
    }
    ctx.fillStyle = "#ed1c24";
    ctx.font = "900 54px Inter, Segoe UI, Arial";
    ctx.textAlign = "center";
    ctx.fillText("GYMFLOW", 384, 270);
    return textura(canvas);
}
