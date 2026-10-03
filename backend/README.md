# Gym — Avance 1

## Fase 8: productos administrables y carrito conectado

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
de existencias se incorporarán en fase 9.

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

### Validación y fases restantes

`npm.cmd test` pasa **58 pruebas locales** (47 anteriores y 11 nuevas). Comprueban
inicialización sin sobrescritura, autorización y revocación, validación/inyección,
auditoría, concurrencia, paginación, deshabilitación, cotización, existencias y
fallos seguros. Usan los métodos reales de `database.js` con un doble local, sin
leer `.env` ni escribir en Atlas. En el navegador se verificó crear, editar,
deshabilitar y habilitar, además de actualizar el carrito tras cambiar precio y
stock. La comprobación contra el clúster real sigue pendiente.

Para cerrar una primera versión con pagos simulados, se propone este alcance
restante. La estimación es de **cuatro fases después de la fase 8**:

| Fase | Alcance propuesto | Estado |
| --- | --- | --- |
| 9 | Pedidos de productos, pago simulado, historial y control de existencias | Pendiente |
| 10 | Gestión de entrenadores, horarios, reservas y comunicación | Pendiente |
| 11 | Beneficiarios de planes familiares y renovación de membresías | Pendiente |
| 12 | Validación integral, revisión de acceso, comprobación de Atlas y preparación del despliegue | Pendiente |

Este es un plan de cierre propuesto, no un total previamente acordado. Una pasarela
de pagos reales y sus requisitos quedarían fuera de esta primera versión. Publicar
el sitio dependerá de elegir el alojamiento y su configuración.

## Fase 7: pago simulado para probar las rutinas

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

### Validación

`npm.cmd test` pasa **47 pruebas locales**: las 35 anteriores y 12 sobre pagos
simulados. Comprueban los cuatro planes, configuración, sesión, origen, aislamiento
por usuario, validación de datos, rechazo/aprobación, concurrencia, competencia con
el administrador, respuesta perdida, comprobante público y vencimiento. Usan los
métodos reales de `database.js` con un doble local del driver; no cargan `.env` ni
escriben en Atlas. También se comprobó en el navegador el bloqueo pendiente, el
rechazo y la aprobación con acceso automático a una rutina ficticia en memoria.
La comprobación de esta fase contra el clúster real queda pendiente.

## Fase 6: rutinas generales con acceso por membresía

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
versiones. Asignación personalizada, entrenadores, reservas y renovaciones siguen
fuera del alcance.

### Validación y comprobación opcional de Atlas

`npm.cmd test` ejecuta 35 pruebas locales, incluidas las fases anteriores. Esta fase
comprueba autorización, todos los planes, vencimiento exacto y durante una consulta,
rutinas deshabilitadas, validación/inyección, proyección de datos, concurrencia,
filtros/paginación, revocación de rol, origen externo y fallos seguros. Se ejecutan
los métodos reales de `database.js` con un doble local del driver, sin cargar `.env`
ni escribir en Atlas. También se comprobó crear, editar, deshabilitar, habilitar,
leer y bloquear por vencimiento desde el navegador con datos ficticios en memoria.

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

## Fase 5: activación administrativa y vencimiento

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
fechas y unicidad por usuario; no admite reactivación ni otra solicitud. No se incluyen
renovación, cambio de plan, cancelación, pagos reales, reservas ni beneficiarios.
Las rutinas generales se incorporaron en fase 6 y el pago simulado en fase 7.

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

### Validación de esta fase

`npm test` funciona sin `.env` ni Atlas. Comprueba permisos, revocación, solicitudes
falsificadas, fin de mes/año bisiesto, simultaneidad, respuesta perdida y reintento,
vencimiento exacto, persistencia, filtros, paginación y errores seguros. Ejecuta los
métodos reales de `database.js` con un doble local del driver; no demuestra por sí
solo el comportamiento del clúster real.

Si autorizas escribir datos de prueba en Atlas, puedes ejecutar:

```powershell
npm run verify:atlas -- --with-admin
```

Crea una cuenta normal y un administrador **temporales propios**, comprueba el rechazo
del rol enviado en registro, permisos, activaciones concurrentes, reintentos y vencimiento
con un reloj de prueba, y limpia sus cuentas, sesiones y membresía. No activa ni promueve
usuarios existentes. Evita el listado administrativo para no actualizar membresías reales
vencidas; ese listado se prueba localmente. La carga del catálogo sigue usando upsert y
los índices/colecciones quedan creados. El comando sin `--with-admin` conserva las
comprobaciones anteriores. Ninguno se ejecutó contra Atlas durante esta implementación.

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
por lo que solo permite una membresía por usuario, pendiente, activa o vencida, incluso
con peticiones simultáneas. No implementa todavía historial, renovación,
cambio de plan ni cancelación. La activación se incorporó en fase 5. Las condiciones del plan se copian
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
- `src/memberships.js`: fechas, acceso y endpoints administrativos.
- `src/routines.js`: validación y permisos de rutinas para administradores y miembros.
- `src/products.js`: catálogo público, cotización de carrito y administración de productos.
- `src/simulated-payments.js`: pago de membresías simulado y exclusivo de desarrollo.
- `scripts/prepare-admin.js`: preparación explícita de un administrador de desarrollo.
- `test/health.test.js`: pruebas HTTP y fallo del driver real.

Colecciones actuales: `usuarios`, `sesiones`, `planes`, `membresias`, `rutinas` y
`productos`. Próximas fases: pedidos y reservas de entrenadores, según el alcance
propuesto arriba, con validación y autenticación.
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
