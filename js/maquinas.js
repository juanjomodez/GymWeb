// Áreas del recorrido y máquinas. `plano` es el rectángulo de la zona en el piso (vista cenital). Los IDs de `musculos` coinciden con los
// nombres de malla del modelo anatómico (anatomia.js): es el contrato entre ambos.

export const AREAS = [
    {
        id: "peso-libre",
        nombre: "Peso libre",
        titulo: "Zona de peso libre",
        texto: "Racks de potencia, plataformas de levantamiento y mancuernas para construir fuerza real, a tu ritmo.",
        camara: { pos: [-4.0, 3.0, 5.4], mira: [-10.6, 0.7, -2.4] },
        plano: { x: [-17.2, -3.4], z: [-6.4, 3.6] }
    },
    {
        id: "maquinas",
        nombre: "Máquinas",
        titulo: "Máquinas guiadas",
        texto: "Trabaja cada grupo muscular con un recorrido controlado. Ideales si estás empezando o quieres aislar un músculo.",
        camara: { pos: [3.2, 2.8, 4.4], mira: [8.4, 0.8, -3.0] },
        plano: { x: [3.4, 17.2], z: [-6.4, 3.2] }
    },
    {
        id: "cardio",
        nombre: "Cardio",
        titulo: "Zona de cardio",
        texto: "Caminadoras y bicicletas con consola para medir tu progreso mientras mejoras tu resistencia.",
        camara: { pos: [-1.4, 2.5, -10.6], mira: [-7.6, 0.8, -17] },
        plano: { x: [-17.2, -1.8], z: [-22.4, -12.2] }
    },
    {
        id: "funcional",
        nombre: "Funcional",
        titulo: "Zona funcional",
        texto: "Césped, pesas rusas, cuerdas de batalla y cajones para entrenar potencia, coordinación y movilidad.",
        camara: { pos: [2.6, 3.0, -9.8], mira: [8.6, 0.4, -18] },
        plano: { x: [3.2, 17.2], z: [-25, -10.8] }
    }
];

export const MAQUINAS = [
    {
        id: "press-banca",
        area: "peso-libre",
        nombre: "Banco de press",
        ejercicio: "Press de banca",
        descripcion: "El ejercicio clásico para desarrollar fuerza y volumen en el tren superior.",
        pasos: [
            "Acuéstate con los ojos bajo la barra y los pies firmes en el piso.",
            "Agarra la barra un poco más abierto que tus hombros y sácala del soporte.",
            "Bájala controlada hasta rozar la mitad del pecho.",
            "Empuja hasta extender los brazos sin bloquear los codos."
        ],
        musculos: { principales: ["pectorales"], secundarios: ["triceps", "deltoides"] }
    },
    {
        id: "rack-sentadilla",
        area: "peso-libre",
        nombre: "Rack de potencia",
        ejercicio: "Sentadilla con barra",
        descripcion: "Movimiento base para piernas y glúteos, con barras de seguridad para entrenar con confianza.",
        pasos: [
            "Apoya la barra sobre los trapecios y sal del soporte con dos pasos.",
            "Separa los pies al ancho de los hombros, con las puntas un poco abiertas.",
            "Baja llevando la cadera atrás hasta que los muslos queden paralelos al piso.",
            "Sube empujando el piso con todo el pie y el pecho en alto."
        ],
        musculos: { principales: ["cuadriceps", "gluteos"], secundarios: ["isquiotibiales", "lumbares", "abdominales"] }
    },
    {
        id: "mancuernas",
        area: "peso-libre",
        nombre: "Rack de mancuernas",
        ejercicio: "Curl de bíceps alterno",
        descripcion: "Mancuernas hexagonales de distintos pesos para trabajar cada brazo por separado.",
        pasos: [
            "De pie, con una mancuerna en cada mano y las palmas hacia adelante.",
            "Mantén los codos pegados al cuerpo.",
            "Flexiona un brazo hasta llevar la mancuerna al hombro.",
            "Baja despacio y alterna con el otro brazo."
        ],
        musculos: { principales: ["biceps"], secundarios: ["antebrazos", "deltoides"] }
    },
    {
        id: "polea-alta",
        area: "maquinas",
        nombre: "Polea alta",
        ejercicio: "Jalón al pecho",
        descripcion: "Construye una espalda ancha con una carga regulable en la pila de pesas.",
        pasos: [
            "Ajusta el rodillo para que fije tus muslos y siéntate derecho.",
            "Toma la barra con agarre amplio y las palmas hacia adelante.",
            "Lleva la barra hacia la parte alta del pecho juntando las escápulas.",
            "Regresa lentamente hasta estirar los brazos."
        ],
        musculos: { principales: ["dorsales"], secundarios: ["biceps", "trapecio", "antebrazos"] }
    },
    {
        id: "prensa",
        area: "maquinas",
        nombre: "Prensa de piernas 45°",
        ejercicio: "Prensa de piernas",
        descripcion: "Mueve cargas altas para las piernas con la espalda apoyada y protegida.",
        pasos: [
            "Siéntate con la espalda y la cadera bien apoyadas en el respaldo.",
            "Coloca los pies en la plataforma al ancho de la cadera.",
            "Libera los seguros y baja la plataforma flexionando las rodillas.",
            "Empuja con los talones sin bloquear las rodillas al final."
        ],
        musculos: { principales: ["cuadriceps", "gluteos"], secundarios: ["isquiotibiales", "gemelos"] }
    },
    {
        id: "caminadora",
        area: "cardio",
        nombre: "Caminadora",
        ejercicio: "Carrera o caminata inclinada",
        descripcion: "Banda amortiguada con inclinación para caminar, trotar o hacer intervalos.",
        pasos: [
            "Súbete a los costados y arranca la banda a velocidad baja.",
            "Mantén el torso erguido y la mirada al frente.",
            "Aumenta velocidad o inclinación de forma gradual.",
            "Termina con dos o tres minutos de caminata suave."
        ],
        musculos: { principales: ["cuadriceps", "gemelos"], secundarios: ["isquiotibiales", "gluteos", "abdominales"] }
    },
    {
        id: "bicicleta",
        area: "cardio",
        nombre: "Bicicleta estática",
        ejercicio: "Pedaleo por intervalos",
        descripcion: "Cardio de bajo impacto, ideal para cuidar las articulaciones.",
        pasos: [
            "Ajusta el sillín a la altura de tu cadera.",
            "Pedalea con la rodilla casi extendida en el punto más bajo.",
            "Alterna 30 segundos intensos con 60 segundos suaves.",
            "Repite de 8 a 10 rondas."
        ],
        musculos: { principales: ["cuadriceps", "gemelos"], secundarios: ["isquiotibiales", "gluteos"] }
    },
    {
        id: "pesa-rusa",
        area: "funcional",
        nombre: "Pesas rusas",
        ejercicio: "Swing con pesa rusa",
        descripcion: "Potencia de cadera y acondicionamiento en un solo movimiento.",
        pasos: [
            "Párate con los pies algo más abiertos que la cadera y la pesa delante.",
            "Lleva la pesa entre las piernas inclinando el torso con la espalda recta.",
            "Extiende la cadera con fuerza para proyectarla a la altura del pecho.",
            "Deja que baje y encadena la siguiente repetición."
        ],
        musculos: { principales: ["gluteos", "isquiotibiales"], secundarios: ["lumbares", "abdominales", "deltoides"] }
    },
    {
        id: "cuerdas",
        area: "funcional",
        nombre: "Cuerdas de batalla",
        ejercicio: "Ondas alternas",
        descripcion: "Intervalos explosivos que encienden hombros, brazos y core.",
        pasos: [
            "Toma un extremo en cada mano y semiflexiona las rodillas.",
            "Sube y baja los brazos alternando para crear ondas.",
            "Mantén el core firme y la espalda neutra.",
            "Trabaja 20–30 segundos y descansa lo mismo."
        ],
        musculos: { principales: ["deltoides", "abdominales"], secundarios: ["antebrazos", "biceps", "triceps", "oblicuos"] }
    },
    {
        id: "cajon",
        area: "funcional",
        nombre: "Cajones pliométricos",
        ejercicio: "Salto al cajón",
        descripcion: "Cajones de espuma en tres alturas para entrenar potencia de piernas con seguridad.",
        pasos: [
            "Párate a un paso del cajón con los pies al ancho de la cadera.",
            "Flexiona cadera y rodillas mientras llevas los brazos atrás.",
            "Salta impulsándote con los brazos y aterriza suave con todo el pie.",
            "Extiende la cadera arriba y baja caminando."
        ],
        musculos: { principales: ["cuadriceps", "gluteos"], secundarios: ["gemelos", "isquiotibiales"] }
    }
];
