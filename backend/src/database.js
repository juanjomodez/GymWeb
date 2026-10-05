import { MongoClient, ObjectId } from 'mongodb';
import { initialPlans } from './plans.js';
import { initialProducts } from './products.js';
import { orderError, orderIntent } from './orders.js';
import { createTrainingDatabase } from './training-database.js';
import { createFamilyRenewalsDatabase } from './family-renewals-database.js';

export function createDatabase({ uri, database }, { clientFactory = (connection, options) => new MongoClient(connection, options) } = {}) {
  let client;
  let indexesReady;
  let sessionIndexes;
  let plansReady;
  let membershipIndexes;
  let routineIndexes;
  let productsReady;
  let productIndexes;
  let orderIndexes;
  async function ensureOrders() {
    const orders = getDb().collection('pedidos');
    orderIndexes ??= Promise.all([
      orders.createIndex({ userId: 1, clave: 1 }, { unique: true }),
      orders.createIndex({ userId: 1, estado: 1, _id: 1 }),
      orders.createIndex({ tipo: 1, estado: 1, _id: 1 }),
    ]).catch(error => { orderIndexes = undefined; throw error; });
    await orderIndexes;
  }
  async function transaction(task) {
    getDb();
    const session = client.startSession();
    try {
      return await session.withTransaction(() => task(session), {
        readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary',
        maxCommitTimeMS: 5000, timeoutMS: 15000,
      });
    } finally { await session.endSession(); }
  }
  function existingOrder(order, items) {
    if (order.tipo !== 'compra') throw orderError(409, 'Este intento pertenece a un pedido de prueba anterior. Inicia una nueva compra.');
    if (orderIntent(order.items) !== orderIntent(items)) throw orderError(409, 'Esta clave ya pertenece a un pedido con otros productos o cantidades. Recupera el intento anterior antes de iniciar otro.');
    return { order, created: false };
  }
  async function ensureProducts() {
    productsReady ??= getDb().collection('productos').bulkWrite(initialProducts.map(({ _id, ...product }) => ({
      updateOne: { filter: { _id: new ObjectId(_id) }, update: { $setOnInsert: { ...product, creadaEn: new Date(), actualizadaEn: new Date(), creadaPor: 'catalogo-inicial', actualizadaPor: 'catalogo-inicial' } }, upsert: true },
    }))).catch(error => { productsReady = undefined; throw error; });
    await productsReady;
  }
  async function ensurePlans() {
    plansReady ??= getDb().collection('planes').bulkWrite(initialPlans.map(plan => ({
      updateOne: { filter: { _id: plan._id }, update: { $setOnInsert: plan }, upsert: true },
    }))).catch(error => { plansReady = undefined; throw error; });
    await plansReady;
  }
  function getDb() {
    if (!uri) throw new Error('MONGODB_URI no configurada');
    client ??= clientFactory(uri, {
      serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000,
      socketTimeoutMS: 5000, timeoutMS: 5000,
    });
    return client.db(database);
  }
  const familyRenewals = createFamilyRenewalsDatabase(getDb, transaction, ensurePlans);
  return {
    ...familyRenewals,
    ...createTrainingDatabase(getDb, transaction, familyRenewals.resolveMembershipAccess),
    async listOrders(userId, { despues, estado, tipo, limit }) {
      await ensureOrders();
      return getDb().collection('pedidos').find({ ...(userId === undefined ? {} : { userId }), ...(tipo ? { tipo } : {}), ...(estado ? { estado } : {}), ...(despues ? { _id: { $gt: new ObjectId(despues) } } : {}) }).sort({ _id: 1 }).limit(limit).toArray();
    },
    async findOrder(id, userId) {
      return getDb().collection('pedidos').findOne({ _id: new ObjectId(id), userId });
    },
    async createOrder(userId, clave, input, instant, totalEsperado, comprador) {
      await ensureOrders();
      const orders = getDb().collection('pedidos');
      const previous = await orders.findOne({ userId, clave });
      if (previous) return existingOrder(previous, input);
      await ensureProducts();
      const id = new ObjectId();
      try {
        return await transaction(async session => {
          const previous = await orders.findOne({ userId, clave }, { session });
          if (previous) return existingOrder(previous, input);
          const items = [];
          for (const item of [...input].sort((a, b) => a.productoId.localeCompare(b.productoId))) {
            const product = await getDb().collection('productos').findOne({ _id: new ObjectId(item.productoId), disponible: true }, { session });
            if (!product || !Number.isInteger(product.stock) || product.stock < item.cantidad) throw orderError(409, 'Un producto fue retirado o no tiene suficientes existencias. Actualiza el carrito antes de crear el pedido.');
            if (!Number.isSafeInteger(product.precio) || product.precio < 1 || product.precio > 100000000 || product.moneda !== 'COP') throw new Error('Condiciones de producto inválidas');
            items.push({ productoId: item.productoId, nombre: product.nombre, imagen: product.imagen, precioUnitario: product.precio, cantidad: item.cantidad, subtotal: product.precio * item.cantidad });
            const reserved = await getDb().collection('productos').findOneAndUpdate(
              { _id: product._id, disponible: true, stock: { $gte: item.cantidad }, version: product.version },
              { $inc: { stock: -item.cantidad, version: 1 }, $set: { actualizadaEn: instant, stockActualizadoEn: instant, stockActualizadoPor: userId } },
              { session, returnDocument: 'after' },
            );
            if (!reserved) throw orderError(409, 'Las existencias cambiaron. Actualiza el carrito antes de comprar.');
          }
          const total = items.reduce((sum, item) => sum + item.subtotal, 0);
          if (total !== totalEsperado) throw orderError(409, 'El precio cambió. Actualiza el total del carrito y confirma nuevamente la compra.');
          const order = { _id: id, userId, clave, tipo: 'compra', estado: 'pendiente', items, total, moneda: 'COP', creadoEn: instant, actualizadoEn: instant, inventario: 'reservado', comprador: { nombre: comprador.nombre, correo: comprador.correo }, pagoSimulado: null };
          await orders.insertOne(order, { session });
          return { order, created: true };
        });
      } catch (error) {
        if (error.code === 11000) {
          const previous = await orders.findOne({ userId, clave });
          if (previous) return existingOrder(previous, input);
        }
        throw error;
      }
    },
    async changeOrder(id, action, actorId, instant, admin = false) {
      await ensureOrders();
      return transaction(async session => {
        const orders = getDb().collection('pedidos');
        const filter = { _id: new ObjectId(id), ...(admin ? {} : { userId: actorId }) };
        const order = await orders.findOne(filter, { session });
        if (!order) throw orderError(404, 'No existe esa compra.');
        if (order.tipo !== 'compra') throw orderError(409, 'Los pedidos de prueba anteriores solo están disponibles para consulta.');
        if (!['pagar', 'entregar', 'cancelar'].includes(action) || !admin && action !== 'cancelar') throw orderError(403, 'Operación no permitida.');
        const target = { pagar: 'pagado', entregar: 'entregado', cancelar: 'cancelado' }[action];
        if (order.estado === target || action === 'pagar' && order.estado === 'entregado') return order;
        const expected = action === 'entregar' ? 'pagado' : 'pendiente';
        if (order.estado !== expected) throw orderError(409, action === 'cancelar' ? 'Solo puedes cancelar compras pendientes de pago.' : action === 'entregar' ? 'Confirma el pago antes de entregar la compra.' : 'Esta compra ya no está pendiente de pago.');
        if (action === 'cancelar') {
          if (order.inventario !== 'reservado') throw orderError(409, 'La compra no tiene una reserva de inventario válida.');
          for (const item of order.items) {
            const updated = await getDb().collection('productos').findOneAndUpdate(
              { _id: new ObjectId(item.productoId) },
              { $inc: { stock: item.cantidad, version: 1 }, $set: { actualizadaEn: instant, stockActualizadoEn: instant, stockActualizadoPor: actorId } },
              { session, returnDocument: 'after' },
            );
            if (!updated) throw orderError(409, 'No se pudo devolver un producto al inventario. Solicita al administrador revisar la compra.');
          }
        }
        const audit = action === 'pagar' ? { pagadoEn: instant, pagadoPor: actorId, inventario: 'vendido' } : action === 'entregar' ? { entregadoEn: instant, entregadoPor: actorId } : { canceladoEn: instant, canceladoPor: actorId, inventario: 'liberado' };
        const updated = await orders.findOneAndUpdate({ ...filter, estado: expected }, {
          $set: { estado: target, actualizadoEn: instant, ...audit },
        }, { session, returnDocument: 'after' });
        if (!updated) throw orderError(409, 'La compra cambió. Actualiza el historial.');
        return updated;
      });
    },
    async listProducts({ disponible, despues, limit }) {
      await ensureProducts();
      const products = getDb().collection('productos');
      productIndexes ??= products.createIndex({ disponible: 1, _id: 1 }).catch(error => { productIndexes = undefined; throw error; });
      await productIndexes;
      return products.find({ ...(disponible === undefined ? {} : { disponible }), ...(despues ? { _id: { $gt: new ObjectId(despues) } } : {}) }).sort({ _id: 1 }).limit(limit).toArray();
    },
    async findProduct(id, availableOnly = false) {
      await ensureProducts();
      return getDb().collection('productos').findOne({ _id: new ObjectId(id), ...(availableOnly ? { disponible: true } : {}) });
    },
    async createProduct(product) {
      await ensureProducts();
      const result = await getDb().collection('productos').insertOne(product);
      return { ...product, _id: result.insertedId };
    },
    async updateProduct(id, version, fields) {
      await ensureProducts();
      return getDb().collection('productos').findOneAndUpdate({ _id: new ObjectId(id), version }, { $set: fields, $inc: { version: 1 } }, { returnDocument: 'after' });
    },
    async listRoutines({ disponible, nivel, despues, limit }) {
      const routines = getDb().collection('rutinas');
      routineIndexes ??= routines.createIndex({ disponible: 1, _id: 1 }).catch(error => { routineIndexes = undefined; throw error; });
      await routineIndexes;
      return routines.find({
        ...(disponible === undefined ? {} : { disponible }),
        ...(nivel ? { nivel } : {}),
        ...(despues ? { _id: { $gt: new ObjectId(despues) } } : {}),
      }).sort({ _id: 1 }).limit(limit).toArray();
    },
    async findRoutine(id, availableOnly = false) {
      return getDb().collection('rutinas').findOne({ _id: new ObjectId(id), ...(availableOnly ? { disponible: true } : {}) });
    },
    async createRoutine(routine) {
      const result = await getDb().collection('rutinas').insertOne(routine);
      return { ...routine, _id: result.insertedId };
    },
    async updateRoutine(id, version, fields) {
      return getDb().collection('rutinas').findOneAndUpdate(
        { _id: new ObjectId(id), version },
        { $set: fields, $inc: { version: 1 } },
        { returnDocument: 'after' },
      );
    },
    async listPlans() {
      await ensurePlans();
      return getDb().collection('planes').find({ disponible: true }).toArray();
    },
    async findPlan(id) {
      await ensurePlans();
      return getDb().collection('planes').findOne({ _id: id, disponible: true });
    },
    async findMembership(userId, now = new Date()) {
      const memberships = getDb().collection('membresias');
      await memberships.updateOne({ _id: userId, estado: 'activa', fin: { $lte: now } }, { $set: { estado: 'vencida' } });
      return familyRenewals.resolveMembershipAccess(userId, now);
    },
    async listMemberships({ estado, despues, now, limit }) {
      const memberships = getDb().collection('membresias');
      membershipIndexes ??= Promise.all([
        memberships.createIndex({ estado: 1, fin: 1 }),
        memberships.createIndex({ estado: 1, _id: 1 }),
      ]).catch(error => { membershipIndexes = undefined; throw error; });
      await membershipIndexes;
      // Sin TTL: el vencimiento conserva la solicitud, las fechas y la auditoría.
      await memberships.updateMany({ estado: 'activa', fin: { $lte: now } }, { $set: { estado: 'vencida' } });
      return memberships.aggregate([
        { $match: { estado, ...(despues ? { _id: { $gt: despues } } : {}) } },
        { $sort: { _id: 1 } },
        { $limit: limit },
        { $lookup: {
          from: 'usuarios',
          let: { userId: { $convert: { input: '$_id', to: 'objectId', onError: null, onNull: null } } },
          pipeline: [
            { $match: { $expr: { $eq: ['$_id', '$$userId'] } } },
            { $project: { _id: 0, nombre: 1, correo: 1 } },
          ],
          as: 'usuarios',
        } },
        { $set: { usuario: { $ifNull: [{ $arrayElemAt: ['$usuarios', 0] }, null] } } },
        { $unset: 'usuarios' },
      ]).toArray();
    },
    async activateMembership(userId, adminId, inicio, fin) {
      const memberships = getDb().collection('membresias');
      await memberships.updateOne({ _id: userId, estado: 'activa', fin: { $lte: inicio } }, { $set: { estado: 'vencida' } });
      // Compare-and-set: solo una petición puede cambiar pendiente a activa.
      const activated = await memberships.findOneAndUpdate(
        { _id: userId, estado: 'pendiente', periodo: 'mes', inicio: null, fin: null },
        { $set: { estado: 'activa', inicio, fin, activadaEn: inicio, activadaPor: adminId, activacionOrigen: 'administrador' } },
        { returnDocument: 'after' },
      );
      return activated || memberships.findOne({ _id: userId });
    },
    async simulateMembershipPayment(userId, resultado, inicio, fin) {
      const memberships = getDb().collection('membresias');
      await memberships.updateOne({ _id: userId, estado: 'activa', fin: { $lte: inicio } }, { $set: { estado: 'vencida' } });
      const current = await memberships.findOne({ _id: userId });
      if (!current) return null;
      // Una aprobación es definitiva: reintentar nunca reinicia ni renueva fechas.
      if (current.pagoSimulado?.resultado === 'aprobado') return current;
      if (current.estado !== 'pendiente' || current.periodo !== 'mes' || current.inicio != null || current.fin != null || !Number.isSafeInteger(current.precio) || current.precio < 0 || current.moneda !== 'COP') return current;
      const payment = { tipo: 'simulado', resultado, monto: current.precio, moneda: current.moneda, registradaEn: inicio };
      // Rechazo y aprobación comparten el mismo documento y la misma transición CAS.
      const updated = await memberships.findOneAndUpdate(
        { _id: userId, estado: 'pendiente', periodo: 'mes', inicio: null, fin: null, precio: current.precio, moneda: current.moneda, planId: current.planId },
        { $set: {
          pagoSimulado: payment,
          ...(resultado === 'aprobado' ? { estado: 'activa', inicio, fin, activadaEn: inicio, activadaPor: userId, activacionOrigen: 'pago-simulado' } : {}),
        } },
        { returnDocument: 'after' },
      );
      return updated || memberships.findOne({ _id: userId });
    },
    async prepareAdmin(correo) {
      // Solo para el comando local explícito; nunca se expone mediante la API.
      return getDb().collection('usuarios').findOneAndUpdate(
        { correo, $or: [{ rol: { $exists: false } }, { rol: 'usuario' }] },
        { $set: { rol: 'admin' } },
        { returnDocument: 'after', projection: { _id: 1 } },
      );
    },
    async createMembership(membership) {
      // _id es el usuario: MongoDB impide solicitudes concurrentes duplicadas.
      await familyRenewals.createInitialMembership(membership);
    },
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
      const user = await getDb().collection('usuarios').findOne({ _id: new ObjectId(session.userId) }, { projection: { nombre: 1, correo: 1, rol: 1 } });
      return user ? { id: user._id.toString(), nombre: user.nombre, correo: user.correo, rol: user.rol === 'admin' ? 'admin' : 'usuario' } : null;
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
