# GymFlow 3D — Evaluación de viabilidad y herramientas

Propuesta para convertir la página actual (`index.html`: inicio, planes, entrenadores,
rutinas, productos, contacto) en una experiencia 3D guiada por el scroll, con un
recorrido por las áreas del gimnasio y un visor anatómico por máquina.

---

## 1. Veredicto: ¿qué tan lograble es?

**Es lograble.** Todo lo que se pide ya se hace hoy en la web con WebGL. El reto
**no es el código, son los modelos 3D**: conseguirlos, limpiarlos, optimizarlos y
mantenerlos ligeros. Ahí se va la mayor parte del tiempo.

| Parte | Dificultad | Comentario |
|---|---|---|
| Scroll con escenas 3D que venden el gimnasio (hero, planes, CTA) | Media | Patrón muy documentado (GSAP ScrollTrigger + Three.js). |
| Productos en 3D (proteína, creatina, shaker) | Baja–media | Son formas simples (bote, cilindro); se modelan rápido en Blender. |
| Entrenadores en la experiencia | Baja | Mejor como tarjetas 2D/fotos sobre la escena. Escanear personas en 3D no compensa. |
| Recorrido por las áreas del gimnasio | Media–alta | Requiere un modelo del espacio y máquinas. Cámara sobre ruta + puntos de interés. |
| Máquinas clicables con ficha del ejercicio | Media | Raycasting + panel HTML. Sencillo una vez existen los modelos. |
| Modelo anatómico 3D resaltando músculos | **Alta** | Necesita un modelo con **cada músculo como malla separada**. Existen modelos libres (ver §4), pero pesan mucho y hay que recortarlos. |
| Animación del ejercicio sobre el cuerpo | Alta (opcional) | Lo más caro. Alternativa recomendada: video/loop corto del ejercicio + modelo anatómico con músculos resaltados. |
| Que funcione bien en móvil | Media–alta | Exige presupuesto de peso, calidad adaptativa y una versión sin 3D. |

**Conclusión práctica:** construir por fases (§7). La versión con scroll 3D,
productos y recorrido con fichas es un objetivo realista; el visor anatómico es
alcanzable empezando por **6–10 grupos musculares**, no por los ~600 músculos del cuerpo.

---

## 2. Concepto de la experiencia (de arriba a abajo)

1. **Hero** — Logo/mancuerna 3D que se arma o gira con el scroll; texto "Entrena. Mejora. Supera tus límites." y botón de inscripción siempre visible.
2. **Por qué GymFlow** — La cámara entra al gimnasio (vista exterior → recepción).
3. **Planes** — Tres "pedestales" 3D o tarjetas flotantes; al llegar al plan la cámara se detiene. CTA a `registro.html?plan=...` (ya existe).
4. **Recorrido por áreas** (sección central) — Zonas: pesas libres, máquinas, cardio, funcional. La cámara avanza por una ruta; cada zona muestra sus máquinas con puntos clicables.
5. **Ficha de máquina** — Al tocar una máquina: nombre, ejercicio, pasos, músculos principales/secundarios, y el **visor anatómico** con esos músculos resaltados.
6. **Entrenadores** — Tarjetas con fotos actuales (`img/entrenador*.jpg`) sobre la escena, asociadas a una zona del gimnasio.
7. **Productos** — Productos 3D que rotan; se integran con el carrito que ya existe en `web.js`.
8. **Contacto / CTA final** — Vuelta a la vista exterior, botón de inscripción.

El contenido HTML actual **se conserva** como capa de texto sobre el canvas: así
sigue siendo accesible, indexable y sirve de respaldo si el 3D no carga.

---

## 3. Herramientas de código

### Recomendado

| Herramienta | Uso |
|---|---|
| **Three.js** | Motor 3D (WebGL). Escenas, cámara, luces, carga de modelos, raycasting para clics. |
| **GSAP + ScrollTrigger** | Vincular el scroll a la cámara y animaciones (timelines, *pin* de secciones). Gratuito, incluidos sus plugins. |
| **Lenis** | Scroll suave, sincronizado con ScrollTrigger. |
| **Vite** | Servidor de desarrollo y empaquetado (*build*) del frontend; necesario al pasar a módulos y muchos assets. |
| **three/examples: `GLTFLoader`, `DRACOLoader`, `KTX2Loader`, `MeshoptDecoder`** | Cargar modelos comprimidos. |
| **`OutlinePass` / `EffectComposer`** (o `postprocessing`) | Contorno de la máquina seleccionada, resaltado de músculos, *bloom* sutil. |
| **lil-gui** (solo en desarrollo) | Ajustar cámara, luces y rutas en vivo. |
| **Stats.js / `renderer.info`** | Medir FPS, *draw calls* y memoria. |

**¿Por qué Three.js "vanilla" y no React Three Fiber?** El proyecto actual es HTML +
JS sin framework. Three.js puro mantiene ese estilo. R3F es excelente, pero obliga
a migrar a React. Si el equipo ya sabe React, R3F + `@react-three/drei` (que trae
`ScrollControls`, `useGLTF`, `Html`) acelera bastante: es la alternativa válida.

### Alternativa sin código: Spline

Spline permite diseñar escenas 3D visualmente y exportarlas a web. Sirve para el
hero o los productos, pero se queda corto para el recorrido con datos, el visor
anatómico y el control fino del rendimiento. Se puede usar solo para prototipar.

---

## 4. Herramientas y fuentes de assets 3D

### Edición y optimización
| Herramienta | Uso |
|---|---|
| **Blender** (gratis) | Modelar productos/espacio, limpiar modelos, nombrar mallas, hornear iluminación (*bake*), exportar a glTF/GLB. |
| **glTF-Transform** (CLI) | Comprimir: Draco/Meshopt para geometría, KTX2/WebP para texturas, eliminar datos sobrantes. |
| **gltf.report** / **glTF Viewer de Don McCurdy** | Revisar peso y estructura de un `.glb` antes de usarlo. |
| **gltfjsx** (si se usa R3F) | Convertir un GLB en componente. |

### Fuentes de modelos (revisar siempre la licencia de cada uno)
| Necesidad | Fuente |
|---|---|
| Máquinas de gimnasio, mancuernas, bancos | Sketchfab (filtrar por descargables CC), CGTrader, TurboSquid (pago), Poly Pizza / Quaternius (low-poly CC0). |
| Iluminación del entorno (HDRI) | Poly Haven (CC0). |
| Texturas de piso, paredes, metal | Poly Haven, ambientCG (CC0). |
| **Modelo anatómico con músculos separados** | **Z-Anatomy** (proyecto Blender libre, CC BY-SA 4.0) o **BodyParts3D** (CC BY-SA). Ambos exigen **atribución** y que el modelo derivado conserve la licencia. Alternativas de pago: modelos anatómicos de CGTrader/TurboSquid. |
| Personaje animado haciendo el ejercicio (opcional) | Mixamo (gratis, cuenta Adobe): personajes con animaciones; tiene algunos ejercicios. Las máquinas concretas no vienen incluidas. |

### Preparación del modelo anatómico (lo más delicado)
1. Abrir Z-Anatomy en Blender y quedarse solo con piel/silueta + músculos superficiales.
2. Agrupar músculos en **grupos útiles para el usuario**: pectoral, dorsal, deltoides, bíceps, tríceps, abdomen, glúteo, cuádriceps, isquiotibiales, gemelos.
3. Nombrar cada malla con un ID estable (`musculo_pectoral`, `musculo_dorsal`, ...).
4. Reducir polígonos (modificador *Decimate*) hasta un objetivo de **≤ 5 MB** comprimido.
5. Exportar a GLB y comprimir con glTF-Transform.

En el navegador, resaltar un músculo = buscar la malla por nombre y cambiar su
material (color de acento + emisivo) mientras el resto queda gris/translúcido.

---

## 5. Datos: cómo describir máquinas y ejercicios

Empezar con un JSON estático y, cuando funcione, moverlo a MongoDB (encaja con las
colecciones previstas en `backend/README.md`: `rutinas`, etc.).

```json
{
  "id": "press-banca",
  "nombre": "Banco de press plano",
  "area": "pesas-libres",
  "modelo": "/models/maquinas/press-banca.glb",
  "posicionCamara": [4.2, 1.6, -3.0],
  "ejercicio": {
    "nombre": "Press de banca",
    "pasos": ["Acuéstate con los pies firmes", "Baja la barra al pecho", "Empuja hasta extender los brazos"],
    "video": "/media/ejercicios/press-banca.mp4"
  },
  "musculos": {
    "principales": ["musculo_pectoral"],
    "secundarios": ["musculo_triceps", "musculo_deltoides"]
  }
}
```

Los IDs de `musculos` coinciden con los nombres de malla del modelo anatómico: es
el único contrato entre los datos y el 3D.

**Nota de backend:** Express sirve archivos públicos con una lista explícita
(`backend/src/app.js`). Habrá que añadir la carpeta de salida de Vite y las de
modelos/medios (`/models`, `/media`) con `express.static`, igual que `/img`.

---

## 6. Rendimiento, móvil y accesibilidad

**Presupuesto orientativo**
- Primera carga (hero + planes): **≤ 3 MB** de 3D.
- Recorrido completo: **≤ 15–20 MB**, cargado por zonas a medida que el usuario se acerca.
- Modelo anatómico: **≤ 5 MB**, cargado solo al abrir la primera ficha.
- Objetivo: 60 FPS en escritorio, ≥ 30 FPS en móvil de gama media.

**Técnicas**
- Iluminación horneada en Blender en lugar de luces y sombras en tiempo real.
- Instanciado (`InstancedMesh`) para objetos repetidos (mancuernas, discos).
- Limitar `devicePixelRatio` a 1.5–2 y bajar calidad automáticamente si caen los FPS.
- Carga diferida por sección y pantalla de carga con progreso (`LoadingManager`).
- Liberar memoria (`dispose()`) al salir de una zona.

**Respaldo y accesibilidad**
- Si no hay WebGL, el dispositivo es muy débil o el usuario activó `prefers-reduced-motion`: mostrar la página HTML actual (imágenes + texto), sin perder el contenido.
- Fichas de máquina como HTML real (diálogo accesible con teclado), no texto dibujado en el canvas.
- Mantener los textos en el HTML para SEO.

---

## 7. Plan por fases

Estimaciones orientativas para una persona que aprende Three.js sobre la marcha.

| Fase | Entregable | Tiempo aprox. |
|---|---|---|
| 0. Prototipo | Vite + Three.js + GSAP. Un cubo/mancuerna que se mueve con el scroll sobre el HTML actual. | 3–5 días |
| 1. Scroll 3D de venta | Hero, entrada al gimnasio, planes y CTA. Respaldo sin WebGL. | 1–2 semanas |
| 2. Productos 3D | Modelos de proteína, creatina y shaker conectados al carrito existente. | 1 semana |
| 3. Recorrido por áreas | Modelo del espacio (puede ser estilizado/low-poly), ruta de cámara, 3–4 zonas, máquinas clicables con ficha (texto + video). | 2–3 semanas |
| 4. Visor anatómico | Modelo preparado, 6–10 grupos musculares, resaltado según la máquina. | 2–3 semanas |
| 5. Optimización y móvil | Compresión, calidad adaptativa, pruebas en dispositivos reales. | 1–2 semanas |
| 6. (Opcional) Animación del ejercicio | Personaje Mixamo o animación propia sincronizada con el resaltado. | 2+ semanas |

**Total realista:** ~2–3 meses para las fases 0–5.

---

## 8. Riesgos y decisiones pendientes

- **Estilo visual:** ¿realista o estilizado/low-poly? El estilizado es mucho más fácil de conseguir, optimizar y mantener coherente. **Recomendado: estilizado.**
- **Fidelidad del gimnasio:** ¿recrear un gimnasio real (requiere modelarlo o fotogrametría) o uno genérico? Lo genérico es mucho más barato.
- **Licencias:** los modelos CC BY-SA (anatomía) exigen atribución visible; los de Sketchfab varían. Llevar un registro de licencias en el repo.
- **Rigor anatómico:** los grupos musculares y ejercicios deberían revisarlos un entrenador real del equipo.
- **Peso en móvil:** es el riesgo técnico principal; por eso el respaldo HTML es obligatorio desde la fase 1.
- **Alcance académico:** si hay fecha de entrega, priorizar fases 1–3 y dejar el visor anatómico como demostración con pocos músculos.
