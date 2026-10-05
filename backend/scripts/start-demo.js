import { config } from '../src/config.js';

// config.js carga también .env; respetar un entorno explícito de producción.
if (process.env.NODE_ENV && process.env.NODE_ENV !== 'development') {
  console.error('El inicio demo solo admite NODE_ENV=development o un entorno sin NODE_ENV definido.');
  process.exitCode = 1;
} else {
  config.environment = 'development';
  config.demoPayments = true;
  await import('../src/server.js');
}
