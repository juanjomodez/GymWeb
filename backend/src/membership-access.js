import { ObjectId } from 'mongodb';
import { publicMembership } from './memberships.js';

export async function lockMembershipUsers(collection, ids, session) {
  for (const id of [...new Set(ids)].sort()) await collection('usuarios').findOneAndUpdate({ _id: new ObjectId(id) }, { $inc: { membresiaVersion: 1 } }, { session, returnDocument: 'after' });
}
// Resolver común para rutinas, reservas y mensajes, también dentro de transacciones.
export async function resolveMembership(collection, userId, instant, { session, lock = false } = {}) {
  let link = await collection('vinculos_familiares').findOne({ _id: userId, estado: 'activo' }, { session });
  if (lock) {
    await lockMembershipUsers(collection, [userId, ...(link ? [link.titularId] : [])], session);
    link = await collection('vinculos_familiares').findOne({ _id: userId, estado: 'activo' }, { session });
  }
  const ownerId = link?.titularId || userId;
  const membership = lock
    ? await collection('membresias').findOneAndUpdate({ _id: ownerId }, { $inc: { accesoVersion: 1 } }, { session, returnDocument: 'after' })
    : await collection('membresias').findOne({ _id: ownerId }, { session });
  if (!membership) return null;
  const state = membership.estado === 'activa' && membership.fin instanceof Date && membership.fin <= instant ? 'vencida' : membership.estado;
  if (!link) return { ...membership, estado: state };
  if (!['familiar', 'premium-familiar'].includes(membership.planId) || membership.periodo !== 'mes' || !Number.isInteger(membership.maxPersonas) || membership.maxPersonas < 2 || membership.maxPersonas > 5) return null;
  return { ...membership, _id: userId, estado: state, tipoAcceso: 'beneficiario', titularNombre: link.titularNombre, pagoSimulado: null };
}
export const ownCommitment = (membership, instant) => membership?.estado === 'pendiente' || membership?.estado === 'activa' && (publicMembership(membership, instant)?.accesoActivo || membership.inicio instanceof Date && membership.fin instanceof Date && membership.fin > instant);
