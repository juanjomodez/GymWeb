// Figura anatómica estilizada y visor 3D. Cada grupo muscular es una malla con
// `userData.musculo`; resaltar un ejercicio solo cambia el material de esas mallas.
// Pensado para reemplazarse más adelante por un modelo real (Z-Anatomy) con los mismos IDs.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import * as T from "./texturas.js";

export const NOMBRES_MUSCULOS = {
    pectorales: "Pectorales",
    deltoides: "Deltoides (hombros)",
    biceps: "Bíceps",
    triceps: "Tríceps",
    antebrazos: "Antebrazos",
    abdominales: "Abdominales",
    oblicuos: "Oblicuos",
    trapecio: "Trapecio",
    dorsales: "Dorsales",
    lumbares: "Zona lumbar",
    gluteos: "Glúteos",
    cuadriceps: "Cuádriceps",
    isquiotibiales: "Isquiotibiales",
    gemelos: "Gemelos"
};

const DE_ESPALDA = new Set(["triceps", "trapecio", "dorsales", "lumbares", "gluteos", "isquiotibiales", "gemelos"]);
const EJE_Y = new THREE.Vector3(0, 1, 0);

function capsula(rA, rB, largo) {
    const pts = [];
    for (let a = -90; a <= 0; a += 15) {
        const r = THREE.MathUtils.degToRad(a);
        pts.push(new THREE.Vector2(Math.max(.0001, rA * Math.cos(r)), rA * Math.sin(r)));
    }
    for (let a = 0; a <= 90; a += 15) {
        const r = THREE.MathUtils.degToRad(a);
        pts.push(new THREE.Vector2(Math.max(.0001, rB * Math.cos(r)), largo + rB * Math.sin(r)));
    }
    return new THREE.LatheGeometry(pts, 32);
}

function crearFigura() {
    const figura = new THREE.Group();
    const musculos = [];
    const fibras = T.fibras();
    // El cuerpo es un contorno holográfico (fresnel + líneas de escaneo); los músculos van sólidos dentro.
    const holograma = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(0xff4a54) }, uTiempo: { value: 0 } },
        vertexShader: /* glsl */`
            varying vec3 vNormal;
            varying vec3 vVista;
            varying float vAltura;
            void main() {
                vec4 mv = modelViewMatrix * vec4(position, 1.0);
                vNormal = normalize(normalMatrix * normal);
                vVista = normalize(-mv.xyz);
                vAltura = (modelMatrix * vec4(position, 1.0)).y;
                gl_Position = projectionMatrix * mv;
            }
        `,
        fragmentShader: /* glsl */`
            uniform vec3 uColor;
            uniform float uTiempo;
            varying vec3 vNormal;
            varying vec3 vVista;
            varying float vAltura;
            void main() {
                float borde = pow(1.0 - abs(dot(normalize(vNormal), normalize(vVista))), 2.4);
                float lineas = .6 + .4 * step(.5, fract(vAltura * 110.0));
                float barrido = smoothstep(.05, 0.0, abs(fract(uTiempo * .18) * 2.0 - vAltura));
                float alfa = borde * .9 * lineas + .035 + barrido * .35;
                gl_FragColor = vec4(uColor * (borde * 1.5 + barrido * 1.2 + .15), alfa);
            }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
    const mat = {
        base: holograma,
        reposo: new THREE.MeshPhysicalMaterial({ color: 0x3c2326, roughness: .45, clearcoat: .6, clearcoatRoughness: .3, bumpMap: fibras, bumpScale: 1.4, sheen: .6, sheenColor: 0x88444a }),
        principal: new THREE.MeshPhysicalMaterial({ color: 0xff2a33, emissive: 0xff1420, emissiveIntensity: .8, roughness: .32, clearcoat: 1, bumpMap: fibras, bumpScale: 1.4 }),
        secundario: new THREE.MeshPhysicalMaterial({ color: 0xff8a3d, emissive: 0xff5a10, emissiveIntensity: .3, roughness: .36, clearcoat: 1, bumpMap: fibras, bumpScale: 1.4 })
    };
    const esfera = new THREE.SphereGeometry(1, 40, 28);

    const parte = (geo, x = 0, y = 0, z = 0) => {
        const m = new THREE.Mesh(geo, mat.base);
        m.position.set(x, y, z);
        m.renderOrder = 2;
        figura.add(m);
        return m;
    };
    const segmento = (a, b, rA, rB) => {
        const dir = b.clone().sub(a);
        const m = parte(capsula(rA, rB, dir.length()));
        m.position.copy(a);
        m.quaternion.setFromUnitVectors(EJE_Y, dir.normalize());
    };
    const musculo = (id, pos, escala, { rot = [0, 0, 0], eje = null } = {}) => {
        const m = new THREE.Mesh(esfera, mat.reposo);
        m.position.copy(pos);
        m.scale.set(...escala);
        if (eje) m.quaternion.setFromUnitVectors(EJE_Y, eje);
        else m.rotation.set(...rot);
        m.userData.musculo = id;
        m.name = `musculo_${id}`;
        m.castShadow = true;
        figura.add(m);
        musculos.push(m);
        return m;
    };
    const v = (x, y, z) => new THREE.Vector3(x, y, z);

    // Torso por torno, aplanado en profundidad
    const torso = parte(new THREE.LatheGeometry([
        [.0001, .86], [.12, .87], [.165, .93], [.158, 1.0], [.138, 1.08], [.143, 1.16], [.163, 1.26],
        [.176, 1.36], [.18, 1.43], [.148, 1.49], [.07, 1.53], [.0001, 1.54]
    ].map(([r, y]) => new THREE.Vector2(r, y)), 48));
    torso.scale.z = .62;
    segmento(v(0, 1.5, 0), v(0, 1.62, .005), .05, .048);
    const cabeza = parte(esfera, 0, 1.71, .01);
    cabeza.scale.set(.095, .118, .105);

    for (const lado of [-1, 1]) {
        const S = v(.2 * lado, 1.42, 0), E = v(.285 * lado, 1.15, -.01), W = v(.335 * lado, .9, .03);
        const H = v(.095 * lado, .9, 0), K = v(.108 * lado, .5, .012), A = v(.112 * lado, .09, -.01);
        segmento(S, E, .046, .038);
        segmento(E, W, .037, .027);
        const mano = parte(esfera, .348 * lado, .82, .04);
        mano.scale.set(.026, .068, .043);
        segmento(H, K, .082, .052);
        segmento(K, A, .05, .033);
        const pie = parte(esfera, .115 * lado, .035, .055);
        pie.scale.set(.045, .035, .12);

        const brazo = E.clone().sub(S).normalize();
        const antebrazo = W.clone().sub(E).normalize();
        const muslo = K.clone().sub(H).normalize();
        const pierna = A.clone().sub(K).normalize();
        const en = (a, b, t, dx, dy, dz) => a.clone().lerp(b, t).add(v(dx, dy, dz));

        musculo("pectorales", v(.078 * lado, 1.35, .086), [.088, .066, .036], { rot: [0, .28 * lado, .32 * lado] });
        musculo("deltoides", v(.205 * lado, 1.41, 0), [.056, .074, .06], { rot: [0, 0, -.38 * lado] });
        musculo("biceps", en(S, E, .52, 0, 0, .028), [.031, .088, .031], { eje: brazo });
        musculo("triceps", en(S, E, .45, .004 * lado, 0, -.03), [.034, .1, .032], { eje: brazo });
        musculo("antebrazos", en(E, W, .3, 0, 0, .01), [.032, .088, .03], { eje: antebrazo });
        musculo("oblicuos", v(.118 * lado, 1.13, .045), [.034, .078, .04], { rot: [0, 0, -.12 * lado] });
        musculo("dorsales", v(.1 * lado, 1.24, -.072), [.076, .135, .03], { rot: [0, -.32 * lado, .34 * lado] });
        musculo("lumbares", v(.036 * lado, 1.05, -.078), [.03, .082, .022]);
        musculo("gluteos", v(.078 * lado, .9, -.064), [.086, .092, .066]);
        musculo("cuadriceps", en(H, K, .48, 0, 0, .042), [.06, .175, .05], { eje: muslo });
        musculo("cuadriceps", en(H, K, .84, -.026 * lado, 0, .03), [.036, .062, .034], { eje: muslo });
        musculo("isquiotibiales", en(H, K, .5, 0, 0, -.036), [.055, .165, .044], { eje: muslo });
        musculo("gemelos", en(K, A, .3, 0, 0, -.028), [.046, .105, .04], { eje: pierna });
        for (const y of [1.105, 1.17, 1.235]) musculo("abdominales", v(.031 * lado, y, .083), [.027, .028, .016]);
    }
    musculo("trapecio", v(0, 1.465, -.05), [.13, .07, .035], { rot: [.35, 0, 0] });
    musculo("trapecio", v(0, 1.33, -.092), [.06, .12, .022]);

    return { figura, musculos, mat };
}

export class VisorAnatomico {
    constructor(canvas) {
        this.canvas = canvas;
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.escena = new THREE.Scene();
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        this.escena.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
        this.escena.environmentIntensity = .45;

        this.camara = new THREE.PerspectiveCamera(30, 1, .1, 50);
        this.camara.position.set(0, 1.05, 3.6);

        const { figura, musculos, mat } = crearFigura();
        this.figura = figura;
        this.musculos = musculos;
        this.mat = mat;
        this.escena.add(figura);

        const clave = new THREE.DirectionalLight(0xffffff, 2.2);
        clave.position.set(1.5, 3, 2.5);
        clave.castShadow = true;
        clave.shadow.mapSize.set(1024, 1024);
        Object.assign(clave.shadow.camera, { left: -1, right: 1, top: 2, bottom: -.2 });
        const contra = new THREE.PointLight(0xff2a36, 10, 6, 1.5);
        contra.position.set(-1.2, 1.8, -1.4);
        const relleno = new THREE.PointLight(0x9fb4ff, 2.5, 6, 1.5);
        relleno.position.set(1.6, .6, -1.2);
        this.escena.add(clave, contra, relleno, new THREE.HemisphereLight(0xffffff, 0x220608, .5));

        const suelo = new THREE.Mesh(
            new THREE.CircleGeometry(.75, 64),
            new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: .85 })
        );
        suelo.rotation.x = -Math.PI / 2;
        suelo.receiveShadow = true;
        const anillo = new THREE.Mesh(
            new THREE.RingGeometry(.74, .755, 96),
            new THREE.MeshBasicMaterial({ color: new THREE.Color(3, .25, .3), toneMapped: false })
        );
        anillo.rotation.x = -Math.PI / 2;
        anillo.position.y = .002;
        this.escena.add(suelo, anillo);

        this.controles = new OrbitControls(this.camara, canvas);
        this.controles.target.set(0, .88, 0);
        this.controles.enablePan = false;
        this.controles.enableDamping = true;
        this.controles.minDistance = 2;
        this.controles.maxDistance = 5.2;
        this.controles.minPolarAngle = .5;
        this.controles.maxPolarAngle = 1.75;
        this.controles.autoRotate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        this.controles.autoRotateSpeed = 1.4;
        this.controles.addEventListener("start", () => { this.controles.autoRotate = false; });

        this.reloj = new THREE.Clock();
        this.activo = false;
        new ResizeObserver(() => this.ajustar()).observe(canvas);
    }

    ajustar() {
        const { clientWidth: w, clientHeight: h } = this.canvas;
        if (!w || !h) return;
        this.renderer.setSize(w, h, false);
        this.camara.aspect = w / h;
        this.camara.updateProjectionMatrix();
    }

    mostrar({ principales = [], secundarios = [] }) {
        const p = new Set(principales), s = new Set(secundarios);
        for (const m of this.musculos) {
            const id = m.userData.musculo;
            m.material = p.has(id) ? this.mat.principal : s.has(id) ? this.mat.secundario : this.mat.reposo;
        }
        const espalda = principales.filter((id) => DE_ESPALDA.has(id)).length > principales.length / 2;
        this.camara.position.set(espalda ? -1 : 1, 1.2, espalda ? -3.9 : 3.9);
        this.controles.autoRotate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        this.controles.update();
    }

    girar(lado) {
        const d = this.camara.position.distanceTo(this.controles.target);
        this.camara.position.set(0, 1.15, lado === "espalda" ? -d : d);
        this.controles.autoRotate = false;
        this.controles.update();
    }

    iniciar() {
        if (this.activo) return;
        this.activo = true;
        this.ajustar();
        this.reloj.getDelta();
        const ciclo = () => {
            if (!this.activo) return;
            const t = this.reloj.getElapsedTime();
            this.mat.principal.emissiveIntensity = .55 + Math.sin(t * 3.2) * .35;
            this.mat.base.uniforms.uTiempo.value = t;
            this.controles.update();
            this.renderer.render(this.escena, this.camara);
            requestAnimationFrame(ciclo);
        };
        requestAnimationFrame(ciclo);
    }

    detener() {
        this.activo = false;
    }
}
