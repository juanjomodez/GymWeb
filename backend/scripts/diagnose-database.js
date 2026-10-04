import { createDatabase } from '../src/database.js';
import { databaseDiagnostic } from '../src/database-diagnostics.js';

let database;
const timeout = setTimeout(() => {
  console.error('Diagnóstico excedió 20 segundos. Revisa conectividad, DNS y disponibilidad del clúster.');
  process.exit(1);
}, 20000);
try {
  const { config } = await import('../src/config.js');
  if (!config.uri) {
    console.error('Falta MONGODB_URI. Configúrala localmente en backend/.env; no compartas la URI en el chat.');
    process.exitCode = 1;
  } else {
    console.log('Comprobando conexión y lectura de usuarios. No se crean cuentas, sesiones ni pedidos.');
    database = createDatabase(config);
    await database.ping();
    await database.findUserByEmail('diagnostico@example.invalid');
    console.log('MongoDB: ping y lectura de usuarios correctos.');
    console.log('Si /health sigue en 503, reinicia el backend desde esta misma carpeta para usar su configuración actual.');
    console.log('Esta prueba no comprueba permisos de escritura de sesiones ni valida tu contraseña de GymFlow.');
  }
} catch (error) {
  console.error(databaseDiagnostic(error));
  process.exitCode = 1;
} finally {
  try { await database?.close(); }
  catch (error) { console.error(databaseDiagnostic(error)); process.exitCode = 1; }
  finally { clearTimeout(timeout); }
}
