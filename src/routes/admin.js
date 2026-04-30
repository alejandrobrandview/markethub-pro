const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { authenticate, authorize } = require('../middleware/auth');

// Todas las rutas requieren admin
router.use(authenticate, authorize('admin'));

// ══════════════════════════════════════════════════════════════════
// USUARIOS
// ══════════════════════════════════════════════════════════════════

// GET /api/admin/users
router.get('/users', (req, res) => {
  const { role, search, limit = 50, offset = 0 } = req.query;
  let sql = `
    SELECT u.id, u.email, u.name, u.role, u.phone, u.created_at,
           dp.company_name AS dist_company, dp.plan_id, dp.verified, dp.rating,
           bp.company_name AS buyer_company, bp.buyer_type
    FROM users u
    LEFT JOIN distributor_profiles dp ON u.id = dp.user_id
    LEFT JOIN buyer_profiles bp ON u.id = bp.user_id
    WHERE 1=1
  `;
  const params = [];
  if (role)   { sql += ' AND u.role = ?'; params.push(role); }
  if (search) { sql += ' AND (u.name LIKE ? OR u.email LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  sql += ' ORDER BY u.created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const users = db.prepare(sql).all(...params);
  const total = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  res.json({ users, total });
});

// PUT /api/admin/users/:id/verify
router.put('/users/:id/verify', (req, res) => {
  const { verified } = req.body;
  db.prepare('UPDATE distributor_profiles SET verified = ? WHERE user_id = ?').run(verified ? 1 : 0, req.params.id);
  res.json({ message: `Distribuidor ${verified ? 'verificado' : 'des-verificado'}` });
});

// DELETE /api/admin/users/:id — desactivar (soft delete via role change marker)
router.delete('/users/:id', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (user.role === 'admin') return res.status(400).json({ error: 'No puedes eliminar un admin' });
  // Marcar productos como inactivos si es distribuidor
  if (user.role === 'distributor') {
    db.prepare('UPDATE products SET active = 0 WHERE distributor_id = ?').run(req.params.id);
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ message: 'Usuario eliminado' });
});

// ══════════════════════════════════════════════════════════════════
// COMISIONES
// ══════════════════════════════════════════════════════════════════

// GET /api/admin/commissions
router.get('/commissions', (req, res) => {
  const { settled, limit = 50, offset = 0 } = req.query;
  let sql = `
    SELECT pc.*, o.total AS order_total, o.status AS order_status, o.created_at AS order_date,
           dp.company_name AS distributor_name, u.name AS buyer_name
    FROM platform_commissions pc
    JOIN orders o ON pc.order_id = o.id
    JOIN distributor_profiles dp ON o.distributor_id = dp.user_id
    JOIN users u ON o.buyer_id = u.id
    WHERE 1=1
  `;
  const params = [];
  if (settled === '1') { sql += ' AND pc.settled_at IS NOT NULL'; }
  if (settled === '0') { sql += ' AND pc.settled_at IS NULL'; }
  sql += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const commissions = db.prepare(sql).all(...params);
  const totals = db.prepare(`
    SELECT SUM(amount) AS total, SUM(CASE WHEN settled_at IS NOT NULL THEN amount ELSE 0 END) AS settled,
           SUM(CASE WHEN settled_at IS NULL THEN amount ELSE 0 END) AS pending
    FROM platform_commissions
  `).get();

  res.json({ commissions, totals });
});

// PUT /api/admin/commissions/:id/settle
router.put('/commissions/:id/settle', (req, res) => {
  db.prepare("UPDATE platform_commissions SET settled_at = datetime('now') WHERE id = ?").run(req.params.id);
  res.json({ message: 'Comisión marcada como liquidada' });
});

// ══════════════════════════════════════════════════════════════════
// SUSCRIPCIONES
// ══════════════════════════════════════════════════════════════════

// GET /api/admin/subscriptions
router.get('/subscriptions', (req, res) => {
  const subs = db.prepare(`
    SELECT ds.*, sp.name AS plan_name, sp.price, dp.company_name, u.email
    FROM distributor_subscriptions ds
    JOIN subscription_plans sp ON ds.plan_id = sp.id
    JOIN distributor_profiles dp ON ds.distributor_id = dp.user_id
    JOIN users u ON ds.distributor_id = u.id
    ORDER BY ds.started_at DESC
  `).all();
  res.json({ subscriptions: subs });
});

// PUT /api/admin/subscriptions/:distributorId — cambiar plan
router.put('/subscriptions/:distributorId', (req, res) => {
  const { plan_id } = req.body;
  if (!plan_id) return res.status(400).json({ error: 'plan_id requerido' });

  const plan = db.prepare('SELECT * FROM subscription_plans WHERE id = ?').get(plan_id);
  if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });

  const nextYear = new Date(Date.now() + 365*24*60*60*1000).toISOString();
  const existing = db.prepare('SELECT * FROM distributor_subscriptions WHERE distributor_id = ?').get(req.params.distributorId);

  if (existing) {
    db.prepare("UPDATE distributor_subscriptions SET plan_id = ?, status = 'active', expires_at = ? WHERE distributor_id = ?").run(plan_id, nextYear, req.params.distributorId);
  } else {
    db.prepare('INSERT INTO distributor_subscriptions (id, distributor_id, plan_id, status, expires_at) VALUES (?,?,?,?,?)').run(uuidv4(), req.params.distributorId, plan_id, 'active', nextYear);
  }
  db.prepare('UPDATE distributor_profiles SET plan_id = ? WHERE user_id = ?').run(plan_id, req.params.distributorId);

  res.json({ message: `Plan actualizado a ${plan.name}` });
});

// ══════════════════════════════════════════════════════════════════
// DESTACADOS (FEATURED SPOTS)
// ══════════════════════════════════════════════════════════════════

// GET /api/admin/featured
router.get('/featured', (req, res) => {
  const spots = db.prepare(`
    SELECT fs.*, dp.company_name, p.name AS product_name
    FROM featured_spots fs
    JOIN distributor_profiles dp ON fs.distributor_id = dp.user_id
    LEFT JOIN products p ON fs.product_id = p.id
    ORDER BY fs.start_date DESC
  `).all();
  res.json({ spots });
});

// POST /api/admin/featured — vender un espacio destacado
router.post('/featured', (req, res) => {
  const { distributor_id, product_id, position, price, start_date, end_date } = req.body;
  if (!distributor_id || !position || !price || !start_date || !end_date) {
    return res.status(400).json({ error: 'distributor_id, position, price, start_date y end_date son requeridos' });
  }
  const POSITIONS = ['banner', 'top_search', 'category', 'push'];
  if (!POSITIONS.includes(position)) return res.status(400).json({ error: `position debe ser: ${POSITIONS.join(', ')}` });

  const id = uuidv4();
  db.prepare(`
    INSERT INTO featured_spots (id, distributor_id, product_id, position, price, start_date, end_date)
    VALUES (?,?,?,?,?,?,?)
  `).run(id, distributor_id, product_id || null, position, price, start_date, end_date);

  res.status(201).json({ spot_id: id, message: 'Espacio destacado creado' });
});

// DELETE /api/admin/featured/:id
router.delete('/featured/:id', (req, res) => {
  db.prepare('UPDATE featured_spots SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Destacado desactivado' });
});

// ══════════════════════════════════════════════════════════════════
// RESUMEN DASHBOARD ADMIN
// ══════════════════════════════════════════════════════════════════

// GET /api/admin/dashboard
router.get('/dashboard', (req, res) => {
  const stats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM users WHERE role = 'distributor') AS distributors,
      (SELECT COUNT(*) FROM users WHERE role = 'buyer') AS buyers,
      (SELECT COUNT(*) FROM products WHERE active = 1) AS active_products,
      (SELECT COUNT(*) FROM orders WHERE status = 'pendiente') AS pending_orders,
      (SELECT ROUND(SUM(total),2) FROM orders WHERE status != 'cancelado' AND created_at >= datetime('now','-30 days')) AS gmv_30d,
      (SELECT ROUND(SUM(amount),2) FROM platform_commissions WHERE settled_at IS NOT NULL) AS total_commissions_settled,
      (SELECT ROUND(SUM(amount),2) FROM platform_commissions WHERE settled_at IS NULL) AS commissions_pending,
      (SELECT COUNT(*) FROM distributor_subscriptions WHERE status = 'active' AND plan_id != 'free') AS paying_distributors
  `).get();

  const recentOrders = db.prepare(`
    SELECT o.id, o.total, o.status, o.created_at, dp.company_name AS distributor, u.name AS buyer
    FROM orders o
    JOIN distributor_profiles dp ON o.distributor_id = dp.user_id
    JOIN users u ON o.buyer_id = u.id
    ORDER BY o.created_at DESC LIMIT 10
  `).all();

  res.json({ stats, recent_orders: recentOrders });
});

module.exports = router;
