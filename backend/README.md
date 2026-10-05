
# configuración rapida ==========================================================================================

# 1. Preparar el proyecto — solo la primera vez o al reinstalar dependencias
```Powershell
node --version
npm.cmd --version
```
# 2. Después instala las dependencias:

```Powershell
npm.cmd ci
```
```CMD
npm ci
```

# Para crear la configuración únicamente si todavía no existe:

```CMD
if (-not (Test-Path -LiteralPath .env)) {
    Copy-Item -LiteralPath .env.example -Destination .env
}
notepad.exe .env
```
En ese archivo configura:

MONGODB_URI=TU_URI_DE_MONGODB_ATLAS
MONGODB_DB=GymWeb
HOST=127.0.0.1
PORT=3000

# 3. Iniciar base datos — elige uno de estos modos

cd C:..\..\..\Gym\backend --> buscar la ruta donde este ubicada

```Powershell
npm.cmd start
```
```CMD
npm start
```

# 4. Comprobar la conexión y abrir la aplicación

desde cualquier ubicación en CMD o Powershell
curl.exe -i http://127.0.0.1:3000/health

La respuesta correcta incluye HTTP 200 y:
{"status":"ok","database":"connected"}

# 5. Preparar un administrador — solo cuando necesites promover una cuenta

Primero registra la cuenta desde la web. En otra terminal, entra en backend y ejecuta:

```Powershell
$env:NODE_ENV = 'development'
npm.cmd run admin:prepare -- --correo "tu-correo@ejemplo.com" --confirmar
Remove-Item Env:NODE_ENV
```

# 6. Ejecutar las pruebas locales

```Powershell
npm.cmd test
```

# 7. Diagnosticar problemas de conexión

```Powershell
npm.cmd run diagnose:db
```

# 8. Ejecutar verificaciones contra Atlas — opcional

```Powershell
npm.cmd run verify:atlas
compureba: Registro, login, sesión, planes y solicitud inicial de membresía.

npm.cmd run verify:atlas -- --with-admin
comprueba: Lo anterior, permisos administrativos, activación y vencimiento.

npm.cmd run verify:atlas -- --with-routines
comprueba: Lo anterior, incluyendo administración y acceso a rutinas.

```

# 9. Si el puerto 3000 está ocupado
Detén el backend si lo tienes activo con Ctrl+C. Si necesitas utilizar otro puerto:
```Powershell
$env:PORT = '3001'
npm.cmd run start
```
Después de detener ese proceso, elimina el cambio de esa terminal:
```Powershell
Remove-Item Env:PORT
```

# fin configuración rapida ==========================================================================================


# GymWeb

## Fase 2: registro de usuarios -----------------------------------------------------

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
- `src/database-diagnostics.js`: diagnóstico local sin mostrar secretos del driver.
- `src/memberships.js`: fechas, acceso y endpoints administrativos.
- `src/routines.js`: validación y permisos de rutinas para administradores y miembros.
- `src/products.js`: catálogo público, cotización de carrito y administración de productos.
- `src/orders.js`: compras propias, pago y recogida en el gimnasio, administración e inventario.
- `src/training.js`: validación, permisos y API de entrenadores, agenda y mensajería.
- `src/training-database.js`: transacciones e índices de perfiles, citas y mensajes.
- `src/family-renewals.js`: API de invitaciones, beneficiarios, renovaciones e historial.
- `src/family-renewals-database.js`: transacciones, cupos, periodos y aprobación de renovaciones.
- `src/membership-access.js`: resolución común del acceso propio o compartido.
- `src/simulated-payments.js`: pago de membresías simulado y exclusivo de desarrollo.
- `scripts/prepare-admin.js`: preparación explícita de un administrador de desarrollo.
- `scripts/diagnose-database.js`: ping y lectura de usuarios sin escrituras ni datos de cuentas.
- `test/health.test.js`: pruebas HTTP y fallo del driver real.

Colecciones actuales: `usuarios`, `sesiones`, `planes`, `membresias`, `rutinas`,
`productos`, `pedidos`, `entrenadores`, `horarios`, `reservas`, `conversaciones` y
`mensajes`, `vinculos_familiares`, `eventos_familia`, `renovaciones` y
`periodos_membresia`. Resta fase 12: validación integral y preparación del despliegue,
según el alcance propuesto arriba.
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

```CMD
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

```CMD
cd backend
npm test
```

Las pruebas cubren HTTP 200 con una comprobación simulada, HTTP 503 sin URI,
errores sin filtración de datos y HTTP 503 contra un servidor inaccesible usando
el driver real. No requieren cuenta Atlas. El caso exitoso simulado no demuestra
conexión real. Para completar la evidencia académica, configura `.env`, ejecuta
el comando anterior de `curl.exe` y conserva una captura del HTTP 200 y su JSON,
sin mostrar secretos. Hasta esa comprobación, la conexión real queda pendiente.


## Fase 3: inicio de sesión y Mi cuenta -----------------------------------------------------

Reinicia `npm start` y abre **http://127.0.0.1:3000/login.html** (no Live Server).
Usa el correo y contraseña de una cuenta registrada. El login redirige a
`micuenta.html`, muestra el nombre y correo reales y permite cerrar sesión.
Sin una sesión válida, Express redirige esa página al login y la API responde 401.
El formulario de registro no inicia sesión automáticamente.

- `POST /api/login`: valida credenciales y crea la cookie `gym_session`.
- `GET /api/me`: devuelve ID, nombre, correo y rol del usuario autenticado.
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
y sesiones. Las membresías se incorporaron en fases 4 y 5.


## Fase 4: planes y solicitudes de membresía -----------------------------------------------------

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
Los planes familiares admiten hasta cinco personas; asociar beneficiarios se
incorporó en fase 11. Las reservas de entrenadores se incorporaron en fase 10
para Premium vigente.

`POST /api/membresia` recibe únicamente `planId` y exige sesión. El servidor
obtiene identidad, precio y condiciones; ignora precios, usuarios y estados
enviados por el navegador. `GET /api/membresia` muestra solo la del usuario
autenticado. La colección `membresias` usa el ID del usuario como `_id` único,
por lo que solo permite una membresía por usuario, pendiente, activa o vencida, incluso
con peticiones simultáneas. La activación se incorporó en fase 5, y el historial
y la renovación en fase 11 mediante colecciones separadas. El cambio de plan
y la cancelación de una membresía vigente permanecen fuera del alcance actual.
Las condiciones del plan se copian en la solicitud para conservar el precio
acordado al pedirlo.

## Fase 5: activación administrativa y vencimiento -----------------------------------------------------

Reinicia el backend y abre **http://127.0.0.1:3000/micuenta.html**.
Mi cuenta muestra estado, acceso habilitado o no habilitado, solicitud, inicio y
vencimiento con hora de Bogotá. **Actualizar membresía** permite ver una activación
realizada desde otra sesión; la página vuelve a consultar al llegar al vencimiento.

Una cuenta con `rol: "admin"` ve **Administrar membresías** en Mi cuenta. Puede
filtrar pendientes, activas o vencidas, actualizar y cargar más resultados (50 por
página). **Activar por un mes** inicia una solicitud pendiente en ese instante.
Las cuentas normales reciben 403 en la API administrativa, aunque alteren el HTML,
envíen un rol o llamen directamente al endpoint. Sin sesión, la API responde 401.
`/api/me` incluye `rol` (`usuario` o `admin`), tomado de la base en cada petición;
las sesiones no guardan permisos antiguos. Revocar el rol surte efecto en la
siguiente petición. Las cuentas existentes sin rol siguen siendo usuarios normales.
El registro ignora roles enviados por el navegador; no hay API para cambiarlos.

- `GET /api/admin/membresias?estado=pendiente`: nombre y correo del titular,
  condiciones guardadas y fechas. `estado` admite `pendiente`, `activa` y `vencida`.
  `despues=<siguiente>` recorre la página siguiente. No entrega hashes ni sesiones.
- `POST /api/admin/membresias/:userId/activar`: exige administrador y un ID válido.
  Se envía sin cuerpo o con `{}`; no acepta fechas, precios ni datos adicionales.
  Devuelve 200 al activar o repetir una activación vigente, 404 si no existe solicitud
  y 409 si el estado o las condiciones no permiten activarla.
- `GET /api/membresia`: solo devuelve la propia, con `accesoActivo` calculado por
  el servidor. Las solicitudes nuevas también devuelven `accesoActivo: false`.

**Fechas y concurrencia.** Un mes calendario en UTC conserva la hora de activación
y ajusta el día al último del mes siguiente si hace falta: 31 de enero → 28 de febrero
(29 en año bisiesto). Se guardan BSON Date y se entregan ISO UTC. El acceso comienza
en `inicio` inclusivo y termina en `fin` exclusivo. La interfaz muestra Bogotá;
el cálculo sigue siendo UTC, no 30 días ni un mes en hora local. La transición es
atómica y exige estado `pendiente`, periodo `mes` y fechas vacías. Dos administradores
o un reintento tras perder la respuesta conservan el primer inicio y fin. MongoDB
guarda `activadaEn` y `activadaPor` para auditoría; el cliente no puede asignarlos.

**Vencimiento sin tarea programada.** Consultar la membresía propia, listar desde
administración o intentar activarla marca `vencida` cuando `fin <= ahora`. No depende
de TTL ni elimina documentos. Si nadie consulta, el estado guardado puede continuar
como `activa`; el acceso siempre exige `inicio <= ahora < fin` y estado activo.
Las funciones futuras de acceso deben comprobar ambas fechas en el servidor.
El primer listado crea índices `(estado, fin)` y `(estado, _id)`. Una vencida conserva
fechas y unicidad por usuario; no admite otra solicitud de activación inicial.
La renovación de una vencida y los beneficiarios se incorporaron en fase 11.
El cambio de plan y los pagos reales permanecen fuera del alcance actual.
Las rutinas generales se incorporaron en fase 6, el pago simulado en fase 7 y
las reservas en fase 10.

### Preparar un administrador de desarrollo

El paso siguiente modifica **solo la cuenta exacta que elijas en la base configurada**.
No se ejecuta al iniciar el backend ni durante las pruebas. Registra una cuenta de
desarrollo por la web y comprueba localmente que `.env` apunta a la base elegida,
sin compartir su contenido. Desde `backend`:

```powershell
$env:NODE_ENV = 'development'
npm run admin:prepare -- --correo tu-cuenta-de-desarrollo@example.com --confirmar
Remove-Item Env:NODE_ENV
npm start
```

Sustituye el correo por el de tu cuenta registrada. El comando exige entorno
`development`, correo exacto y `--confirmar`; no crea cuentas ni recibe contraseñas.
Tampoco modifica membresías ni promueve cuentas con otros roles o ya administradoras.
Cambiar después `NODE_ENV` no revoca el rol almacenado. Entra con la contraseña
habitual para ver el panel. Para quitar permisos, cambia únicamente el `rol` de esa
cuenta a `usuario` con una herramienta administrativa de MongoDB.
No se preparó ni promovió ninguna cuenta real durante esta implementación.

Crea una cuenta normal y un administrador **temporales propios**, comprueba el rechazo
del rol enviado en registro, permisos, activaciones concurrentes, reintentos y vencimiento
con un reloj de prueba, y limpia sus cuentas, sesiones y membresía. No activa ni promueve
usuarios existentes. Evita el listado administrativo para no actualizar membresías reales
vencidas; ese listado se prueba localmente. La carga del catálogo sigue usando upsert y
los índices/colecciones quedan creados. El comando sin `--with-admin` conserva las
comprobaciones anteriores. Ninguno se ejecutó contra Atlas durante esta implementación.



## Fase 6: rutinas generales con acceso por membresía -----------------------------------------------------

Usa la misma carpeta que contiene fase 5:
`C:\Users\USER\.codex\worktrees\0dce\Gym\backend`.
Detén el backend anterior con Ctrl+C, ejecuta `npm.cmd start` en PowerShell y
abre **http://127.0.0.1:3000/micuenta.html**. No hace falta volver a preparar un
administrador existente: su rol sigue guardado en MongoDB. Los cambios de esta
carpeta no se copian automáticamente a `Documents\GitHub\Gym`.

En **Administrar rutinas**, una cuenta administradora puede crear una rutina con
nombre, objetivo, nivel (principiante/intermedio/avanzado) y de 1 a 20 ejercicios.
Cada ejercicio tiene nombre, series, repeticiones o duración y descanso en segundos.
Marca **Disponible para miembros** para publicarla. Después puedes editarla,
deshabilitarla o habilitarla; deshabilitar conserva el documento y retira su acceso
por lista y por ID. No existe borrado público ni datos iniciales de rutinas: el
catálogo comienza vacío y el administrador decide qué publicar.

**Mis rutinas** muestra las disponibles con filtro de nivel y paginación de 20.
Los cuatro planes tienen acceso al mismo catálogo general. El servidor exige sesión
y una membresía `activa` con `inicio <= ahora < fin`, incluso si el solicitante es
administrador. Administrar rutinas usa el rol, sin exigir membresía personal.
Una membresía ausente, pendiente, vencida o con fechas inválidas recibe 403 antes
de leer el catálogo. También se comprueba la fecha después de consultar MongoDB
para evitar entregar contenido si la membresía vence durante la consulta.
Las respuestas usan `Cache-Control: no-store`. La interfaz retira el contenido al
vencer, vuelve a comprobarlo al regresar a la pestaña o actualizar la membresía,
y limpia las rutinas ante errores de acceso o conexión. No se guardan en localStorage.
Inicio conserva únicamente ejemplos de objetivos y enlaza a **Mis rutinas**;
esos ejemplos no son documentos del catálogo ni contienen ejercicios privados.

### API y datos

- `GET /api/rutinas`: catálogo disponible para miembros activos.
- `GET /api/rutinas/:id`: una rutina disponible; devuelve 404 si está deshabilitada
  o no existe. Ambos GET incluyen `accesoHasta` para la interfaz.
- `GET /api/admin/rutinas`: catálogo administrativo, con `version` y fechas.
  El filtro `disponibilidad` admite `todas`, `disponibles` o `deshabilitadas`.
- `POST /api/admin/rutinas`: crea una rutina con `nombre`, `objetivo`, `nivel`,
  `disponible` y `ejercicios`.
- `POST /api/admin/rutinas/:id`: edita el contenido completo anterior y exige
  la `version` obtenida del catálogo.
- `POST /api/admin/rutinas/:id/disponibilidad`: recibe solo `disponible` y `version`.

Los listados admiten `nivel` y `despues=<siguiente>` para recorrer páginas.
Ejemplo de cuerpo de creación (datos de prueba, no una prescripción):

```json
{
  "nombre": "Rutina de prueba",
  "objetivo": "Comprobar el funcionamiento del catálogo.",
  "nivel": "principiante",
  "disponible": true,
  "ejercicios": [
    { "nombre": "Ejercicio de prueba", "series": 3, "repeticiones": "8–12", "descansoSegundos": 60 }
  ]
}
```

Nombre y nombre de ejercicio: 2–100 caracteres; objetivo: 5–500; series: entero
1–20; repeticiones/duración: texto de 1–40; descanso: entero de 0–600 segundos.
La API rechaza campos desconocidos y no acepta autores, fechas ni IDs desde el
cliente. El cuerpo JSON conserva el límite de 8 KB. Los textos se muestran mediante
`textContent`, sin interpretar HTML. En `GymWeb.rutinas`, `_id` es ObjectId; se guardan
`creadaEn`, `actualizadaEn`, `creadaPor`, `actualizadaPor` y `version`. Los actores
permanecen en la base para auditoría, sin aparecer en respuestas a miembros.
El primer listado crea un índice `(disponible, _id)` sin cargar rutinas de ejemplo.

La versión empieza en 1 y aumenta con cada edición o cambio de disponibilidad.
La actualización es atómica: si otro administrador ya cambió la rutina, devuelve
409 sin sobrescribirla. Actualiza el catálogo y vuelve a abrir **Editar rutina**.
Un error de conexión mantiene los datos del formulario; revisa el catálogo antes
de repetir una creación, porque la escritura puede haber ocurrido aunque se
perdiera la respuesta. No hay deduplicación automática de nombres ni historial de
versiones. La asignación personalizada sigue fuera del alcance de esta fase;
entrenadores y reservas se incorporaron en fase 10, y renovaciones en fase 11.

Si autorizas escribir datos temporales en tu base configurada, puedes ejecutar:

```powershell
npm.cmd run verify:atlas -- --with-routines
```

Esta opción incluye `--with-admin`, crea sus propias cuentas temporales y una rutina
de prueba, comprueba los endpoints y limpia sus usuarios, sesiones, membresía y rutinas.
La rutina se publica brevemente durante la comprobación y puede verse en el catálogo
de miembros mientras corre. No modifica rutinas ni usuarios preexistentes. El índice
y la colección pueden quedar creados. El listado administrativo de membresías se
evita para no cambiar membresías ajenas vencidas. El verificador no se ejecutó contra
Atlas durante esta implementación: la validación real del clúster queda pendiente.




## Fase 7: pago simulado para probar las rutinas -----------------------------------------------------

El pago simulado permite activar **tu propia solicitud pendiente** por un mes o
probar un rechazo. No cobra dinero, no pide datos bancarios y no integra ninguna
pasarela. Se identifica como simulación tanto en la interfaz como en MongoDB.

### Iniciar desde PowerShell

1. Detén el backend anterior con **Ctrl+C**.
2. Abre la carpeta que contiene estos cambios y ejecuta:

   ```powershell
   Set-Location 'C:\Users\USER\.codex\worktrees\0dce\Gym\backend'
   npm.cmd run start:demo
   ```

   Este comando habilita la simulación solo en ese proceso y utiliza la conexión
   de tu `.env`; no modifica el archivo ni activa membresías al iniciar. Requiere
   `NODE_ENV` sin definir o con valor `development`. Si configuraste explícitamente
   otro entorno, el comando se detiene. Para una sesión local de desarrollo:

   ```powershell
   $env:NODE_ENV = 'development'
   npm.cmd run start:demo
   ```

3. Abre **http://127.0.0.1:3000/micuenta.html** e inicia sesión. Si usas otro
   `PORT`, cambia el puerto de la dirección.
4. Si ya tienes una membresía pendiente, aparecerá **Pago simulado**. Si todavía
   no tienes solicitud, ve a **Ver planes**, solicita uno y vuelve a Mi cuenta.
5. Elige **Rechazado: mantener pendiente** y pulsa **Simular pago** para comprobar
   el bloqueo. Después puedes elegir **Aprobado: activar membresía** y pulsar otra
   vez. La aprobación muestra inicio, vencimiento y comprobante de simulación;
   **Mis rutinas** se actualiza automáticamente.
6. Si aparece que no hay rutinas disponibles, entra con el administrador, crea una
   en **Administrar rutinas** y marca **Disponible para miembros**. No se cargan
   rutinas de ejemplo en tu base. Una membresía ya activada por el administrador
   permite consultar rutinas y no necesita ni admite este pago simulado.

Los cambios están en esta carpeta de trabajo; no se copian automáticamente a
`C:\Users\USER\Documents\GitHub\Gym`. Las acciones que hagas con `start:demo`
guardan solicitudes y comprobantes de prueba en la base configurada en `.env`.

Para iniciar normalmente, detén el proceso y usa `npm.cmd start`. La simulación
solo se habilita cuando **ambas** condiciones se cumplen:
`NODE_ENV=development` y `ENABLE_DEMO_PAYMENTS=true`. Con la bandera ausente o
`false`, o en producción, permanece deshabilitada. `.env.example` documenta estos
valores sin modificar tu `.env`. También puedes habilitarla para una sesión:

```powershell
$env:NODE_ENV = 'development'
$env:ENABLE_DEMO_PAYMENTS = 'true'
npm.cmd start
```

Si utilizaste esa alternativa, pon `$env:ENABLE_DEMO_PAYMENTS = 'false'` antes de
volver al inicio normal. Deshabilitar la simulación oculta el panel, pero conserva
el comprobante y el acceso de membresías ya activadas hasta su vencimiento.

### API y persistencia

- `GET /api/pagos/simulacion`: exige sesión y devuelve `habilitada`.
- `POST /api/pagos/simulados`: exige sesión y modo de simulación. Recibe únicamente
  `{ "resultado": "aprobado" }` o `{ "resultado": "rechazado" }`; rechaza campos
  adicionales. Devuelve `message`, `pago` y `membresia`.

El servidor obtiene el usuario de la sesión y el precio/moneda de la solicitud
guardada; no acepta IDs, importes, fechas ni roles del navegador. Conserva los
controles de origen y las respuestas sin caché. Devuelve 401 sin sesión, 403 con
simulación deshabilitada/origen externo, 400 con datos inválidos, 404 sin solicitud,
409 si el estado o las condiciones no permiten la operación y 503 ante fallo de
persistencia.

Se guarda `pagoSimulado` dentro de la membresía, con `tipo: "simulado"`, resultado,
importe, moneda y fecha. Conserva el último rechazo; la aprobación definitiva
reemplaza ese registro. No constituye un historial de transacciones reales. La
aprobación guarda comprobante, estado, fechas y `activacionOrigen: "pago-simulado"`
en una sola actualización atómica. La activación administrativa guarda origen
`administrador`. Los actores de auditoría permanecen en la base y no se exponen
en el comprobante público.

El rechazo mantiene pendiente y sin acceso. Solicitudes simultáneas y reintentos
de aprobación conservan el primer inicio y fin, incluso si se perdió la respuesta.
Una aprobación repetida después del vencimiento devuelve el comprobante original
con acceso deshabilitado, sin renovar. No se permite rechazar una aprobación ya
confirmada, pagar una activación administrativa ni reactivar una membresía vencida.
El mes calendario y el control de acceso siguen las reglas de las fases 5 y 6.



## Fase 8: productos administrables y carrito conectado -----------------------------------------------------

Reinicia el backend en la carpeta de trabajo actual:

```powershell
Set-Location 'C:\Users\USER\.codex\worktrees\0dce\Gym\backend'
npm.cmd run start:demo
```

El modo demo conserva el pago simulado de **membresías**. También puedes usar
`npm.cmd start`: productos y carrito funcionan con la simulación apagada.

1. Abre **http://127.0.0.1:3000/index.html#productos**. El catálogo se obtiene de
   MongoDB; no se calculan precios leyendo el HTML. Pulsa **Actualizar productos**
   para ver cambios realizados por el administrador o **Ver más productos** si
   hay otra página. El catálogo y la cotización no requieren sesión ni membresía.
2. Agrega productos y abre el botón flotante del carrito. Puedes cambiar cantidades
   o quitar artículos. **Actualizar total** consulta precios y existencias actuales.
   Si disminuyen las existencias, ajusta la cantidad; si un producto se deshabilita
   o se agota, lo retira del carrito y avisa. También comprueba al abrir el carrito
   y al actualizar el catálogo. Los totales siguen siendo estimaciones: no reserva
   unidades, no descuenta stock, no crea pedidos y no cobra.
3. Inicia sesión con el administrador y abre **Mi cuenta → Administrar productos**.
   Puedes crear, editar, deshabilitar y habilitar productos, sin membresía personal.
   Se guardan nombre, descripción, precio entero en COP, existencias, imagen y
   disponibilidad. Marca **Publicado en la tienda** para mostrarlo; con existencias
   cero aparece **Agotado** y no permite añadirlo.
4. Si otro administrador cambió el producto, recibirás un aviso de conflicto.
   Actualiza el catálogo y vuelve a abrir **Editar producto**. Un fallo de conexión
   conserva el formulario: revisa el catálogo antes de repetir una creación, pues
   la escritura puede haber ocurrido aunque se perdiera la respuesta. Los nombres
   no son únicos; el carrito distingue productos mediante sus IDs.

En el primer acceso se insertan únicamente si faltan los tres productos originales
de ejemplo: Proteína 150.000 COP, Creatina 80.000 COP y Shaker 35.000 COP. Cada uno
comienza con **10 unidades ficticias para pruebas**. Se utiliza `$setOnInsert` con
IDs estables; reiniciar no sobrescribe precios, existencias ni disponibilidad
editados. Antes de un uso real se deben revisar estos datos de ejemplo. Esta
inicialización ocurre en tu base configurada cuando utilizas el catálogo, no durante
el arranque del proceso. No se ejecutó contra Atlas durante la implementación.

El carrito vive en memoria de la pestaña y se vacía al recargar. Admite hasta 20
productos distintos y de 1 a 99 unidades por producto, dentro de las existencias
mostradas. Una cotización consulta cada producto, sin garantizar una instantánea
transaccional ni disponibilidad futura. Ante fallo de red conserva los artículos y
avisa que el total sigue estimado. La confirmación de pedidos y el descuento seguro
de existencias se incorporaron en fase 9, documentada al inicio.

### API y datos

- `GET /api/productos`: productos publicados, 20 por página, con `siguiente`.
  El parámetro `despues` contiene el ID de la página anterior.
- `GET /api/productos/:id`: producto publicado; 404 si falta o está deshabilitado.
- `POST /api/carrito/verificar`: recibe únicamente
  `{ "items": [{ "productoId": "ID_DE_24_CARACTERES", "cantidad": 2 }] }`.
  Devuelve artículos ajustados, subtotales, `total`, `moneda` y una lista de `cambios`.
  El servidor obtiene todos los precios; rechaza precios, totales, IDs duplicados,
  cantidades inválidas y campos adicionales enviados por el navegador.
- `GET /api/admin/productos`: exige administrador; admite `despues` y
  `disponibilidad=todas|disponibles|deshabilitados`.
- `POST /api/admin/productos`: crea con `nombre`, `descripcion`, `precio`, `stock`,
  `imagen` y `disponible`.
- `POST /api/admin/productos/:id`: edita esos mismos datos y exige `version`.
- `POST /api/admin/productos/:id/disponibilidad`: recibe solo `disponible` y `version`.

Nombre: 2–100 caracteres; descripción: 5–500; precio: entero entre 1 y 100.000.000
COP; stock: entero entre 0 y 9.999. Las imágenes se eligen entre los tres archivos
locales existentes (`img/proteina.jpg`, `img/creatina.jpg`, `img/shaker.jpg`); no se
aceptan URLs externas, rutas arbitrarias ni subida de archivos. La moneda es COP,
asignada por el servidor. Los textos se insertan con `textContent`, sin interpretar
HTML ni construir atributos con datos del producto.

`GymWeb.productos` utiliza ObjectId y guarda versión, fechas y actores de creación
y edición. Las actualizaciones comparan la versión y la incrementan atómicamente;
una versión obsoleta recibe 409. Los miembros y visitantes no reciben actores ni
versiones. No hay borrado público: deshabilitar conserva el documento. Se crea el
índice `(disponible, _id)`. Las respuestas conservan `Cache-Control: no-store` y los
POST rechazan orígenes externos. La API administrativa valida el rol en cada
petición; ocultar el panel no es el control de autorización.



## Compras de productos: pago y recogida en el gimnasio

Este flujo sustituye los pedidos simulados de la antigua fase 9. Funciona con
`npm.cmd start`, tanto en producción como en desarrollo, sin habilitar pagos demo.
Las membresías conservan su flujo independiente.

### Uso

1. Detén el backend anterior con Ctrl+C y arranca desde la carpeta del proyecto:

   ```powershell
   Set-Location 'C:\Users\USER\Documents\GitHub\Gym\backend'
   npm.cmd start
   ```

2. Abre la tienda en http://127.0.0.1:3000/index.html#productos y agrega productos.
   Inicia sesión si hace falta; el carrito recupera los artículos en esa pestaña.
3. Revisa productos, cantidades y total, marca la confirmación de pago y recogida
   en el gimnasio y pulsa **Comprar**.
4. La compra aparece en **Mi cuenta → Mis compras**, pendiente de pago.
   Sus unidades ya están reservadas y no aparecen como stock disponible.
5. En la cuenta administradora, **Administrar compras** muestra el comprador,
   correo, productos y total. Pulsa **Confirmar pago recibido** únicamente al
   recibir el dinero en el gimnasio; después pulsa **Confirmar entrega** al
   entregar todos los productos.
6. El comprador o administrador pueden cancelar mientras esté pendiente de pago:
   las unidades vuelven al inventario. Una compra pagada no admite esta cancelación.

Comprar productos requiere sesión, pero no membresía. No se solicitan tarjetas
ni se cobran importes online: el cobro se realiza presencialmente en el gimnasio.
No hay envío a domicilio ni vencimiento automático de reservas; el administrador
puede cancelar pedidos pendientes que no se vayan a recoger.
Los pedidos simulados anteriores se conservan para consulta y se identifican
como pruebas, sin convertirse en compras. Ya no se permiten pagos simulados de productos.

### Integridad e inventario

El servidor obtiene los precios, productos y propietario. `totalEsperado` solo
sirve para comparar el importe confirmado: si los precios cambian antes de comprar,
responde 409 y pide actualizar el carrito y confirmar nuevamente.
La reserva de todas las unidades y la creación del pedido forman una sola
transacción MongoDB. La cancelación devuelve todas las unidades en otra transacción.
Se requiere Atlas o un replica set; ante fallo no se hacen escrituras parciales.

Cada intento usa un UUID v4 por usuario. Repetirlo con los mismos artículos recupera
la compra original, incluso después de cancelarla o de retirar un producto.
Pagar, entregar y cancelar son idempotentes y conservan las fechas originales.
Confirmar el pago o la entrega no vuelve a descontar existencias.
Las reservas y devoluciones incrementan la versión de cada producto; una edición
administrativa con una versión anterior debe actualizarse antes de guardar.
El campo de existencias del catálogo representa unidades disponibles para comprar,
excluidas las que ya están reservadas.

La pestaña conserva en `sessionStorage` la clave, IDs, cantidades, total confirmado
y si se envió el intento. Ante respuesta perdida, **Recuperar compra** reutiliza
esa clave; los artículos quedan bloqueados hasta confirmar el resultado.
Si cierras la pestaña y pierdes el intento, revisa **Mis compras** antes de repetir.
No se almacenan contraseñas ni datos bancarios.

### API

- `GET /api/pedidos` y `GET /api/pedidos/:id`: historial y detalle propios.
- `POST /api/pedidos`: recibe `clave`, `items` y `totalEsperado`.
  Cada artículo contiene únicamente `productoId` y `cantidad`; admite hasta
  20 productos distintos y entre 1 y 99 unidades por producto.
- `POST /api/pedidos/:id/cancelar`: cancela una compra propia pendiente.
- `GET /api/admin/pedidos`: compras de todos los usuarios, solo para administrador.
- `POST /api/admin/pedidos/:id/pagar|entregar|cancelar`: operaciones administrativas,
  con cuerpo vacío, sin importes ni estados enviados por el navegador.
- Los listados admiten `estado=pendiente|pagado|entregado|cancelado` y cursor
  `despues`, con 20 registros por página.
- `POST /api/pedidos/:id/pago-simulado`: responde 403; se mantiene para explicar
  el cambio a clientes antiguos.

`GymWeb.pedidos` guarda tipo `compra`, comprador, instantáneas de productos,
total en COP y fechas/actores de cada operación. Los DTO del comprador omiten
claves, propietario y actores internos; la lista administrativa incluye nombre
y correo para gestionar la recogida. Los índices incluyen `(userId, clave)` único,
`(userId, estado, _id)` y `(tipo, estado, _id)`.
Se conservan la validación de sesión, rol administrativo, origen y respuestas sin caché.
Las pruebas usan la base en memoria, sin crear compras en Atlas.


## Fase 10: entrenadores, horarios, reservas y mensajería -----------------------------------------------------

El catálogo de entrenadores ahora se obtiene de MongoDB. El administrador vincula
cada perfil a una cuenta existente y publica horarios. Los miembros de
**Premium individual o Premium familiar con membresía vigente** pueden reservar
citas y mantener conversaciones privadas con ese entrenador. Básico y Familiar
conservan sus rutinas generales; no incluyen este acompañamiento.

### Probar desde PowerShell y el navegador

1. Detén el proceso anterior con Ctrl+C y reinicia en la carpeta de estos cambios:

   ```powershell
   Set-Location 'C:\Users\USER\.codex\worktrees\0dce\Gym\backend'
   npm.cmd run start:demo
   ```

   Entrenadores, reservas y mensajes también funcionan con `npm.cmd start`;
   `start:demo` se necesita si quieres activar una membresía mediante pago simulado.
   Abre **http://127.0.0.1:3000/login.html**, o el puerto que tengas configurado.
2. La persona que será entrenadora debe tener una cuenta registrada de GymFlow.
   No hace falta convertirla en administrador ni darle una membresía personal.
3. Inicia sesión con tu administrador y busca **Mi cuenta → Administrar
   entrenadores y horarios**. Introduce el correo exacto de esa cuenta, nombre
   público, especialidad, descripción y una de las cinco fotos existentes.
   Marca **Habilitado para citas y mensajes** y pulsa **Crear entrenador**.
4. En **Publicar horario**, selecciona el entrenador y una fecha/hora de Bogotá.
   Usa una hora exacta, por ejemplo 10:00. Cada cita dura 60 minutos y debe comenzar
   entre 15 minutos y 90 días en el futuro. Publica cada horario por separado.
   Repetir entrenador y fecha recupera el mismo horario sin crear otro.
5. Entra con una cuenta que tenga Premium activo. Si aún no tiene membresía,
   solicita Premium y actívala con el administrador o el pago simulado. Una cuenta
   que ya tenga Básico o Familiar sigue sin poder cambiar de plan en esta fase;
   para probar puedes registrar una cuenta distinta y solicitar Premium.
6. En **Citas con entrenadores**, filtra el equipo y pulsa **Reservar esta cita**.
   Aparece en **Mis reservas** y deja de estar disponible. Una misma cuenta no
   puede reservar dos entrenadores a la misma hora. Toda la sesión debe quedar
   dentro de las fechas de su membresía; el límite final puede coincidir con su fin.
   La lista de horarios del miembro ya omite las citas que no caben completas en
   ese periodo; la agenda administrativa conserva todos los horarios.
7. En **Mensajes con entrenadores**, selecciona el entrenador y pulsa **Abrir
   conversación**. Puedes conversar sin tener una reserva. Escribe y pulsa
   **Enviar mensaje**; utiliza **Actualizar mensajes** para consultar respuestas.
8. Entra con la cuenta vinculada del entrenador. Aparece **Mi agenda de
   entrenador**, con sus citas y nombres de miembros, y **Mensajes de mis miembros**.
   Abre **Leer conversación** y usa **Enviar respuesta**. Para probar ambas cuentas
   simultáneamente utiliza sesiones de navegador independientes; dos pestañas del
   mismo perfil comparten la cookie de sesión.
9. Prueba **Cancelar mi reserva** antes de su inicio: libera el horario, incluso
   si el miembro perdió Premium. Un entrenador puede **Cancelar cita y cerrar
   horario** en su propia agenda. El administrador puede cerrar y volver a abrir
   horarios desde la agenda administrativa; cerrar cancela su cita vigente.

### Permisos, cancelación y recuperación

La vinculación es única por cuenta y permanece fija al editar el perfil. No cambia
el rol de `usuarios`: el portal exige que exista un perfil habilitado vinculado a
la sesión en cada petición. Administrar el equipo sigue requiriendo rol `admin`.
Un administrador no obtiene acceso a conversaciones ajenas por tener ese rol.
El catálogo público omite el usuario vinculado, correo, versiones y auditoría.
Los entrenadores ven únicamente sus reservas y conversaciones asignadas; el
administrador ve citas y nombres para gestionar la agenda, sin leer los mensajes.

Deshabilitar un entrenador retira su perfil, bloquea mensajes y el portal, cierra
sus horarios futuros y cancela sus reservas futuras en una sola transacción.
Los registros históricos permanecen. Volver a habilitarlo no restaura citas ni
abre horarios automáticamente. Los perfiles y horarios usan versión para detectar
ediciones obsoletas; una reserva o cancelación también incrementa la del horario.
No se pueden cambiar ni cancelar citas que ya comenzaron. Las citas terminadas
se presentan como finalizadas sin borrar su historial.

Las sesiones empiezan en horas exactas y duran una hora; así, los índices únicos
de reservas confirmadas por horario y por `(userId, inicio)` impiden solapamientos.
La disponibilidad, reserva y cancelación se escriben en transacciones, con bloqueo
del perfil al reservar/publicar/enviar para coordinarse con su deshabilitación.
Se requieren transacciones MongoDB, como en fase 9; no hay escrituras parciales
como alternativa. Referencias:
[transacciones del driver](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/),
[índices únicos parciales](https://www.mongodb.com/docs/manual/core/index-partial/).

Cada reserva lleva una clave UUID v4 por usuario. Ante respuesta perdida, reintentar
la misma clave recupera el resultado, incluso una reserva ya cancelada; no crea
otra ni cambia sus fechas. Antes de volver a reservar tras un fallo, consulta
**Mis reservas**. Las claves de la interfaz se conservan en memoria de esa pestaña.
La cancelación repetida devuelve la fecha y origen originales.

Solo los dos participantes pueden leer o enviar mensajes. Se exige que el perfil
esté habilitado y que la membresía del miembro siga siendo Premium vigente,
también cuando responde el entrenador. Si vence durante la consulta o escritura,
se bloquea la entrega o se revierte el envío. El historial de reservas propias
permanece accesible sin Premium para permitir su consulta y cancelación futura.
Los mensajes son texto de 1–2000 caracteres, insertado con `textContent`; no se
interpreta HTML. No se guardan en localStorage ni sessionStorage.

El envío usa una clave UUID v4 por conversación y autor. Una respuesta perdida
conserva en memoria la clave y el texto, bloquea su edición y muestra
**Reintentar el mismo mensaje**. Consultar mensajes confirma si se guardó. Si
abres otra conversación y vuelves, se restaura ese texto y la misma clave: el
reintento recupera el envío sin duplicarlo. Los intentos pendientes permanecen
solo en memoria y se limpian al perder acceso o vencer la membresía. Si
recargas y pierdes ese intento, revisa los últimos mensajes antes de escribirlo
otra vez. Es mensajería persistente con actualización manual, sin WebSocket,
notificaciones por correo/SMS, adjuntos, edición o borrado de mensajes.
No incluye sesiones grupales ni horarios recurrentes. Los beneficiarios familiares
y renovaciones se incorporaron en fase 11, descrita al comienzo de este documento.

### API y datos

Todos los listados usan 20 registros y `siguiente`, con cursor `despues` de 24
caracteres. Perfiles, horarios, reservas y conversaciones se recorren por ID
ascendente. Mensajes abre los 20 más recientes en orden de lectura; `siguiente`
permite recuperar el grupo anterior con **Ver mensajes anteriores**.

- `GET /api/entrenadores`: catálogo público habilitado.
- `GET/POST /api/admin/entrenadores`: listar o crear perfil con `correo`, `nombre`,
  `especialidad`, `descripcion`, `imagen` y `disponible`.
- `POST /api/admin/entrenadores/:id`: editar los campos públicos con `version`,
  sin cambiar la cuenta vinculada. El filtro de lista admite
  `disponibilidad=todas|disponibles|deshabilitados`.
- `GET /api/horarios`: exige Premium vigente; admite `entrenadorId` y devuelve
  solo horarios disponibles con al menos 15 minutos de antelación, que terminan
  dentro de la membresía vigente, y `accesoHasta`.
- `GET/POST /api/admin/horarios`: listar o publicar con `entrenadorId` e `inicio`
  ISO UTC exacto (`2026-10-06T15:00:00.000Z` representa 10:00 en Bogotá).
- `POST /api/admin/horarios/:id/abrir|cerrar`: recibe únicamente `version`.
- `GET /api/reservas`: reservas propias, con filtro `estado=confirmada|cancelada`.
- `POST /api/reservas`: recibe solo `horarioId` y `clave` UUID v4.
- `POST /api/reservas/:id/cancelar`: cancela una reserva propia, sin campos extra.
- `GET /api/admin/reservas`: agenda del gimnasio; admite `entrenadorId` y `estado`.
- `GET /api/entrenador/me`, `GET /api/entrenador/reservas` y
  `POST /api/entrenador/reservas/:id/cancelar`: perfil y agenda asignados.
- `GET/POST /api/conversaciones`: listar las propias o abrir con `entrenadorId`.
- `GET /api/entrenador/conversaciones`: conversaciones asignadas al entrenador.
- `GET/POST /api/conversaciones/:id/mensajes`: consultar o enviar con solo `texto`
  y `clave` UUID v4. El autor se obtiene de la sesión.

Colecciones nuevas: `entrenadores`, `horarios`, `reservas`, `conversaciones` y
`mensajes`. Se conservan instantáneas de nombres y fechas para el historial,
estado y actores de cancelación. Los DTO omiten claves, autores de auditoría e IDs
de participantes; el listado administrativo de perfiles incluye `usuarioId` para
identificar la vinculación. Las APIs mantienen validación estricta, origen de POST,
sesión, respuestas sin caché y errores 400/401/403/404/409/503 sin detalles del driver.

## Si el inicio de sesión falla y /health devuelve 503

`{"status":"error","database":"unavailable"}` confirma que HTTP responde,
pero falló el ping a MongoDB. No comprueba la contraseña de GymFlow. El servidor
debe poder consultar `usuarios` y guardar `sesiones` antes de completar un login.

En otra ventana de PowerShell, sin detener el backend, ejecuta:

```powershell
Set-Location 'C:\Users\USER\.codex\worktrees\0dce\Gym\backend'
npm.cmd run diagnose:db
```

Este comando usa el `.env` de esta carpeta, comprueba ping y lectura de usuarios
y cierra la conexión. No crea cuentas, sesiones, pedidos ni índices, y no muestra
la URI, contraseñas, hosts del clúster ni mensajes internos del driver. La salida
puede compartirse para identificar la causa; el diagnóstico no prueba permisos
de escritura ni cambia tu configuración. Tiene un límite total de 20 segundos.

El arranque solo anuncia la URL cuando el servidor escucha correctamente. Si el
puerto está ocupado muestra ese motivo; detén el backend anterior con Ctrl+C o
usa otro puerto para esa sesión y abre la web en ese mismo puerto:

```powershell
$env:PORT = '3001'
npm.cmd run start:demo
```




## Fase 11: beneficiarios familiares y renovación de membresías -----------------------------------------------------

En **Mi cuenta** se incorporaron **Mi grupo familiar**, **Renovar membresía**,
el historial de periodos propios y **Administrar renovaciones** para administradores.
Queda **una fase** del alcance de primera versión: **12**, validación integral,
revisión de acceso, comprobaciones con Atlas y preparación del despliegue.

### Probar desde PowerShell

Detén el backend anterior con Ctrl+C y reinicia en la carpeta de estos cambios:

```powershell
Set-Location 'C:\Users\USER\.codex\worktrees\0dce\Gym\backend'
npm.cmd run start:demo
```

Abre **http://127.0.0.1:3000/login.html**, o el puerto configurado. Los grupos y
la aprobación administrativa de renovaciones también funcionan con `npm.cmd start`.
`start:demo` permite además simular el pago; no realiza cobros reales.
Esta fase no crea beneficiarios, invitaciones ni periodos de ejemplo en Atlas.

### Beneficiarios: titular y hasta cuatro cuentas adicionales

1. Usa un titular con **Familiar** o **Premium familiar** vigente. La otra persona
   debe registrar su propia cuenta; el titular nunca introduce su contraseña.
2. En **Mi grupo familiar**, introduce el correo de esa cuenta y pulsa **Invitar
   al grupo familiar**. Las invitaciones pendientes ocupan un cupo. El máximo es
   cinco personas en total, incluido el titular, también con solicitudes simultáneas.
3. Entra con la cuenta invitada y pulsa **Aceptar invitación familiar**.
   Antes de aceptar no tiene acceso por el grupo. Puede rechazar la invitación.
4. El beneficiario hereda las fechas y el acceso del titular: **Familiar** habilita
   rutinas; **Premium familiar** añade reservas y conversaciones privadas.
   El vencimiento del titular bloquea el acceso de todos sus beneficiarios.
   Su renovación restablece automáticamente el acceso de los vínculos aceptados.
5. El titular puede **Retirar invitación** o **Retirar beneficiario**. Cada
   beneficiario puede **Salir del grupo familiar**, incluso si el grupo venció.
   Retirar un vínculo activo revoca el acceso y cancela sus citas futuras, liberando
   los horarios cuyo entrenador sigue habilitado; los demás quedan cerrados.
   No se cancelan citas que ya comenzaron ni se borra el historial o los mensajes.
6. Para probar cuentas a la vez utiliza perfiles/sesiones de navegador independientes;
   las pestañas de un mismo perfil comparten la cookie de sesión.

Una cuenta no puede pertenecer a dos grupos simultáneamente ni aceptar mientras
mantenga una solicitud propia pendiente, una membresía propia vigente o un grupo
con integrantes. Una invitación pendiente no impide solicitar una membresía propia,
pero entonces no podrá aceptarse. Una membresía propia vencida y sin integrantes
permite aceptar. Un beneficiario activo debe salir antes de solicitar acceso propio
o renovar una membresía propia anterior. Las acciones de vínculo requieren su
versión actual, para evitar aceptar una invitación distinta desde una pantalla antigua.

El titular ve nombres, correos y estados de sus integrantes. El invitado o
beneficiario ve solo su vínculo y el nombre/plan/vigencia del titular. No recibe
comprobantes ni historial de pagos del titular, datos de otros beneficiarios o roles.
El titular tampoco puede leer conversaciones privadas de sus beneficiarios.
No se crean copias de la membresía para cada persona: rutinas, reservas y mensajes
resuelven el vínculo vigente en el servidor y vuelven a comprobar el acceso.

### API, almacenamiento y compatibilidad

- `GET /api/familia`: grupo propio o invitación/vínculo de la cuenta autenticada.
- `POST /api/familia/invitaciones`: solo `correo` de una cuenta existente.
- `POST /api/familia/aceptar` y `/api/familia/salir`: solo `version` del vínculo propio.
- `POST /api/familia/miembros/:id/retirar`: solo `version`; exige ser su titular.
- `GET/POST /api/renovaciones`: listado propio o solicitud con solo `clave` UUID v4.
- `POST /api/renovaciones/:id/cancelar`: sin datos adicionales, solo del titular.
- `POST /api/renovaciones/:id/pago-simulado`: solo `resultado=aprobado|rechazado`,
  del titular y solo en desarrollo con demo habilitado.
- `GET /api/admin/renovaciones`: listado administrativo, filtrable por
  `estado=pendiente|aplicada|cancelada`.
- `POST /api/admin/renovaciones/:id/aprobar`: administrador, sin datos adicionales.
- `GET /api/membresia/historial`: periodos de la membresía propia de la sesión.

