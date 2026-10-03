import { config } from '../src/config.js';
import { createDatabase } from '../src/database.js';
import { adminPreparationInput } from '../src/admin-preparation.js';

let db;
try {
  const correo = adminPreparationInput(process.argv.slice(2), process.env.NODE_ENV);
  db = createDatabase(config);
  const user = await db.prepareAdmin(correo);
  if (!user) {
    console.error('No se modificó ninguna cuenta. Debe existir y tener rol de usuario (o no tener rol).');
    process.exitCode = 1;
  } else console.log('Cuenta preparada como administrador de desarrollo. Entra con su contraseña habitual.');
} catch (error) {
  console.error(db ? 'No se pudo preparar el administrador. Revisa la conexión local.' : error.message);
  process.exitCode = 1;
} finally { await db?.close(); }
