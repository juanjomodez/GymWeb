import { requireAdmin } from './auth.js';
import { validUserId as validId } from './memberships.js';

export const productImages = ['img/proteina.jpg', 'img/creatina.jpg', 'img/shaker.jpg'];
export const initialProducts = [
  { _id: '500000000000000000000001', nombre: 'Proteína', descripcion: 'Producto de ejemplo: suplemento en presentación de proteína.', precio: 150000, imagen: productImages[0] },
  { _id: '500000000000000000000002', nombre: 'Creatina', descripcion: 'Producto de ejemplo: suplemento en presentación de creatina.', precio: 80000, imagen: productImages[1] },
  { _id: '500000000000000000000003', nombre: 'Shaker', descripcion: 'Shaker para preparar tus bebidas y suplementos.', precio: 35000, imagen: productImages[2] },
].map(product => ({ ...product, moneda: 'COP', stock: 10, disponible: true, version: 1 }));

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, min, max) => typeof value === 'string' && value.trim().length >= min && value.trim().length <= max && !/[\u0000-\u001f\u007f]/.test(value);
const validVersion = value => Number.isSafeInteger(value) && value >= 1 && value < Number.MAX_SAFE_INTEGER;
export function validateProduct(body, editing = false) {
  const keys = ['nombre', 'descripcion', 'precio', 'stock', 'imagen', 'disponible', ...(editing ? ['version'] : [])];
  if (!object(body) || Object.keys(body).some(key => !keys.includes(key))) return null;
  if (!text(body.nombre, 2, 100) || !text(body.descripcion, 5, 500) || !Number.isSafeInteger(body.precio) || body.precio < 1 || body.precio > 100000000 || !Number.isInteger(body.stock) || body.stock < 0 || body.stock > 9999 || !productImages.includes(body.imagen) || typeof body.disponible !== 'boolean' || editing && !validVersion(body.version)) return null;
  return { nombre: body.nombre.trim(), descripcion: body.descripcion.trim(), precio: body.precio, stock: body.stock, imagen: body.imagen, disponible: body.disponible, moneda: 'COP' };
}
export function publicProduct(value, admin = false) {
  const { nombre, descripcion, precio, moneda, stock, imagen, disponible } = value;
  return { _id: value._id.toString(), nombre, descripcion, precio, moneda, stock, imagen, disponible,
    ...(admin ? { version: value.version, creadaEn: value.creadaEn, actualizadaEn: value.actualizadaEn } : {}) };
}
export function validateCart(body) {
  if (!object(body) || Object.keys(body).length !== 1 || !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 20) return null;
  const ids = new Set();
  for (const item of body.items) {
    if (!object(item) || Object.keys(item).length !== 2 || !validId(item.productoId) || !Number.isInteger(item.cantidad) || item.cantidad < 1 || item.cantidad > 99 || ids.has(item.productoId)) return null;
    ids.add(item.productoId);
  }
  return body.items.map(({ productoId, cantidad }) => ({ productoId, cantidad }));
}

export function setupProducts(app, database, requireUser, now) {
  function filter(req, admin) {
    const { despues, disponibilidad = 'todas' } = req.query;
    if (despues !== undefined && !validId(despues) || admin && !['todas', 'disponibles', 'deshabilitados'].includes(disponibilidad)) return null;
    return { despues, disponible: admin ? disponibilidad === 'todas' ? undefined : disponibilidad === 'disponibles' : true, limit: 21 };
  }
  const page = (rows, admin) => ({ productos: rows.slice(0, 20).map(row => publicProduct(row, admin)), siguiente: rows.length > 20 ? rows[19]._id.toString() : null });
  app.get('/api/productos', async (req, res) => {
    const query = filter(req, false);
    if (!query) return res.status(400).json({ message: 'Filtro de productos inválido.' });
    try { res.json(page(await database.listProducts(query), false)); }
    catch { res.status(503).json({ message: 'No se pudieron cargar los productos.' }); }
  });
  app.get('/api/productos/:id', async (req, res) => {
    if (!validId(req.params.id)) return res.status(400).json({ message: 'Producto inválido.' });
    try {
      const product = await database.findProduct(req.params.id, true);
      if (!product) return res.status(404).json({ message: 'El producto no está disponible.' });
      res.json({ producto: publicProduct(product) });
    } catch { res.status(503).json({ message: 'No se pudo cargar el producto.' }); }
  });
  // Cotización de lectura: no crea pedidos, no reserva ni descuenta existencias.
  app.post('/api/carrito/verificar', async (req, res) => {
    const input = validateCart(req.body);
    if (!input) return res.status(400).json({ message: 'Envía entre 1 y 20 productos distintos, con cantidades enteras de 1 a 99, sin precios ni campos adicionales.' });
    try {
      const products = await Promise.all(input.map(item => database.findProduct(item.productoId, true)));
      const items = [], cambios = [];
      input.forEach((item, index) => {
        const product = products[index];
        if (product && (!Number.isSafeInteger(product.precio) || product.precio < 1 || product.precio > 100000000 || !Number.isInteger(product.stock) || product.stock < 0 || product.stock > 9999 || product.moneda !== 'COP')) throw new Error('Condiciones de producto inválidas');
        if (!product || product.stock === 0) {
          cambios.push({ productoId: item.productoId, motivo: 'Producto retirado o agotado.' });
          return;
        }
        const cantidad = Math.min(item.cantidad, product.stock);
        if (cantidad !== item.cantidad) cambios.push({ productoId: item.productoId, motivo: 'Cantidad ajustada a las existencias actuales.' });
        items.push({ producto: publicProduct(product), cantidad, subtotal: product.precio * cantidad });
      });
      res.json({ items, cambios, total: items.reduce((total, item) => total + item.subtotal, 0), moneda: 'COP' });
    } catch { res.status(503).json({ message: 'No se pudo verificar el carrito. Intenta actualizarlo de nuevo.' }); }
  });
  app.get('/api/admin/productos', requireUser, requireAdmin, async (req, res) => {
    const query = filter(req, true);
    if (!query) return res.status(400).json({ message: 'Filtro de productos inválido.' });
    try { res.json(page(await database.listProducts(query), true)); }
    catch { res.status(503).json({ message: 'No se pudo cargar el catálogo administrativo.' }); }
  });
  app.post('/api/admin/productos', requireUser, requireAdmin, async (req, res) => {
    const input = validateProduct(req.body);
    if (!input) return res.status(400).json({ message: 'Revisa nombre, descripción, precio en COP, existencias, imagen y disponibilidad.' });
    try {
      const instant = now();
      const product = await database.createProduct({ ...input, version: 1, creadaEn: instant, actualizadaEn: instant, creadaPor: req.user.id, actualizadaPor: req.user.id });
      res.status(201).json({ message: 'Producto creado.', producto: publicProduct(product, true) });
    } catch { res.status(503).json({ message: 'No se pudo confirmar la creación. Actualiza el catálogo antes de volver a enviar el formulario.' }); }
  });
  async function update(req, res, availabilityOnly) {
    if (!validId(req.params.id)) return res.status(400).json({ message: 'Producto inválido.' });
    const body = req.body;
    const input = availabilityOnly
      ? object(body) && Object.keys(body).every(key => ['disponible', 'version'].includes(key)) && typeof body.disponible === 'boolean' && validVersion(body.version) ? { disponible: body.disponible } : null
      : validateProduct(body, true);
    if (!input) return res.status(400).json({ message: 'Datos de producto o versión inválidos.' });
    try {
      const product = await database.updateProduct(req.params.id, body.version, { ...input, actualizadaEn: now(), actualizadaPor: req.user.id });
      if (!product) {
        if (!await database.findProduct(req.params.id)) return res.status(404).json({ message: 'No existe ese producto.' });
        return res.status(409).json({ message: 'El producto cambió. Actualiza el catálogo y vuelve a abrir la edición.' });
      }
      res.json({ message: availabilityOnly ? product.disponible ? 'Producto habilitado.' : 'Producto deshabilitado.' : 'Producto actualizado.', producto: publicProduct(product, true) });
    } catch { res.status(503).json({ message: 'No se pudo confirmar el cambio. Actualiza el catálogo antes de reintentar.' }); }
  }
  app.post('/api/admin/productos/:id', requireUser, requireAdmin, (req, res) => update(req, res, false));
  app.post('/api/admin/productos/:id/disponibilidad', requireUser, requireAdmin, (req, res) => update(req, res, true));
}
