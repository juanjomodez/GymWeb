import { config } from './config.js';
import { createDatabase } from './database.js';
import { createApp } from './app.js';

const database = createDatabase(config);
const server = createApp(database).listen(config.port, config.host, () => {
  console.log(`Backend Gym: http://${config.host}:${config.port}/health`);
  if (!config.uri) console.warn('Falta MONGODB_URI en backend/.env; /health devolverá 503.');
});

server.on('error', () => {
  console.error('No se pudo iniciar el servidor HTTP. Revisa HOST y PORT.');
  process.exitCode = 1;
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    const timeout = setTimeout(() => process.exit(1), 10000);
    timeout.unref();
    server.close(async () => {
      try { await database.close(); }
      finally { clearTimeout(timeout); }
    });
  });
}
