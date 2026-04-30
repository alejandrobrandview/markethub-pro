const router = require('express').Router();
const db = require('../database/db');
const { authenticate, authorize } = require('../middleware/auth');

// ── GET /api/inventory — inventario del distribuidor ──────────────
router.get('/', authenticate, authorize('distributor', 'admin'), (req, res) => {
  const distId = req.user.role === 'admin' ? req.query.distributor_id : req.user.id;
  if (!distId) return res.status(400).json({ error: 'distributor_id requerido para admin' });

  const { low_stock, category_id } = req.query;

  let sql = `
    SELECT p.id, p.name, p.sku, p.stock, p.min_order, p.price, p.unit,
           c.name AS category_name, c.icon AS category_icon, p.active
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.distributor_id = ?
  `;
  const params = [distId];

  if (low_stock === '1') { sql += ' AND p.stock <= p.min_order * 2 AND p.stock > 0'; }
  if (low_stock === '0') { sql += ' AND p.stock = 0'; }     // sin stock
  if (category_id)       { sql += ' AND p.category_id = ?'; params.push(category_id); }

  sql += ' ORDER BY p.stock ASC, p.name ASC';

  const products = db.prepare(sql).all(...params);

  // Estadísticas rápidas
  const stats = db.prepare(`
    SELECT
      COUNT(*) AS total_products,
      SUM(CASE WHEN stock = 0 THEN 1 ELSE 0 END) AS out_of_stock,
      SUM(CASE WHEN stock > 0 AND stock <= min_order * 2 THEN 1 ELSE 0 END) AS low_stock,
      SUM(stock) AS total_units,
      SUM(stock * price) AS inventory_value
    FROM products WHERE distributor_id = ? AND active = 1
  `).get(distId);

  res.json({ inventory: products, stats });
});

// ── PUT /api/inventory/:productId — ajustar stock ─────────────────
router.put('/:productId', authenticate, authorize('distributor', 'admin'), (req, res) => {
  const { stock, operation } = req.body;
  // operation: 'set' | 'add' | 'subtract'

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.productId);
  if (!product) return res.status(404).json({ error: 'Producto no encontrado' });

  if (req.user.role === 'distributor' && product.distributor_id !== req.user.id) {
    return res.status(403).json({ error: 'No tienes permiso sobre este producto' });
  }
  if (stock == null || isNaN(Number(stock))) {
    return res.status(400).json({ error: 'stock debe ser un número' });
  }

  let newStock;
  const op = operation || 'set';
  if (op === 'add')       newStock = product.stock + Number(stock);
  else if (op === 'subtract') newStock = Math.max(0, product.stock - Number(stock));
  else                        newStock = Number(stock); // 'set'

  if (newStock < 0) return res.status(400).json({ error: 'Stock no puede ser negativo' });

  db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(newStock, req.params.productId);
  res.json({ product_id: req.params.productId, previous_stock: product.stock, new_stock: newStock, operation: op });
});

// ── PUT /api/inventory/bulk — ajuste masivo ───────────────────────
router.put('/bulk/update', authenticate, authorize('distributor', 'admin'), (req, res) => {
  const { updates } = req.body;
  // updates: [{ product_id, stock }]
  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({ error: 'updates debe ser un arreglo con al menos un elemento' });
  }

  const results = [];
  const updateStmt = db.prepare('UPDATE products SET stock = ? WHERE id = ? AND distributor_id = ?');
  const distId = req.user.role === 'admin' ? null : req.user.id;

  db.transaction(() => {
    updates.forEach(u => {
      if (u.product_id && u.stock != null) {
        const info = req.user.role === 'admin'
          ? db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(u.stock, u.product_id)
          : updateStmt.run(u.stock, u.product_id, distId);
        results.push({ product_id: u.product_id, updated: info.changes > 0 });
      }
    });
  })();

  res.json({ results, updated: results.filter(r => r.updated).length });
});

module.exports = router;
