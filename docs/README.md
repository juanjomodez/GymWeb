# DocumentaciónBD

Nombre del proyecto: Gym Flow
Integrantes: Juan Jose Mosquera Bermudez - Santiago Lopez Gomez - Alejandro Pantoja Obando - Jesus David Albarracin Ortega - Yeferson David Casso Ruiz

Definición del problema:
Muchos gimnasios todavia gestionan procesos como la inscripción de usuarios, la compra de membresias, 
la reserva de entrenadores y la consulta de rutinas de manera presencial o mediante diferentes plataformas, 
lo que puede generar desorganizacion y dificultar el acceso a la informacion por parte de los usuarios.

Por esta razón, se propone el desarrollo de una plataforma web para GymFlow (gimnasio ficticio) que permita centralizar 
estos procesos en un solo sistema, facilitando la gestión de membresías, entrenamientos, reservas y 
compras de productos relacionados con el gimnasio.

Objetivo General:
Desarrollar una plataforma web para GymFlow que permita a los usuarios gestionar sus membresias, consultar rutinas de entrenamiento, 
reservar entrenadores y adquirir productos deportivos de manera sencilla y centralizada.

Objetivos especificos:
- Permitir el registro e inicio de sesion de usuarios.
- Facilitar la consulta y compra de planes de membresia.
- Mostrar informacion sobre la membresia activa y el tiempo restante de vigencia.
- Permitir la activacion o desactivacion de la renovación automatica de la membresía.
- Ofrecer acceso a rutinas de entrenamiento organizadas segun diferentes objetivos.
- Permitir la reserva de horarios con entrenadores.
- Implementar un sistema de compra de productos deportivos dentro de la plataforma.
- Permitir que los usuarios conozcan las maquinas existentes en el gimnasio y sus funciones.
- Diseñar una interfaz accesible, legible e intuitiva que facilite la navegacion y el uso de la plataforma para diferentes tipos de usuarios.

Alcance:
La plataforma permitira a los usuarios registrarse, iniciar sesion y acceder a diferentes funcionalidades relacionadas 
con los servicios del gimnasio, tambien los usuarios podran adquirir membresias, consultar su estado, gestionar la renovacion automatica, 
visualizar rutinas de entrenamiento, reservar entrenadores y comprar productos deportivos.

Además, la plataforma incluirá un módulo de consulta de entrenadores donde se mostrarán sus especialidades, permitiendo a los usuarios identificar
el profesional más adecuado según sus objetivos de entrenamiento. 
Tambien se desarrollará un modulo interactivo para visualizar las diferentes máquinas del gimnasio mediante modelos 3D.
acompañado de información sobre su funcionamiento y los grupos musculares que trabajan.
El proyecto se enfocará en el desarrollo de una aplicación web funcional y no incluira funciones de pago reales ni sistemas externos de control de a
cceso físico al gimnasio.

Historias de Usuario(HU):
# HU-01 Registro de usuario
Como visitante, quiero registrarme en la plataforma para crear una cuenta y acceder a los servicios de GymFlow.
Criterios de aceptacion:
- El usuario debe poder ingresar su nombre, correo y contraseña.
- El sistema debe verificar que los campos obligatorios estén completos.
- El correo no debe estar registrado previamente.
- Al completar correctamente el registro, la cuenta debe quedar almacenada en la base de datos.
- El usuario debe poder iniciar sesión posteriormente con sus datos.

# HU-02 Inicio de sesion
Como usuario registrado, quiero iniciar sesion para acceder a mi cuenta y a las funcionalidades privadas de la plataforma.
Criterios de aceptacion:
- El usuario debe ingresar correo y contraseña.
- El sistema debe validar que las credenciales sean correctas.
- Si los datos son incorrectos, debe mostrarse un mensaje de error.
- Si los datos son correctos, el usuario debe poder acceder a su cuenta.
- Las secciones privadas no deben estar disponibles para usuarios que no hayan iniciado sesión.

# HU-03 Consulta de membresia
Como usuario registrado, quiero consultar mi membresia para conocer el plan que tengo activo, su estado y el tiempo restante.
Criterios de aceptacion:
- La plataforma debe mostrar el nombre del plan contratado.
- Debe indicar si la membresía está activa o vencida.
- Debe mostrar la fecha de inicio y de finalizacion.
- Debe indicar el tiempo restante de la membresía.
- La informacion mostrada debe corresponder al usuario que inició sesion.

# HU-04 Compra de membresía
Como usuario registrado, quiero consultar los planes disponibles y seleccionar uno para adquirir una membresia que se adapte a mis necesidades.
Criterios de aceptacion:
- El usuario debe poder visualizar los diferentes planes disponibles.
- Cada plan debe mostrar su precio y características principales.
- El usuario debe poder seleccionar el plan que desea adquirir.
- La compra será simulada, sin utilizar una pasarela de pago real.
- Al completar la compra, la membresía debe quedar asociada a la cuenta del usuario.

# HU-05 Renovación automática
Como usuario con una membresia activa, quiero activar o desactivar la renovacion automática para decidir si deseo continuar con mi plan cuando finalice.
Criterios de aceptacion:
- El usuario debe poder consultar el estado actual de la renovación automática.
- Debe existir una opcion para activarla o desactivarla.
- El cambio debe quedar guardado en la información del usuario.
- El estado actualizado debe mostrarse inmediatamente en la plataforma.


# HU-06 Consulta de rutinas
Como usuario registrado, quiero consultar rutinas de entrenamiento para encontrar ejercicios relacionados con mis objetivos fisicos.
Criterios de aceptacion:
- El usuario debe poder visualizar las rutinas disponibles.
- Cada rutina debe mostrar información básica sobre los ejercicios.
- Las rutinas pueden estar organizadas según objetivos como fuerza, hipertrofia, resistencia o pérdida de grasa.
- El usuario debe poder consultar los detalles de una rutina seleccionada.

# HU-07 Consulta de entrenadores
Como usuario, quiero consultar los entrenadores disponibles para conocer sus especialidades y elegir el que mejor se adapte a mis objetivos.
Criterios de aceptacion:
- La plataforma debe mostrar los entrenadores disponibles.
- Cada entrenador debe tener nombre, imagen y especialidad.
- El usuario debe poder conocer informacion básica de cada entrenador.
- Los entrenadores deben tener horarios disponibles para realizar reservas.

# HU-08 Reserva de entrenador
Como usuario registrado, quiero reservar un horario con un entrenador para recibir acompañamiento durante mi entrenamiento.
Criterios de aceptacion:
- El usuario debe seleccionar un entrenador.
- Debe poder consultar sus horarios disponibles.
- Debe seleccionar una fecha y hora disponible.
- El sistema no debe permitir reservar un horario que ya se encuentre ocupado.
- Una vez realizada la reserva, esta debe quedar asociada tanto al usuario como al entrenador.
- El usuario debe poder consultar sus reservas.

# HU-09 Compra de productos
Como usuario registrado, quiero comprar productos deportivos dentro de la plataforma para complementar mi entrenamiento.
Criterios de aceptacion:
- El usuario debe poder visualizar los productos disponibles.
- Cada producto debe mostrar nombre, imagen, descripción y precio.
- El usuario debe poder agregar productos al carrito.
- Debe poder modificar la cantidad o eliminar productos antes de realizar la compra.
- El sistema debe calcular el valor total del carrito.
- La compra sera simulada y no utilizara pago real.

# HU-10 Gestion del carrito
Como usuario, quiero administrar los productos de mi carrito para revisar mi compra antes de finalizarla.
Criterios de aceptacion:
- El usuario debe poder visualizar los productos agregados.
- Debe poder aumentar o disminuir cantidades.
- Debe poder eliminar productos.
- El precio total debe actualizarse automáticamente.
- El carrito debe indicar cuando no contiene productos.

# HU-11 Cierre de sesion
Como usuario autenticado, quiero cerrar sesion para finalizar de manera segura mi acceso a la plataforma.
Criterios de aceptacion:
- Debe existir una opción visible para cerrar sesion.
- Al cerrar sesion, el usuario debe perder el acceso a las vistas privadas.
- Para volver a acceder a su cuenta deberá iniciar sesion nuevamente.

# HU-12 Consulta de maquinas del gimnasio
Como usuario, quiero visualizar las máquinas del gimnasio para conocer su funcionamiento y aprender a utilizarlas correctamente.
Criterios de aceptacion:
- El usuario debe poder visualizar modelos 3D de las máquinas disponibles.
- Cada máquina debe incluir una descripción de su uso.
- Debe mostrarse información sobre los grupos musculares trabajados.

# HU-13 Accesibilidad y usabilidad
Como usuario, quiero que la plataforma sea fácil de leer y utilizar para poder acceder a la informacion y realizar mis actividades sin dificultad.
Criterios de aceptacion:
- Los textos deben tener un tamaño adecuado para su lectura.
- Debe existir suficiente contraste entre los colores del texto y el fondo.
- Los botones y enlaces deben ser fácilmente identificables.
- La navegación debe ser clara e intuitiva.
- La plataforma debe adaptarse correctamente a dispositivos móviles y de escritorio.
- Los formularios deben mostrar etiquetas claras para cada campo de entrada.

Arquitectura general
La arquitectura del sistema estará compuesta por tres capas principales:

Frontend: desarrollado con HTML5, CSS3 y JavaScript, encargado de la interfaz grafica y la interaccion con el usuario.

Backend: desarrollado con Node.js y Express, encargado de la logica del negocio, autenticación de usuarios y gestión de la informacion.

Base de datos: MongoDB, utilizada para almacenar usuarios, membresias, reservas, rutinas y productos.

Comunicacion: el frontend se comunicará con el backend mediante una API REST, mientras que el backend realizara 
las operaciones de consulta y almacenamiento en MongoDB.

Acceso a MongoDB Atlas
En Atlas, abre el proyecto de Gym y confirma que el clúster esté activo. En Security → Database Access, verifica que el usuario de base de datos tenga acceso a GymWeb; en Security → Network Access, autoriza la IP pública desde la que se ejecutará el backend.

En el clúster, selecciona Connect → Drivers → Node.js y copia la URI de conexión. Configúrala localmente en backend/.env junto con MONGODB_DB=GymWeb. No incluyas contraseñas ni URI reales en este README.

Desde PowerShell, instala dependencias la primera vez y luego inicia el backend:

cd backend
npm ci # Solo la primera vez
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
npm start

En .env, agrega la URI y MONGODB_DB=GymWeb antes de iniciar el servidor. El comando conserva un .env ya configurado.

Abre http://127.0.0.1:3000/health. Una respuesta HTTP 200 con {"status":"ok","database":"connected"} confirma el ping a MongoDB. Un HTTP 503 indica que se debe revisar la URI, el usuario, los permisos, la IP autorizada, el clúster y la conectividad de red.

Para consultar los documentos en Atlas, abre Database → Data Explorer, selecciona la base GymWeb y luego la colección que quieras revisar. Un ping exitoso confirma conexión, pero no demuestra por sí solo que existan documentos o que haya permisos de escritura.

Diagramas ER
Los diagramas están en la carpeta docs/: ER actual y ER propuesto. Sus archivos editables son modelo actual y modelo propuesto.
