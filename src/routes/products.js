const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { authenticate, authorize } = require('../middleware/auth');

// ── GET /api/products — catálogo público ─────────────────────────
router.get('/', (req, res) => {
  const { category, distributor_id, search, featured, limit = 50, offset = 0 } = req.query;

  let sql = `
    SELECT p.*, dp.company_name AS distributor_name, dp.rating AS distributor_rating, c.name AS category_name, c.icon AS category_icon
    FROM products p
    LEFT JOIN distributor_profiles dp ON p.distributor_id = dp.user_id
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.active = 1
  `;
  const params = [];

  if (category)        { sql += ' AND p.category_id = ?';    params.push(category); }
  if (distributor_id)  { sql += ' AND p.distributor_id = ?'; params.push(distributor_id); }
  if (featured === '1'){ sql += ' AND p.featured = 1'; }
  if (search)          { sql += ' AND (p.name LIKE ? OR p.description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

  sql += ' ORDER BY p.featured DESC, p.created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const products = db.prepare(sql).all(...params);
  res.json({ products, total: products.length });
});

// ── GET /api/products/categories — lista de categorías ────────────
router.get('/categories', (req, res) => {
  const cats = db.prepare('SELECT * FROM categories ORDER BY name').all();
  res.json({ categories: cats });
});

// ── GET /api/products/:id — detalle de producto ───────────────────
router.get('/:id', (req, res) => {
  const product = db.prepare(`
    SELECT p.*, dp.company_name AS distributor_name, dp.rating AS distributor_rating, dp.description AS distributor_description,
           c.name AS category_name, c.icon AS category_icon
    FROM products p
    LEFT JOIN distributor_profiles dp ON p.distributor_id = dp.user_id
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.id = ? AND p.active = 1
  `).get(req.params.id);

  if (!product) return res.status(404).json({ error: 'Producto no encontrado' });

  const promotions = db.prepare(`
    SELECT * FROM promotions WHERE product_id = ? AND active = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))
  `).all(req.params.id);

  res.json({ product, promotions });
});

// ── POST /api/products — crear producto (distributor) ─────────────
router.post('/', authenticate, authorize('distributor'), (req, res) => {
  const { name, sku, description, price, price_retail, unit = 'pieza', min_order = 1, stock = 0, category_id, featured = 0 } = req.body;
  if (!name || !price) return res.status(400).json({ error: 'name y price son requeridos' });

  // Verificar límite del plan
  const profile = db.prepare('SELECT plan_id FROM distributor_profiles WHERE user_id = ?').get(req.user.id);
  const plan = db.prepare('SELECT product_limit FROM subscription_plans WHERE id = ?').get(profile?.plan_id || 'free');
  const count = db.prepare('SELECT COUNT(*) AS c FROM products WHERE distributor_id = ? AND active = 1').get(req.user.id);
  if (count.c >= plan.product_limit) {
    return res.status(403).json({ error: `Tu plan permite máximo ${plan.product_limit} productos. Actualiza tu suscripción.` });
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO products (id, distributor_id, category_id, name, sku, description, price, price_retail, unit, min_order, stock, featured)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(id, req.user.id, category_id || null, name, sku || null, description || null, price, price_retail || null, unit, min_order, stock, featured ? 1 : 0);

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  res.status(201).json({ product });
});

// ── PUT /api/products/:id — editar producto ───────────────────────
router.put('/:id', authenticate, authorize('distributor', 'admin'), (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
  if (req.user.role === 'distributor' && product.distributor_id !== req.user.id) {
    return res.status(403).json({ error: 'No tienes permiso para editar este producto' });
  }

  const { name, description, price, price_retail, unit, min_order, stock, category_id, featured, active, image_url } = req.body;
  db.prepare(`
    UPDATE products SET
      name = COALESCE(?, name), description = COALESCE(?, description),
      price = COALESCE(?, price), price_retail = COALESCE(?, price_retail),
      unit = COALESCE(?, unit), min_order = COALESCE(?, min_order),
      stock = COALESCE(?, stock), category_id = COALESCE(?, category_id),
      featured = COALESCE(?, featured), active = COALESCE(?, active),
      image_url = COALESCE(?, image_url)
    WHERE id = ?
  `).run(name, description, price, price_retail, unit, min_order, stock, category_id, featured != null ? (featured ? 1 : 0) : null, active != null ? (active ? 1 : 0) : null, image_url, req.params.id);

  const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  res.json({ product: updated });
});

// ── DELETE /api/products/:id — desactivar producto ────────────────
router.delete('/:id', authenticate, authorize('distributor', 'admin'), (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
  if (req.user.role === 'distributor' && product.distributor_id !== req.user.id) {
    return res.status(403).json({ error: 'No tienes permiso' });
  }
  db.prepare('UPDATE products SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Producto desactivado' });
});

// ── GET /api/products/distributor/mine — mis productos ────────────
router.get('/distributor/mine', authenticate, authorize('distributor'), (req, res) => {
  const products = db.prepare(`
    SELECT p.*, c.name AS category_name FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.distributor_id = ? ORDER BY p.created_at DESC
  `).all(req.user.id);
  res.json({ products });
});

module.exports = router;
