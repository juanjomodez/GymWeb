export function adminPreparationInput(args, environment) {
  if (environment !== 'development') throw new Error('Usa NODE_ENV=development para preparar un administrador de desarrollo.');
  if (args.length !== 3 || args[0] !== '--correo' || args[2] !== '--confirmar') {
    throw new Error('Uso: npm run admin:prepare -- --correo correo-de-tu-cuenta --confirmar');
  }
  const correo = args[1].trim().toLowerCase();
  if (correo.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw new Error('Correo inválido.');
  return correo;
}
