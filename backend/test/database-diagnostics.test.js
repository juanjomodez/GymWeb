import test from 'node:test';
import assert from 'node:assert/strict';
import { databaseDiagnostic } from '../src/database-diagnostics.js';

test('diagnóstico encuentra DNS dentro de las causas sin mostrar host ni URI', () => {
  const secret = 'mongodb+srv://usuario:secreto@cluster.example.invalid/';
  const result = databaseDiagnostic({ name: 'MongoServerSelectionError', message: secret, reason: { servers: new Map([['cluster.example.invalid', { error: { name: 'MongoNetworkError', message: secret, cause: { code: 'ECONNREFUSED', syscall: 'querySrv', hostname: 'cluster.example.invalid' } } }]]) } });
  assert.match(result, /MongoServerSelectionError/);
  assert.match(result, /ECONNREFUSED/);
  assert.match(result, /resolución DNS/);
  assert.equal(result.includes('cluster.example.invalid'), false);
  assert.equal(result.includes('secreto'), false);
});

test('diagnóstico distingue credenciales de la base y permisos de lectura', () => {
  const auth = databaseDiagnostic({ name: 'MongoServerError', code: 18, message: 'contraseña-secreta' });
  assert.match(auth, /Autenticación de MongoDB fallida/);
  assert.match(auth, /distintas de tu cuenta/);
  assert.equal(auth.includes('contraseña-secreta'), false);
  assert.match(databaseDiagnostic({ cause: { code: 13 } }), /denegó permisos/);
});

test('diagnóstico admite errores circulares y descarta campos libres con secretos', () => {
  const error = { name: 'nombre-secreto', code: 'codigo-secreto', message: 'uri-secreta' }; error.cause = error;
  const result = databaseDiagnostic(error);
  assert.equal(result.includes('secreto'), false);
  assert.match(result, /No se pudo completar/);
  assert.match(databaseDiagnostic({ name: 'MongoParseError', message: 'uri-secreta' }), /Configuración de conexión inválida/);
});

test('diagnóstico diferencia TLS y no atribuye automáticamente un timeout a la IP', () => {
  assert.match(databaseDiagnostic({ code: 'ERR_TLS_CERT_ALTNAME_INVALID' }), /verificación TLS/);
  const timeout = databaseDiagnostic({ name: 'MongoServerSelectionError', cause: { code: 'ETIMEDOUT' } });
  assert.match(timeout, /Código: ETIMEDOUT/);
  assert.match(timeout, /no identifica por sí solo/);
});
