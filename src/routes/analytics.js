const router = require('express').Router();
const db = require('../database/db');
const { authenticate, authorize } = require('../middleware/auth');

// ── GET /api/analytics/distributor — KPIs del distribuidor ────────
router.get('/distributor', authenticate, authorize('distributor'), (req, res) => {
  const id = req.user.id;
  const { period = '30' } = req.query; // días

  const sinceDate = `datetime('now', '-${parseInt(period)} days')`;

  // Ventas totales y número de pedidos
  const salesStats = db.prepare(`
    SELECT
      COUNT(*) AS total_orders,
      SUM(total) AS revenue,
      AVG(total) AS avg_order_value,
      SUM(CASE WHEN status = 'entregado' THEN total ELSE 0 END) AS confirmed_revenue,
      SUM(CASE WHEN status = 'pendiente' THEN 1 ELSE 0 END) AS pending_orders,
      SUM(CASE WHEN status = 'en_camino' THEN 1 ELSE 0 END) AS shipping_orders
    FROM orders
    WHERE distributor_id = ? AND created_at >= ${sinceDate}
  `).get(id);

  // Ventas por día (últimos 7 días)
  const dailySales = db.prepare(`
    SELECT
      date(created_at) AS day,
      COUNT(*) AS orders,
      SUM(total) AS revenue
    FROM orders
    WHERE distributor_id = ? AND status != 'cancelado' AND created_at >= datetime('now', '-7 days')
    GROUP BY date(created_at)
    ORDER BY day ASC
  `).all(id);

  // Top 5 productos más vendidos
  const topProducts = db.prepare(`
    SELECT p.name, p.unit, SUM(oi.quantity) AS units_sold, SUM(oi.subtotal) AS revenue
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    JOIN products p ON oi.product_id = p.id
    WHERE o.distributor_id = ? AND o.status != 'cancelado' AND o.created_at >= ${sinceDate}
    GROUP BY oi.product_id
    ORDER BY revenue DESC
    LIMIT 5
  `).all(id);

  // Top compradores
  const topBuyers = db.prepare(`
    SELECT u.name AS buyer_name, bp.buyer_type, COUNT(o.id) AS orders, SUM(o.total) AS total_spent
    FROM orders o
    JOIN users u ON o.buyer_id = u.id
    LEFT JOIN buyer_profiles bp ON o.buyer_id = bp.user_id
    WHERE o.distributor_id = ? AND o.status != 'cancelado' AND o.created_at >= ${sinceDate}
    GROUP BY o.buyer_id
    ORDER BY total_spent DESC
    LIMIT 5
  `).all(id);

  // Inventario crítico (stock bajo)
  const lowStock = db.prepare(`
    SELECT name, sku, stock, min_order, unit
    FROM products
    WHERE distributor_id = ? AND active = 1 AND stock <= min_order * 2
    ORDER BY stock ASC
    LIMIT 10
  `).all(id);

  // Rating y reseñas
  const reviewStats = db.prepare(`
    SELECT COUNT(*) AS total_reviews, ROUND(AVG(rating), 1) AS avg_rating
    FROM reviews WHERE distributor_id = ?
  `).get(id);

  // Comisiones pagadas a la plataforma
  const commissions = db.prepare(`
    SELECT SUM(pc.amount) AS total_commissions
    FROM platform_commissions pc
    JOIN orders o ON pc.order_id = o.id
    WHERE o.distributor_id = ? AND o.created_at >= ${sinceDate}
  `).get(id);

  res.json({
    period_days: parseInt(period),
    sales: salesStats,
    daily_sales: dailySales,
    top_products: topProducts,
    top_buyers: topBuyers,
    low_stock: lowStock,
    reviews: reviewStats,
    commissions_paid: commissions?.total_commissions || 0,
  });
});

// ── GET /api/analytics/buyer — ahorros del comprador ─────────────
router.get('/buyer', authenticate, authorize('buyer'), (req, res) => {
  const id = req.user.id;

  // Total ahorrado (diferencia precio retail - precio pagado)
  const savings = db.prepare(`
    SELECT
      SUM((oi.quantity * p.price_retail) - oi.subtotal) AS total_saved,
      SUM(oi.subtotal) AS total_spent,
      COUNT(DISTINCT o.id) AS total_orders,
      COUNT(DISTINCT o.distributor_id) AS distributors_used
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    JOIN products p ON oi.product_id = p.id
    WHERE o.buyer_id = ? AND o.status != 'cancelado' AND p.price_retail IS NOT NULL
  `).get(id);

  // Pedidos por mes (últimos 6 meses)
  const monthlyOrders = db.prepare(`
    SELECT strftime('%Y-%m', created_at) AS month, COUNT(*) AS orders, SUM(total) AS spent
    FROM orders
    WHERE buyer_id = ? AND status != 'cancelado' AND created_at >= datetime('now', '-6 months')
    GROUP BY month ORDER BY month ASC
  `).all(id);

  // Categorías más compradas
  const topCategories = db.prepare(`
    SELECT c.name, c.icon, SUM(oi.quantity) AS units, SUM(oi.subtotal) AS spent
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    JOIN products p ON oi.product_id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE o.buyer_id = ? AND o.status != 'cancelado'
    GROUP BY p.category_id ORDER BY spent DESC LIMIT 5
  `).all(id);

  res.json({ savings, monthly_orders: monthlyOrders, top_categories: topCategories });
});

// ── GET /api/analytics/platform — métricas globales (admin) ───────
router.get('/platform', authenticate, authorize('admin'), (req, res) => {
  const { period = '30' } = req.query;
  const sinceDate = `datetime('now', '-${parseInt(period)} days')`;

  const overview = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM users WHERE role = 'distributor') AS total_distributors,
      (SELECT COUNT(*) FROM users WHERE role = 'buyer') AS total_buyers,
      (SELECT COUNT(*) FROM products WHERE active = 1) AS active_products,
      (SELECT COUNT(*) FROM orders WHERE created_at >= ${sinceDate}) AS orders_period,
      (SELECT SUM(total) FROM orders WHERE status != 'cancelado' AND created_at >= ${sinceDate}) AS gmv_period,
      (SELECT SUM(amount) FROM platform_commissions WHERE settled_at IS NOT NULL AND rowid IN (
        SELECT pc.rowid FROM platform_commissions pc JOIN orders o ON pc.order_id = o.id WHERE o.created_at >= ${sinceDate}
      )) AS commissions_period
  `).get();

  // GMV por día
  const dailyGmv = db.prepare(`
    SELECT date(created_at) AS day, COUNT(*) AS orders, SUM(total) AS gmv
    FROM orders WHERE status != 'cancelado' AND created_at >= datetime('now', '-30 days')
    GROUP BY day ORDER BY day ASC
  `).all();

  // Top distribuidores por ventas
  const topDistributors = db.prepare(`
    SELECT dp.company_name, dp.plan_id, COUNT(o.id) AS orders, SUM(o.total) AS revenue, dp.rating
    FROM orders o JOIN distributor_profiles dp ON o.distributor_id = dp.user_id
    WHERE o.status != 'cancelado' AND o.created_at >= ${sinceDate}
    GROUP BY o.distributor_id ORDER BY revenue DESC LIMIT 10
  `).all();

  // Ingresos por suscripción
  const subscriptionRevenue = db.prepare(`
    SELECT sp.name, sp.price, COUNT(ds.id) AS active_subs, sp.price * COUNT(ds.id) AS monthly_revenue
    FROM distributor_subscriptions ds
    JOIN subscription_plans sp ON ds.plan_id = sp.id
    WHERE ds.status = 'active' GROUP BY ds.plan_id ORDER BY monthly_revenue DESC
  `).all();

  res.json({
    period_days: parseInt(period),
    overview,
    daily_gmv: dailyGmv,
    top_distributors: topDistributors,
    subscription_revenue: subscriptionRevenue,
  });
});

module.exports = router;
