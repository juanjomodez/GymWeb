// Doble del driver para ejecutar los métodos reales de database.js sin red.
import { ObjectId } from 'mongodb';

const equal = (a, b) => a instanceof ObjectId || b instanceof ObjectId ? String(a) === String(b) : a === b;
function matches(document, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === '$or') return value.some(part => matches(document, part));
    const actual = document[key];
    if (value && typeof value === 'object' && !(value instanceof Date) && !(value instanceof ObjectId)) {
      return Object.entries(value).every(([op, expected]) => {
        if (op === '$exists') return (actual !== undefined) === expected;
        if (op === '$lte') return actual instanceof Date && actual <= expected;
        if (op === '$gt') return actual > expected;
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
  const rows = name => {
    if (!data.has(name)) data.set(name, []);
    return data.get(name);
  };
  const collection = name => ({
    async createIndex() {},
    async bulkWrite(operations) {
      for (const { updateOne } of operations) {
        if (!rows(name).some(row => matches(row, updateOne.filter))) rows(name).push({ ...updateOne.filter, ...updateOne.update.$setOnInsert });
      }
    },
    find(filter) {
      operations.push({ name, method: 'find', filter });
      let sort;
      let limit = Infinity;
      return {
        sort(value) { sort = value; return this; },
        limit(value) { limit = value; return this; },
        async toArray() {
          const selected = rows(name).filter(row => matches(row, filter));
          if (sort) selected.sort((a, b) => String(a._id).localeCompare(String(b._id)));
          return selected.slice(0, limit).map(document => project(document));
        },
      };
    },
    async findOne(filter, { projection } = {}) {
      operations.push({ name, method: 'findOne', filter, projection });
      // Conservar ObjectId al leer usuarios, como hace el driver.
      const document = rows(name).find(row => matches(row, filter));
      return document ? { ...project(document, projection), ...(document._id instanceof ObjectId && projection?._id !== 0 ? { _id: document._id } : {}) } : null;
    },
    async insertOne(document) {
      const value = { ...document, _id: document._id || new ObjectId() };
      if (rows(name).some(row => equal(row._id, value._id) || name === 'usuarios' && row.correo === value.correo)) throw Object.assign(new Error('duplicate'), { code: 11000 });
      rows(name).push(value);
      return { insertedId: value._id };
    },
    async updateOne(filter, update) {
      const document = rows(name).find(row => matches(row, filter));
      if (document) Object.assign(document, update.$set);
      return { modifiedCount: document ? 1 : 0 };
    },
    async updateMany(filter, update) {
      for (const document of rows(name).filter(row => matches(row, filter))) Object.assign(document, update.$set);
    },
    async findOneAndUpdate(filter, update, options) {
      operations.push({ name, method: 'findOneAndUpdate', filter, update, options });
      const document = rows(name).find(row => matches(row, filter));
      if (!document) return null;
      Object.assign(document, update.$set);
      for (const [field, increment] of Object.entries(update.$inc || {})) document[field] += increment;
      return project(document, options.projection);
    },
    async deleteOne(filter) {
      const index = rows(name).findIndex(row => matches(row, filter));
      if (index >= 0) rows(name).splice(index, 1);
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
  return { rows, operations, db() { return { collection }; }, async close() {} };
}
