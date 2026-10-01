import { MongoClient, ObjectId } from 'mongodb';

export function createDatabase({ uri, database }) {
  let client;
  let indexesReady;
  let sessionIndexes;
  function getDb() {
    if (!uri) throw new Error('MONGODB_URI no configurada');
    client ??= new MongoClient(uri, {
      serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000,
      socketTimeoutMS: 5000, timeoutMS: 5000,
    });
    return client.db(database);
  }
  return {
    async findUserByEmail(correo) {
      return getDb().collection('usuarios').findOne({ correo });
    },
    async createSession(session) {
      const sessions = getDb().collection('sesiones');
      sessionIndexes ??= sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(error => {
        sessionIndexes = undefined;
        throw error;
      });
      await sessionIndexes;
      await sessions.insertOne(session);
    },
    async findSessionUser(tokenHash) {
      const session = await getDb().collection('sesiones').findOne({ _id: tokenHash, expiresAt: { $gt: new Date() } });
      if (!session) return null;
      const user = await getDb().collection('usuarios').findOne({ _id: new ObjectId(session.userId) }, { projection: { nombre: 1, correo: 1 } });
      return user ? { id: user._id.toString(), nombre: user.nombre, correo: user.correo } : null;
    },
    async deleteSession(tokenHash) {
      await getDb().collection('sesiones').deleteOne({ _id: tokenHash });
    },
    async createUser(user) {
      const users = getDb().collection('usuarios');
      indexesReady ??= users.createIndex({ correo: 1 }, { unique: true }).catch(error => {
        indexesReady = undefined;
        throw error;
      });
      await indexesReady;
      const result = await users.insertOne(user);
      return { id: result.insertedId.toString(), nombre: user.nombre, correo: user.correo };
    },
    async ping() {
      // El driver conecta automáticamente y reutiliza el pool.
      // Cada petición ejecuta un comando real; no devuelve un estado cacheado.
      await getDb().command({ ping: 1 });
    },
    async close() {
      await client?.close();
    },
  };
}
