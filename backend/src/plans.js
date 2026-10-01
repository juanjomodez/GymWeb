export const initialPlans = [
  { _id: 'basico', nombre: 'Plan Básico', precio: 60000, moneda: 'COP', periodo: 'mes', maxPersonas: 1, beneficios: ['Acceso al gimnasio', 'Rutinas generales'], disponible: true },
  { _id: 'familiar', nombre: 'Plan Familiar', precio: 150000, moneda: 'COP', periodo: 'mes', maxPersonas: 5, beneficios: ['Acceso al gimnasio para hasta 5 personas', 'Rutinas generales'], disponible: true },
  { _id: 'premium-individual', nombre: 'Plan Premium individual', precio: 100000, moneda: 'COP', periodo: 'mes', maxPersonas: 1, beneficios: ['Acceso al gimnasio y rutinas', 'Chat y citas con entrenadores (próxima fase)'], disponible: true },
  { _id: 'premium-familiar', nombre: 'Plan Premium familiar', precio: 350000, moneda: 'COP', periodo: 'mes', maxPersonas: 5, beneficios: ['Acceso al gimnasio para hasta 5 personas', 'Rutinas', 'Chat y citas con entrenadores (próxima fase)'], disponible: true },
];

export function setupMemberships(app, database, requireUser) {
  app.get('/api/planes', async (_req, res) => {
    try { res.json({ planes: await database.listPlans() }); }
    catch { res.status(503).json({ message: 'No se pudieron cargar los planes.' }); }
  });
  app.get('/api/membresia', requireUser, async (req, res) => {
    try { res.json({ membresia: await database.findMembership(req.user.id) }); }
    catch { res.status(503).json({ message: 'No se pudo cargar la membresía.' }); }
  });
  app.post('/api/membresia', requireUser, async (req, res) => {
    const planId = req.body?.planId;
    if (typeof planId !== 'string' || !/^[a-z-]{1,50}$/.test(planId)) return res.status(400).json({ message: 'Selecciona un plan válido.' });
    try {
      const plan = await database.findPlan(planId);
      if (!plan) return res.status(404).json({ message: 'El plan no está disponible.' });
      const membership = {
        _id: req.user.id, planId: plan._id,
        planNombre: plan.nombre, precio: plan.precio, moneda: plan.moneda,
        periodo: plan.periodo, maxPersonas: plan.maxPersonas,
        estado: 'pendiente', solicitadaEn: new Date(), inicio: null, fin: null,
      };
      await database.createMembership(membership);
      res.status(201).json({ message: 'Solicitud recibida. Tu membresía está pendiente de activación.', membresia: membership });
    } catch (error) {
      if (error.code === 11000) return res.status(409).json({ message: 'Ya tienes una membresía solicitada. Consulta Mi cuenta.' });
      res.status(503).json({ message: 'No se pudo solicitar la membresía. Intenta nuevamente.' });
    }
  });
}
