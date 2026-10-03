# Gym — Avance 1

## Fase 4: planes y solicitudes de membresía

Reinicia el backend y abre **http://127.0.0.1:3000/index.html#planes**.
Selecciona un plan con una sesión iniciada. Si no has iniciado sesión, se abre
el login y se conserva la selección; en Mi cuenta se pide confirmarla.
El enlace a registro también conserva la selección. La solicitud no inicia
pagos ni activa acceso: queda `pendiente`, con fechas de inicio y fin vacías.
Mi cuenta muestra el nombre del plan, precio, estado y fecha de solicitud.

`GET /api/planes` carga el catálogo de `GymWeb.planes`. Al primer uso se insertan
los cuatro planes del frontend mediante upsert con `$setOnInsert`, sin sobrescribir
planes existentes: Básico 60.000 COP, Familiar 150.000 COP, Premium individual
100.000 COP y Premium familiar 350.000 COP, todos por mes. Puedes modificar
los documentos en Atlas; `disponible: false` impide nuevas solicitudes.
Los planes familiares admiten hasta cinco personas; asociar beneficiarios y
reservar entrenadores son funciones futuras.

`POST /api/membresia` recibe únicamente `planId` y exige sesión. El servidor
obtiene identidad, precio y condiciones; ignora precios, usuarios y estados
enviados por el navegador. `GET /api/membresia` muestra solo la del usuario
autenticado. La colección `membresias` usa el ID del usuario como `_id` único,
por lo que solo permite una membresía por usuario, pendiente o activa, incluso
con peticiones simultáneas. No implementa todavía historial, renovación,
cambio de plan, cancelación ni activación. Las condiciones del plan se copian
en la solicitud para conservar el precio acordado al pedirlo.

Las pruebas cubren acceso, aislamiento entre usuarios, precio del servidor,
validación y duplicados. `npm run verify:atlas` también prueba solicitudes
concurrentes en MongoDB y limpia la membresía de su cuenta temporal. El catálogo
y las colecciones creadas permanecen como datos iniciales del proyecto.

## Fase 3: inicio de sesión y Mi cuenta

Reinicia `npm start` y abre **http://127.0.0.1:3000/login.html** (no Live Server).
Usa el correo y contraseña de una cuenta registrada. El login redirige a
`micuenta.html`, muestra el nombre y correo reales y permite cerrar sesión.
Sin una sesión válida, Express redirige esa página al login y la API responde 401.
El formulario de registro no inicia sesión automáticamente.

- `POST /api/login`: valida credenciales y crea la cookie `gym_session`.
- `GET /api/me`: devuelve solo ID, nombre y correo del usuario autenticado.
- `POST /api/logout`: elimina la sesión de MongoDB y borra la cookie.

Las sesiones duran ocho horas, persisten entre reinicios y se guardan en
`GymWeb.sesiones`. La cookie contiene un token aleatorio de 32 bytes; en MongoDB
se guarda su SHA-256, el ID del usuario y la fecha de expiración. Un índice TTL
limpia sesiones vencidas; la API también verifica la fecha, sin esperar al TTL.
Un nuevo login reemplaza la sesión de la cookie anterior. Las contraseñas se
comprueban con scrypt y comparación de tiempo constante. Los errores de correo
inexistente y contraseña errónea muestran el mismo mensaje.

La cookie es HttpOnly y SameSite=Strict; con HTTPS también usa Secure.
Los POST rechazan un Origin distinto del servidor. No se almacenan tokens en
localStorage. Se permiten diez intentos de login por IP cada quince minutos y
cuatro verificaciones concurrentes. Ese límite vive en memoria y se reinicia
con Node; para un despliegue con varias instancias se necesita un límite compartido.
El servidor sigue configurado para localhost. No habilites uso público sin HTTPS
y una configuración explícita del proxy (no se confía en cabeceras reenviadas).

`npm test` prueba login, datos incorrectos, límite de intentos, protección de
cuenta, expiración, rotación, logout y origen externo. `npm run verify:atlas`
comprueba además ese flujo con una cuenta temporal en Atlas y limpia sus datos
y sesiones. Las membresías todavía no están implementadas.

## Fase 2: registro de usuarios

Con el backend reiniciado mediante `npm start`, abre
**http://127.0.0.1:3000/registro.html**. Completa el formulario y pulsa
Registrarse. La página llama a `POST /api/usuarios` en el mismo origen;
no necesita CORS. Abrir directamente el archivo HTML no permite registrar.

El cuerpo JSON contiene `nombre`, `correo` y `password`. La API valida tipos
y límites, normaliza el correo a minúsculas, devuelve 201 al crear una cuenta,
400 ante datos inválidos, 409 ante correo duplicado y 503 si falla MongoDB.
La respuesta solo contiene ID, nombre y correo, además de un mensaje.

MongoDB crea `GymWeb.usuarios` durante el primer registro, con un índice único
sobre `correo`. Se almacenan `nombre`, `correo`, `passwordHash` y `createdAt`.
El hash usa scrypt (N=32768, r=8, p=1), sal aleatoria de 16 bytes y clave de
64 bytes mediante `node:crypto`; no se guarda la contraseña original.
El índice único evita duplicados incluso con solicitudes simultáneas.
Si ya existen correos duplicados en la colección, habrá que resolverlos antes
de que el índice pueda crearse; no se eliminan datos automáticamente.

Comprueba el registro con una cuenta de prueba propia y revisa el documento
en Atlas → Browse Collections → GymWeb → usuarios. Repetir el mismo correo
debe mostrar el aviso de duplicado. No incluyas hashes ni credenciales en capturas.
Las pruebas automatizadas de esta fase usan una DB simulada y no crean cuentas
en Atlas. `npm test` comprueba validación, hash verificable, respuestas y bloqueo
de archivos privados. `npm run verify:atlas` hace una prueba explícita con la
configuración local: crea una cuenta temporal, comprueba su hash y el rechazo
de duplicados, y elimina esa cuenta al finalizar. Crea la colección y su índice
si aún no existen. Si falla la limpieza, el comando informa el fallo.
El registro no inicia sesión automáticamente ni activa membresías.
Para uso público se requiere HTTPS y protección
contra abuso adicional; esta fase escucha solo en localhost.

## Arquitectura y alcance

El frontend existente vive en la raíz (HTML, CSS, JavaScript e imágenes).
El backend independiente vive en `backend/`: Node.js, Express y controlador
oficial `mongodb`, sin Docker, Mongoose ni dependencia adicional para `.env`.
Node carga `backend/.env` mediante su API nativa, sin importar desde dónde
se inicie el proceso. Las variables del entorno tienen prioridad.

Flujo previsto: navegador → API Express → MongoDB Atlas (`GymWeb`).
El Avance 1 implementó `GET /health`; la fase 2 añade el registro y sirve
archivos públicos mediante una lista explícita, sin exponer el backend.
El frontend puede abrirse como antes para navegar, o desde Express para registrarse.

- `src/config.js`: configuración local.
- `src/database.js`: pool del driver, ping real y cierre de conexión.
- `src/app.js`: endpoint HTTP y respuesta segura ante fallos.
- `src/server.js`: inicio y cierre del servidor.
- `test/health.test.js`: pruebas HTTP y fallo del driver real.

Próximas fases: colecciones `usuarios`, `planes`, `membresias`, `rutinas`,
`productos` y `reservasEntrenadores`, con validación, autenticación y CRUD.
El Avance 1 no creaba colecciones ni modificaba documentos. Un ping confirma
conectividad, pero no valida permisos de escritura ni la existencia de colecciones.

## Preparar MongoDB Atlas

1. Abre el proyecto de Atlas que contiene el clúster con `GymWeb`.
2. En **Security → Database Access**, elige **Add New Database User** y
   autenticación con contraseña. Este usuario de base de datos es distinto
   de la cuenta con la que entras a Atlas. Genera una contraseña segura.
3. En los permisos, usa **Specific Privileges / Add Specific Privilege**:
   rol `readWrite`, base `GymWeb`, todas las colecciones de esa base
   (campo de colección vacío si lo solicita). Evita `readWriteAnyDatabase`
   y permisos de administrador. Si Atlas permite restringir clústeres,
   selecciona únicamente el clúster de Gym. Guarda el usuario.
4. En **Security → Network Access → Add IP Address**, autoriza únicamente
   la IP pública de salida del equipo donde correrá Node. Para desarrollo
   local usa **Add Current IP Address** y, si procede, caducidad temporal.
   No uses `0.0.0.0/0`. Si cambias de red/IP, actualiza esta entrada. En un
   futuro despliegue se autorizará la IP de salida del servidor.
5. En el clúster, selecciona **Connect → Drivers**, elige **Node.js** y una
   versión compatible con el controlador 7 instalado. Copia la URI.
6. Introduce la URI solo en `backend/.env`, sustituyendo usuario y contraseña
   localmente. Codifica los caracteres especiales de ambos con percent-encoding
   (por ejemplo, `@` como `%40`). Conserva las opciones de Atlas de la URI.
   La aplicación selecciona `GymWeb` explícitamente mediante `MONGODB_DB`.

No pegues contraseñas ni URI reales en el chat, HTML, capturas, entregas o Git.
`.env` está excluido; `.env.example` está pensado para versionarse sin secretos.

Referencias oficiales:
[conexión a Atlas](https://www.mongodb.com/docs/atlas/connect-to-database-deployment/),
[conexión con Drivers](https://www.mongodb.com/docs/atlas/driver-connection/).

## Ejecutar localmente (PowerShell)

Requisito: Node.js 22.13 o posterior compatible con MongoDB Driver 7.
Desde la raíz del proyecto:

```powershell
cd backend
npm ci
Copy-Item .env.example .env
notepad .env
# Guarda MONGODB_URI en el editor local y ciérralo.
npm start
```

Copia `.env.example` solo la primera vez; no sobrescribas una configuración
existente. El servidor escucha por defecto en `127.0.0.1:3000`.
`npm run dev` reinicia al cambiar código; tras editar `.env`, reinicia el proceso.

En otra terminal:

```powershell
curl.exe -i http://127.0.0.1:3000/health
```

Con un ping exitoso devuelve **HTTP 200**:

```json
{"status":"ok","database":"connected"}
```

Sin URI, con credenciales incorrectas, sin IP autorizada o sin acceso a la DB
devuelve **HTTP 503**:

```json
{"status":"error","database":"unavailable"}
```

Cada petición ejecuta `ping` sobre `GymWeb` con un límite del driver de 5 segundos.
El servidor HTTP puede iniciar aunque Atlas no esté disponible; eso no indica
que la base esté conectada. La respuesta no expone la URI ni errores internos.
Para diagnosticar 503, revisa localmente URI, usuario, permisos, IP autorizada,
estado del clúster y conectividad DNS/red. Detén el servidor con Ctrl+C.

Si las consultas SRV de Atlas fallan con `ECONNREFUSED` usando el DNS del
sistema, pero funcionan con Cloudflare, puedes agregar a `backend/.env`:

```dotenv
MONGODB_DNS_SERVERS=1.1.1.1,1.0.0.1
```

Reinicia el backend después del cambio. Esta opción configura las consultas DNS
solo del proceso Node; no cambia Windows. Dejarla vacía conserva el DNS del sistema.

## Validación del avance

```powershell
cd backend
npm test
```

Las pruebas cubren HTTP 200 con una comprobación simulada, HTTP 503 sin URI,
errores sin filtración de datos y HTTP 503 contra un servidor inaccesible usando
el driver real. No requieren cuenta Atlas. El caso exitoso simulado no demuestra
conexión real. Para completar la evidencia académica, configura `.env`, ejecuta
el comando anterior de `curl.exe` y conserva una captura del HTTP 200 y su JSON,
sin mostrar secretos. Hasta esa comprobación, la conexión real queda pendiente.
