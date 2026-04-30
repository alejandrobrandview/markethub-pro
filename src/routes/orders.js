const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { authenticate, authorize } = require('../middleware/auth');

// ── GET /api/orders — mis pedidos ─────────────────────────────────
router.get('/', authenticate, (req, res) => {
  const { status, limit = 20, offset = 0 } = req.query;
  let sql, params;

  if (req.user.role === 'buyer') {
    sql = 'SELECT o.*, dp.company_name AS distributor_name FROM orders o LEFT JOIN distributor_profiles dp ON o.distributor_id = dp.user_id WHERE o.buyer_id = ?';
    params = [req.user.id];
  } else if (req.user.role === 'distributor') {
    sql = 'SELECT o.*, u.name AS buyer_name FROM orders o LEFT JOIN users u ON o.buyer_id = u.id WHERE o.distributor_id = ?';
    params = [req.user.id];
  } else {
    // admin
    sql = 'SELECT o.*, u.name AS buyer_name, dp.company_name AS distributor_name FROM orders o LEFT JOIN users u ON o.buyer_id = u.id LEFT JOIN distributor_profiles dp ON o.distributor_id = dp.user_id WHERE 1=1';
    params = [];
  }

  if (status) { sql += ' AND o.status = ?'; params.push(status); }
  sql += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const orders = db.prepare(sql).all(...params);

  // Adjuntar items a cada pedido
  const ordersWithItems = orders.map(o => {
    const items = db.prepare(`
      SELECT oi.*, p.name AS product_name, p.unit FROM order_items oi
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ?
    `).all(o.id);
    return { ...o, items };
  });

  res.json({ orders: ordersWithItems });
});

// ── GET /api/orders/:id — detalle de pedido ───────────────────────
router.get('/:id', authenticate, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

  // Solo partes involucradas o admin
  if (req.user.role !== 'admin' && order.buyer_id !== req.user.id && order.distributor_id !== req.user.id) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  const items = db.prepare(`
    SELECT oi.*, p.name AS product_name, p.unit, p.image_url FROM order_items oi
    LEFT JOIN products p ON oi.product_id = p.id
    WHERE oi.order_id = ?
  `).all(req.params.id);

  const buyer = db.prepare('SELECT id, name, email, phone FROM users WHERE id = ?').get(order.buyer_id);
  const distributor = db.prepare('SELECT dp.*, u.email FROM distributor_profiles dp LEFT JOIN users u ON dp.user_id = u.id WHERE dp.user_id = ?').get(order.distributor_id);

  res.json({ order, items, buyer, distributor });
});

// ── POST /api/orders — crear pedido (buyer) ───────────────────────
router.post('/', authenticate, authorize('buyer'), (req, res) => {
  const { items, delivery_address, notes, payment_method = 'transferencia' } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items es requerido y debe ser un arreglo' });
  }

  // Validar que todos los items sean del mismo distribuidor
  const productIds = items.map(i => i.product_id);
  const products = productIds.map(id => db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(id));
  if (products.some(p => !p)) return res.status(400).json({ error: 'Uno o más productos no existen' });

  const distIds = [...new Set(products.map(p => p.distributor_id))];
  if (distIds.length > 1) return res.status(400).json({ error: 'Todos los productos deben ser del mismo distribuidor' });

  const distributor_id = distIds[0];

  // Calcular total y verificar stock
  let total = 0;
  const orderItems = items.map((item, idx) => {
    const product = products[idx];
    if (product.stock < item.quantity) {
      throw { status: 400, message: `Stock insuficiente para "${product.name}" (disponible: ${product.stock})` };
    }
    const subtotal = product.price * item.quantity;
    total += subtotal;
    return { product, quantity: item.quantity, unit_price: product.price, subtotal };
  });

  // Obtener tasa de comisión según suscripción del distribuidor
  const profile = db.prepare('SELECT plan_id FROM distributor_profiles WHERE user_id = ?').get(distributor_id);
  const plan = db.prepare('SELECT commission_rate FROM subscription_plans WHERE id = ?').get(profile?.plan_id || 'free');
  const commission_rate = plan?.commission_rate || 0.025;
  const commission_amount = parseFloat((total * commission_rate).toFixed(2));

  const orderId = uuidv4();

  db.transaction(() => {
    db.prepare(`
      INSERT INTO orders (id, buyer_id, distributor_id, status, total, commission_rate, commission_amount, delivery_address, notes, payment_method)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(orderId, req.user.id, distributor_id, 'pendiente', total, commission_rate, commission_amount, delivery_address || '', notes || '', payment_method);

    orderItems.forEach(i => {
      db.prepare('INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, subtotal) VALUES (?,?,?,?,?,?)').run(
        uuidv4(), orderId, i.product.id, i.quantity, i.unit_price, i.subtotal
      );
      // Descontar stock
      db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(i.quantity, i.product.id);
    });

    // Registrar comisión de la plataforma
    db.prepare('INSERT INTO platform_commissions (id, order_id, amount, rate) VALUES (?,?,?,?)').run(
      uuidv4(), orderId, commission_amount, commission_rate
    );
  })();

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  res.status(201).json({ order, message: `Pedido creado. Comisión plataforma: $${commission_amount}` });
});

// ── PUT /api/orders/:id/status — actualizar estado ────────────────
router.put('/:id/status', authenticate, (req, res) => {
  const { status } = req.body;
  const VALID = ['pendiente', 'confirmado', 'en_camino', 'entregado', 'cancelado'];
  if (!VALID.includes(status)) return res.status(400).json({ error: 'Status inválido' });

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

  // Solo el distribuidor puede confirmar/despachar; solo el comprador puede cancelar pedidos pendientes
  if (req.user.role === 'distributor' && order.distributor_id !== req.user.id) {
    return res.status(403).json({ error: 'No es tu pedido' });
  }
  if (req.user.role === 'buyer' && !(order.buyer_id === req.user.id && status === 'cancelado')) {
    return res.status(403).json({ error: 'Los compradores solo pueden cancelar pedidos pendientes' });
  }

  db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, req.params.id);

  // Si se entrega, marcar comisión como liquidada
  if (status === 'entregado') {
    db.prepare("UPDATE platform_commissions SET settled_at = datetime('now') WHERE order_id = ?").run(req.params.id);
  }

  res.json({ message: `Pedido actualizado a: ${status}` });
});

module.exports = router;
