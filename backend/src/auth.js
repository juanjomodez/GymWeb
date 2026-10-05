import { randomBytes, createHash } from 'node:crypto';
import { hashPassword, verifyPassword } from './registration.js';

const cookieName = 'gym_session';
const duration = 8 * 60 * 60 * 1000;
const tokenHash = token => createHash('sha256').update(token).digest('hex');

export function requireAdmin(request, response, next) {
  if (request.user.rol !== 'admin') return response.status(403).json({ message: 'Se requieren permisos de administrador.' });
  next();
}

function readToken(request) {
  const value = (request.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  return /^[a-f0-9]{64}$/.test(value || '') ? value : null;
}

export function setupAuth(app, database) {
  const attempts = new Map();
  let active = 0;
  // Mismo trabajo criptográfico para correos inexistentes.
  const dummyHash = hashPassword(randomBytes(32).toString('hex'));
  const options = request => ({ httpOnly: true, sameSite: 'strict', secure: request.secure, path: '/' });

  app.use('/api', (request, response, next) => {
    response.set('Cache-Control', 'no-store');
    if (request.method === 'POST' && request.headers.origin && request.headers.origin !== `${request.protocol}://${request.get('host')}`) {
      return response.status(403).json({ message: 'Origen no permitido.' });
    }
    next();
  });

  app.post('/api/login', async (request, response) => {
    const { correo, password } = request.body || {};
    if (typeof correo !== 'string' || typeof password !== 'string' || correo.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim()) || password.length < 8 || password.length > 128) {
      return response.status(400).json({ message: 'Introduce un correo válido y una contraseña de 8–128 caracteres.' });
    }
    const now = Date.now();
    for (const [key, entry] of attempts) if (entry.until <= now) attempts.delete(key);
    const key = request.ip;
    const entry = attempts.get(key) || { count: 0, until: now + 15 * 60 * 1000 };
    if (entry.count >= 10 || active >= 4 || attempts.size >= 10000 && !attempts.has(key)) {
      response.set('Retry-After', String(Math.max(1, Math.ceil((entry.until - now) / 1000))));
      return response.status(429).json({ message: 'Demasiados intentos. Espera antes de volver a intentar.' });
    }
    entry.count++;
    attempts.set(key, entry);
    active++;
    try {
      const user = await database.findUserByEmail(correo.trim().toLowerCase());
      const valid = await verifyPassword(password, user?.passwordHash || await dummyHash);
      if (!user || !valid) return response.status(401).json({ message: 'Correo o contraseña incorrectos.' });
      const token = randomBytes(32).toString('hex');
      await database.createSession({ _id: tokenHash(token), userId: user._id.toString(), expiresAt: new Date(now + duration) });
      const previous = readToken(request);
      if (previous) await database.deleteSession(tokenHash(previous));
      response.cookie(cookieName, token, { ...options(request), maxAge: duration });
      response.status(200).json({ message: 'Sesión iniciada.' });
    } catch {
      response.status(503).json({ message: 'No se pudo iniciar sesión. Intenta más tarde.' });
    } finally { active--; }
  });

  async function requireUser(request, response, next) {
    const token = readToken(request);
    try {
      const user = token ? await database.findSessionUser(tokenHash(token)) : null;
      if (!user) {
        response.clearCookie(cookieName, options(request));
        if (request.path === '/micuenta.html') return response.redirect('/login.html');
        return response.status(401).json({ message: 'Inicia sesión para continuar.' });
      }
      request.user = user;
      response.set('Cache-Control', 'no-store');
      next();
    } catch { response.status(503).json({ message: 'No se pudo comprobar la sesión. Intenta más tarde.' }); }
  }

  app.get('/api/me', requireUser, (request, response) => response.json({ usuario: request.user }));
  app.post('/api/logout', async (request, response) => {
    try {
      const token = readToken(request);
      if (token) await database.deleteSession(tokenHash(token));
      response.clearCookie(cookieName, options(request));
      response.json({ message: 'Sesión cerrada.' });
    } catch { response.status(503).json({ message: 'No se pudo cerrar sesión. Intenta nuevamente.' }); }
  });
  return requireUser;
}
