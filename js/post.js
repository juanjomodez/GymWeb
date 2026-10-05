// Pase final de imagen: viñeta, grano, aberración cromática y el "velo" de transición
// hacia las secciones 2D (barrido diagonal de luz que oscurece y desenfoca la escena).
import * as THREE from "three";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

// La línea del barrido sigue la misma recta que el clip-path de las secciones 2D:
// x = 1.4·v − 0.4·(distancia desde arriba). Ver `bordeBarrido` en experiencia.js.
const AcabadoShader = {
    uniforms: {
        tDiffuse: { value: null },
        uVelo: { value: 0 },
        uBarrido: { value: 0 },
        uTiempo: { value: 0 },
        uResolucion: { value: new THREE.Vector2(1, 1) },
        uGrano: { value: .035 },
        uVineta: { value: .55 }
    },
    vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse;
        uniform float uVelo;
        uniform float uBarrido;
        uniform float uTiempo;
        uniform vec2 uResolucion;
        uniform float uGrano;
        uniform float uVineta;
        varying vec2 vUv;

        float azar(vec2 p) {
            return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        }

        // textureLod evita derivadas dentro del bucle (avisos y artefactos en D3D).
        vec3 muestra(vec2 uv, float radio) {
            vec2 escala = vec2(uResolucion.y / uResolucion.x, 1.0) * radio;
            vec3 suma = textureLod(tDiffuse, uv, 0.0).rgb * 2.0;
            for (int i = 0; i < 10; i++) {
                float a = float(i) * .6283185;
                float r = (i < 5) ? 1.0 : .5;
                suma += textureLod(tDiffuse, uv + vec2(cos(a + r), sin(a + r)) * escala * r, 0.0).rgb;
            }
            return suma / 12.0;
        }

        void main() {
            vec2 centro = vUv - .5;
            // Zona ya cubierta por la sección 2D: a la izquierda de la línea del barrido.
            float borde = 1.4 * uBarrido - .4 * (1.0 - vUv.y);
            float d = vUv.x - borde;
            float cubierto = smoothstep(.04, -.04, d) * step(.001, uBarrido);
            float velo = max(uVelo * .35, cubierto * uVelo);

            float radio = velo * 9.0 / uResolucion.y;
            vec2 desvio = centro * (.0012 + velo * .006);
            vec3 col;
            if (radio > .00001) {
                col = muestra(vUv, radio);
                col.r = mix(col.r, muestra(vUv + desvio, radio).r, .85);
                col.b = mix(col.b, muestra(vUv - desvio, radio).b, .85);
            } else {
                // Aberración cromática leve hacia los bordes
                col = textureLod(tDiffuse, vUv, 0.0).rgb;
                col.r = textureLod(tDiffuse, vUv + desvio, 0.0).r;
                col.b = textureLod(tDiffuse, vUv - desvio, 0.0).b;
            }

            float gris = dot(col, vec3(.299, .587, .114));
            col = mix(col, vec3(gris), velo * .55);
            col *= 1.0 - velo * .6;

            // Línea de luz roja del barrido
            float enCurso = step(.001, uBarrido) * step(uBarrido, .999);
            float linea = exp(-pow(d * 55.0, 2.0)) * enCurso;
            float halo = exp(-pow(d * 9.0, 2.0)) * enCurso;
            col += vec3(1.0, .1, .14) * (linea * 1.4 + halo * .18);

            float v = smoothstep(.95, .2, length(centro * vec2(1.0, .9)));
            col *= mix(1.0, v, uVineta);
            col += (azar(vUv * uResolucion + fract(uTiempo) * 97.0) - .5) * uGrano;
            gl_FragColor = vec4(col, 1.0);
        }
    `
};

export function crearAcabado() {
    return new ShaderPass(AcabadoShader);
}
