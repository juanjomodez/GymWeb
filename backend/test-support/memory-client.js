// Doble del driver para ejecutar los métodos reales de database.js sin red.
import { ObjectId } from 'mongodb';

const equal = (a, b) => a instanceof ObjectId || b instanceof ObjectId ? String(a) === String(b) : a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b;
function matches(document, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === '$or') return value.some(part => matches(document, part));
    const actual = document[key];
    if (value && typeof value === 'object' && !(value instanceof Date) && !(value instanceof ObjectId)) {
      return Object.entries(value).every(([op, expected]) => {
        if (op === '$exists') return (actual !== undefined) === expected;
        if (op === '$lte') return actual instanceof Date && actual <= expected;
        if (op === '$gt') return actual > expected;
        if (op === '$lt') return actual < expected;
        if (op === '$gte') return actual >= expected;
        throw new Error(`Operador no implementado: ${op}`);
      });
    }
    return value === null ? actual == null : equal(actual, value);
  });
}
function project(document, projection) {
  if (!document) return null;
  if (!projection) return { ...structuredClone(document), ...(document._id instanceof ObjectId ? { _id: new ObjectId(document._id) } : {}) };
  return Object.fromEntries(Object.entries(document).filter(([key]) => projection[key] === 1 || key === '_id' && projection._id !== 0));
}

export function memoryClient() {
  const data = new Map();
  const operations = [];
  const indexes = new Map();
  let revision = 0;
  const rows = name => {
    if (!data.has(name)) data.set(name, []);
    return data.get(name);
  };
  const transactionRows = (name, session) => {
    if (!session) return rows(name);
    if (!session.data.has(name)) session.data.set(name, []);
    return session.data.get(name);
  };
  const changed = (name, session) => { if (session) session.changed.add(name); else revision++; };
  function unique(name, value, documents, original) {
    const specs = [{ keys: { _id: 1 }, options: { unique: true } }, ...(indexes.get(name) || [])];
    for (const spec of specs) {
      if (!spec.options?.unique || spec.options.partialFilterExpression && !matches(value, spec.options.partialFilterExpression)) continue;
      if (documents.some(row => row !== original && (!spec.options.partialFilterExpression || matches(row, spec.options.partialFilterExpression)) && Object.keys(spec.keys).every(key => equal(row[key], value[key])))) throw Object.assign(new Error('duplicate'), { code: 11000 });
    }
  }
  function updated(document, update) {
    const value = { ...document, ...update.$set };
    for (const [field, increment] of Object.entries(update.$inc || {})) value[field] = (value[field] ?? 0) + increment;
    return value;
  }
  const collection = name => ({
    async createIndex(keys, options) {
      operations.push({ name, method: 'createIndex', keys, options });
      const specs = indexes.get(name) || []; if (!specs.some(spec => JSON.stringify(spec.keys) === JSON.stringify(keys))) specs.push({ keys, options }); indexes.set(name, specs);
      for (const row of rows(name)) unique(name, row, rows(name), row);
    },
    async bulkWrite(operations) {
      for (const { updateOne } of operations) {
        if (!rows(name).some(row => matches(row, updateOne.filter))) { rows(name).push({ ...updateOne.filter, ...updateOne.update.$setOnInsert }); revision++; }
      }
    },
    find(filter, { session } = {}) {
      operations.push({ name, method: 'find', filter });
      let sort;
      let limit = Infinity;
      return {
        sort(value) { sort = value; return this; },
        limit(value) { limit = value; return this; },
        async toArray() {
          const selected = transactionRows(name, session).filter(row => matches(row, filter));
          if (sort) selected.sort((a, b) => String(a._id).localeCompare(String(b._id)) * sort._id);
          return selected.slice(0, limit).map(document => project(document));
        },
      };
    },
    async findOne(filter, { projection, session } = {}) {
      operations.push({ name, method: 'findOne', filter, projection });
      // Conservar ObjectId al leer usuarios, como hace el driver.
      const document = transactionRows(name, session).find(row => matches(row, filter));
      return document ? { ...project(document, projection), ...(document._id instanceof ObjectId && projection?._id !== 0 ? { _id: document._id } : {}) } : null;
    },
    async insertOne(document, { session } = {}) {
      const value = { ...document, _id: document._id || new ObjectId() };
      unique(name, value, transactionRows(name, session));
      transactionRows(name, session).push(value); changed(name, session);
      return { insertedId: value._id };
    },
    async updateOne(filter, update, { session } = {}) {
      const document = transactionRows(name, session).find(row => matches(row, filter));
      if (document) { const value = updated(document, update); unique(name, value, transactionRows(name, session), document); Object.assign(document, value); changed(name, session); }
      return { modifiedCount: document ? 1 : 0 };
    },
    async updateMany(filter, update, { session } = {}) {
      for (const document of transactionRows(name, session).filter(row => matches(row, filter))) { const value = updated(document, update); unique(name, value, transactionRows(name, session), document); Object.assign(document, value); changed(name, session); }
    },
    async findOneAndUpdate(filter, update, options) {
      operations.push({ name, method: 'findOneAndUpdate', filter, update, options });
      const document = transactionRows(name, options.session).find(row => matches(row, filter));
      if (!document) return null;
      const value = updated(document, update); unique(name, value, transactionRows(name, options.session), document); Object.assign(document, value);
      changed(name, options.session);
      return project(document, options.projection);
    },
    async deleteOne(filter) {
      const index = rows(name).findIndex(row => matches(row, filter));
      if (index >= 0) { rows(name).splice(index, 1); revision++; }
    },
    aggregate(pipeline) {
      operations.push({ name, method: 'aggregate', pipeline });
      return { async toArray() {
        const selected = rows(name).filter(row => matches(row, pipeline[0].$match)).sort((a, b) => a._id.localeCompare(b._id)).slice(0, pipeline[2].$limit);
        const projection = pipeline[3].$lookup.pipeline[1].$project;
        return selected.map(row => ({ ...row, usuario: project(rows('usuarios').find(user => String(user._id) === row._id), projection) }));
      } };
    },
  });
  return { rows, operations, db() { return { collection }; }, async close() {}, startSession() {
    return {
      async withTransaction(task, options) {
        operations.push({ method: 'withTransaction', options });
        // Instantánea aislada, rollback y reintento optimista; no emula el driver/red.
        for (let attempt = 0; attempt < 20; attempt++) {
          const start = revision;
          this.data = new Map([...data].map(([name, documents]) => [name, documents.map(document => project(document))]));
          this.changed = new Set();
          const result = await task();
          if (revision !== start) continue;
          for (const name of this.changed) rows(name).splice(0, rows(name).length, ...this.data.get(name));
          if (this.changed.size) revision++;
          return result;
        }
        throw new Error('Límite de reintentos del doble local');
      },
      async endSession() {},
    };
  } };
}
