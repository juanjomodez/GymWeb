// Solo para el diagnóstico local. Nunca imprimir errores completos: pueden contener la URI.
const knownNames = new Set(['MongoServerError', 'MongoServerSelectionError', 'MongoNetworkError', 'MongoNetworkTimeoutError', 'MongoOperationTimeoutError', 'MongoParseError', 'MongoInvalidArgumentError', 'MongoMissingCredentialsError']);
const knownCodes = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ESERVFAIL', 'ENODATA', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ETIMEOUT', 'EACCES', 'EPERM', 'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'ERR_TLS_CERT_ALTNAME_INVALID']);

export function databaseDiagnostic(error) {
  const visited = new Set(), names = new Set(), codes = new Set(), queue = [error];
  let dnsQuery = false;
  while (queue.length && visited.size < 50) {
    const value = queue.shift();
    if (!value || typeof value !== 'object' || visited.has(value)) continue;
    visited.add(value);
    if (knownNames.has(value.name)) names.add(value.name);
    if (knownCodes.has(value.code) || Number.isSafeInteger(value.code)) codes.add(value.code);
    if (['querySrv', 'queryTxt', 'getaddrinfo'].includes(value.syscall)) dnsQuery = true;
    queue.push(value.cause, value.reason, value.error);
    if (value.servers instanceof Map) {
      for (const server of value.servers.values()) {
        if (queue.length >= 50) break;
        queue.push(server?.error);
      }
    }
  }
  const hasCode = (...values) => values.some(value => codes.has(value));
  let advice;
  if (hasCode(18) || names.has('MongoMissingCredentialsError')) {
    advice = 'Autenticación de MongoDB fallida: revisa el usuario de Database Access, su contraseña, authSource y la codificación de caracteres especiales en MONGODB_URI. Son credenciales distintas de tu cuenta de GymFlow.';
  } else if (hasCode(13)) {
    advice = 'MongoDB denegó permisos: revisa el acceso del usuario de base de datos a GymWeb en Database Access.';
  } else if (names.has('MongoParseError') || names.has('MongoInvalidArgumentError')) {
    advice = 'Configuración de conexión inválida: revisa localmente MONGODB_URI y sus opciones en backend/.env.';
  } else if (dnsQuery || hasCode('ENOTFOUND', 'EAI_AGAIN', 'ESERVFAIL', 'ENODATA')) {
    advice = 'Falló la resolución DNS de MongoDB. Comprueba que la URI y el clúster existan. Si tu DNS bloquea Atlas, prueba MONGODB_DNS_SERVERS=1.1.1.1,1.0.0.1 en backend/.env y reinicia el backend.';
  } else if (hasCode('CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'ERR_TLS_CERT_ALTNAME_INVALID')) {
    advice = 'Falló la verificación TLS: revisa fecha/hora del equipo y los certificados de la red. Conserva la validación de certificados habilitada.';
  } else {
    advice = 'No se pudo completar la conexión o lectura: revisa IP actual autorizada en Network Access, clúster activo, red, URI y permisos de Database Access. Un timeout no identifica por sí solo cuál de estas condiciones falló.';
  }
  return [
    'Diagnóstico de MongoDB:',
    ...(names.size ? ['Tipo: ' + [...names].join(', ')] : []),
    ...(codes.size ? ['Código: ' + [...codes].join(', ')] : []),
    advice,
    'No se muestran la URI, las credenciales ni el mensaje interno del driver.',
  ].join('\n');
}
