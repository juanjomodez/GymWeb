import express from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { hashPassword, validateRegistration } from './registration.js';
import { setupAuth } from './auth.js';
import { setupMemberships } from './plans.js';

const frontend = fileURLToPath(new URL('../../', import.meta.url));

export function createApp(database) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '8kb' }));
  const requireUser = setupAuth(app, database);
  setupMemberships(app, database, requireUser);
  app.get('/micuenta.html', requireUser, (_req, res) => res.sendFile(path.join(frontend, 'micuenta.html'), { dotfiles: 'allow' }));

  // Lista explícita: nunca servir backend/, .env ni archivos internos.
  for (const file of ['index.html', 'registro.html', 'login.html', 'style.css', 'experiencia.css', 'web.js']) {
    app.get(`/${file}`, (_req, res) => res.sendFile(path.join(frontend, file), { dotfiles: 'allow' }));
  }
  app.get('/', (_req, res) => res.sendFile(path.join(frontend, 'index.html'), { dotfiles: 'allow' }));
  app.use('/img', express.static(path.join(frontend, 'img'), { dotfiles: 'deny' }));
  app.use('/js', express.static(path.join(frontend, 'js'), { dotfiles: 'deny' }));
  app.use('/assets', express.static(path.join(frontend, 'assets'), { dotfiles: 'deny' }));

  let activeRegistrations = 0;
  app.post('/api/usuarios', async (request, response) => {
    response.set('Cache-Control', 'no-store');
    const input = validateRegistration(request.body);
    if (!input) return response.status(400).json({ message: 'Revisa nombre (2–100 caracteres), correo y contraseña (8–128 caracteres).' });
    // Limita el trabajo concurrente de hash en este servidor inicial.
    if (activeRegistrations >= 4) return response.status(429).json({ message: 'Hay muchas solicitudes. Intenta nuevamente en unos segundos.' });
    activeRegistrations++;
    try {
      const passwordHash = await hashPassword(input.password);
      const user = await database.createUser({
        nombre: input.nombre, correo: input.correo, passwordHash,
        createdAt: new Date(),
      });
      response.status(201).json({ message: 'Cuenta creada correctamente.', usuario: user });
    } catch (error) {
      if (error.code === 11000) return response.status(409).json({ message: 'Ya existe una cuenta con ese correo.' });
      response.status(503).json({ message: 'No se pudo guardar la cuenta. Intenta más tarde.' });
    } finally {
      activeRegistrations--;
    }
  });

  app.get('/health', async (_request, response) => {
    response.set('Cache-Control', 'no-store');
    try {
      await database.ping();
      response.status(200).json({ status: 'ok', database: 'connected' });
    } catch {
      // No exponer mensajes del driver: pueden contener datos de conexión.
      response.status(503).json({ status: 'error', database: 'unavailable' });
    }
  });

  app.use((error, _request, response, _next) => {
    const status = error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : 500;
    response.status(status).json({ message: status === 413 ? 'La solicitud es demasiado grande.' : status === 400 ? 'JSON inválido.' : 'Error interno.' });
  });
  return app;
}
