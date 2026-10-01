# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

GymFlow / GymWeb: a gym website (academic project, built in phases called "Avances"/"Fases"). All UI text, API messages, comments, docs and MongoDB collection/field names are in **Spanish** — keep new code consistent with that (`usuarios`, `sesiones`, `nombre`, `correo`, `passwordHash`, ...).

- **Frontend** lives in the repo root: plain HTML pages (`index.html`, `registro.html`, `login.html`, `micuenta.html`), one `style.css`, one `web.js`, and `img/`. No build step, no framework.
- **Backend** lives in `backend/`: Node.js (>=22.13, ESM), Express 5, official `mongodb` driver 7. No Mongoose, no dotenv, no Docker. Database is MongoDB Atlas, db name `GymWeb`.

`backend/README.md` is the detailed phase-by-phase spec (Spanish) — read it before changing auth/registration behavior.

## Commands

All run from `backend/`:

```powershell
npm ci                 # install
npm start              # node src/server.js — serves on http://127.0.0.1:3000
npm run dev            # node --watch (restart manually after editing .env)
npm test               # node --test (built-in runner, picks up test/*.test.js)
node --test test/auth.test.js                         # single file
node --test --test-name-pattern="rotación" test/      # single test by name
npm run verify:atlas   # real end-to-end check against Atlas; creates and deletes a temp user
```

`npm test` uses an in-memory fake database and never touches Atlas. `verify:atlas` requires a configured `backend/.env` (copy from `.env.example`; `MONGODB_URI`, `MONGODB_DB`, optional `MONGODB_DNS_SERVERS`, `HOST`, `PORT`). `config.js` loads `.env` via Node's native `process.loadEnvFile`; real env vars take precedence.

## Architecture

**Express serves the frontend.** Registration/login/account only work when the pages are opened through `http://127.0.0.1:3000/...` (same origin, no CORS), not via Live Server or `file://`. `backend/src/app.js` serves root files from an **explicit allowlist** (`index.html`, `registro.html`, `login.html`, `style.css`, `experiencia.css`, `web.js`) plus the `/img`, `/js` and `/assets` directories. A new root page or asset must be added to that list or it will 404. `micuenta.html` is served separately behind `requireUser` (redirects to `/login.html` without a session).

**Database is injected.** `createApp(database)` receives an object with methods (`ping`, `createUser`, `findUserByEmail`, `createSession`, `findSessionUser`, `deleteSession`, `close`). `src/database.js` implements it with the Mongo driver (lazy client, indexes created on first use: unique `usuarios.correo`, TTL on `sesiones.expiresAt`). Tests pass a hand-written fake with the same methods — when adding a DB method, update the fakes in `backend/test/*.test.js` too.

**Auth (`src/auth.js`)**: `setupAuth(app, database)` registers `/api/login`, `/api/me`, `/api/logout`, an `/api` middleware that rejects cross-origin POSTs and sets `no-store`, and returns the `requireUser` middleware. Sessions: random 32-byte token in an HttpOnly, SameSite=Strict `gym_session` cookie; only its SHA-256 is stored in `sesiones` with `userId` and `expiresAt` (8h). Login rate limit (10/IP/15 min, 4 concurrent) is in-memory. Unknown-email logins still run scrypt against a dummy hash to keep timing uniform; error messages don't distinguish bad email vs bad password.

**Registration (`src/registration.js`)**: `validateRegistration` (trim, lowercase email, length limits) and scrypt hashing (`scrypt$N$r$p$salt$hash` format, N=32768) with `timingSafeEqual` verification. `POST /api/usuarios` returns 201/400/409 (duplicate via Mongo error 11000)/429/503. Registration does not log the user in.

**Security conventions to preserve**: never leak driver errors or the URI in responses (generic 503 messages), no tokens in `localStorage`, server binds to localhost only, no trust of forwarded headers.

**3D home page (`index.html` + `experiencia.css` + `js/` + `assets/`)**: ES modules, no build step. Three.js 0.170 comes from jsDelivr through the import map in `index.html`. An inline script in `<head>` adds `html.con-3d` only when WebGL2 is available, and every 3D layout rule is scoped under `.con-3d`. Without that class, the page falls back to the original flat design. `js/principal.js` boots `recorrido.js` (area tabs and the machine detail panel; no Three.js dependency) and the side chapter index. It then dynamically imports `experiencia.js`. If that import fails, it removes `con-3d`.
- `experiencia.js`: orchestrator. It loads assets (`recursos.js`, with real progress on the loader), builds the scene, and runs `renderer.compileAsync` **while the composer's render target is bound**, so it compiles the same shader variants that get drawn. Post chain: Render → GTAO (high tier only) → Bloom → Output → `post.js` finish pass. The camera follows scroll by interpolating between "shots" (`TOMAS`, keyed by element id). Shots exist for the 2D sections, for the `.intro-escena` spacers before them, and for each area inside the tall, sticky `#recorrido`. `desplaz` shifts the subject through `setViewOffset`. `panoramicaMovil` replaces a shot with a two-anchor pan on narrow screens. Override priority each frame: map > open detail panel (`enfoque`) > scroll.
- **3D → 2D transition**: `calcularVelo()` computes `v ∈ [0,1]` per 2D section, sets `--v` and a viewport-aligned `clip-path` on the section, and feeds the same value to the `post.js` shader (diagonal red sweep plus blur/darkening behind it). The line `x = 1.4·v − 0.4·(distance from top)` must stay identical in both places.
- `escenario.js`: room, lights, signage, plans showroom, team wall (photos and names read from the `#entrenadores`/`#planes` DOM), store, equipment placement (`colocar(id, …)` creates `anclas[id]` + floor selector ring) and map zone rectangles. **Keep the light count low**: every `RectAreaLight`/spot/point light is unrolled into every lit shader and multiplies compile time (D3D/ANGLE on Windows is especially slow).
- `modelos.js`: procedural equipment + PBR materials (`materiales(recursos)` is cached on first call). `texturas.js`: canvas textures, also used as fallbacks when an asset fails to load. `texto3d.js`: extruded Anton letters (`assets/fuentes/anton.json`, typeface format) and floor-painted labels. Backlit letters use a dark albedo plus emissive, because white albedo reflects the bright HDRI and blows out the bloom.
- `mapa.js`: top-down view. It hides the ceiling (`gym.techo`), opens up the fog, raises exposure, and projects HTML zone/machine buttons. Choosing a zone calls `recorrido.irArea(i, { instantaneo: true })` and the camera damping does the descent.
- `maquinas.js`: data contract. An `id` in `MAQUINAS` must match a `colocar(id, …)` call in `escenario.js`. `musculos` IDs must match the muscle meshes in `anatomia.js`. `AREAS[].plano` is the zone rectangle on the floor.
- `productos.js`: a second, transparent, overlay canvas (`#vitrina-3d`, `pointer-events: none`) that draws each product inside its `.producto-3d` slot using viewport + scissor. `crearProducto(tipo)` is reused by the store shelves. The product `<img>` stays in the DOM because `web.js` reads it for the cart thumbnail.
- `anatomia.js`: holographic figure (fresnel shell + solid muscles) in its own renderer inside the detail panel. Loaded lazily the first time a panel opens.
- `assets/`: CC0 PBR textures from Poly Haven (`_arm` = AO/roughness/metalness), the `gym_01` HDRI, and the converted Anton font. Licenses are listed in `assets/CREDITOS.md`.
- Load timing is recorded with `performance.mark("gym:…")` (recursos, construido, compilado, primer-cuadro).

**Frontend (`web.js`)**: a single script loaded by every page with `defer`. On `DOMContentLoaded` it calls each `setup*` function (scroll animations, membership buttons, product cart, auth forms, account page); each one feature-detects its page by querying for its root element and returns early if absent. The cart is client-side only (a `Map`, DOM built in JS). Auth forms decide register vs login by presence of `#confirmar-password`. Memberships/planes are not implemented in the backend yet.
