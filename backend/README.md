# Backend de GymWeb

API inicial de Express conectada a MongoDB mediante Mongoose. La base de datos se llama `GymWeb` tanto en MongoDB local como en Atlas.

## Configuración

1. Instala Node.js LTS y npm.
2. En esta carpeta, instala las dependencias con `npm install`.
3. Copia `.env.example` como `.env`.
4. En Atlas, crea un usuario de base de datos dedicado a `GymWeb` con el rol `readWrite` únicamente sobre esa base. Usa la opción **Connect your application** para obtener la URI.
5. En `backend/.env`, reemplaza `MONGODB_URI` con la URI de Atlas. La aplicación selecciona `GymWeb` usando `MONGODB_DATABASE`.
6. En la lista de acceso IP de Atlas, agrega la IP de cada equipo que ejecutará el backend. No abras el acceso a todas las IP.
7. No subas `.env` a GitHub ni publiques la contraseña en el repositorio o en chats compartidos.
8. Inicia la API con `npm run dev`.
9. Abre `http://localhost:3000/health`. Debe responder con `status: "ok"` y `database: "GymWeb"`.

Para MongoDB local, deja `MONGODB_URI=mongodb://127.0.0.1:27017`. `MONGODB_DATABASE` selecciona la base utilizada por Mongoose.

## Trabajo sugerido para el equipo

- **Compañero 1:** diseñar y documentar los modelos Mongoose para usuarios y autenticación; comenzar por el esquema de usuario y validaciones.
- **Compañero 2:** crear modelos y datos de prueba para planes, membresías y rutinas.
- **Compañero 3:** proponer los modelos de productos y reservas de entrenadores, con sus relaciones y validaciones.
- **Integración:** acordar nombres de campos y colecciones antes de conectar formularios del frontend a las rutas de la API.

Cada compañero puede trabajar en una rama y entregar un pull request para revisión antes de integrar cambios.

Cada desarrollador necesita su propio archivo local `backend/.env`. Atlas ya tiene un usuario con rol administrativo global; no lo reutilices para la aplicación. Usa usuarios separados con acceso limitado a `GymWeb`.
