const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { authenticate, authorize } = require('../middleware/auth');

// ── GET /api/promotions — todas las promociones activas (público) ───
router.get('/', (req, res) => {
  const { distributor_id, product_id, type } = req.query;

  let sql = `
    SELECT pr.*, p.name AS product_name, p.image_url AS product_image,
           dp.company_name AS distributor_name
    FROM promotions pr
    LEFT JOIN products p ON pr.product_id = p.id
    LEFT JOIN distributor_profiles dp ON pr.distributor_id = dp.user_id
    WHERE pr.active = 1
      AND (pr.expires_at IS NULL OR pr.expires_at > datetime('now'))
  `;
  const params = [];

  if (distributor_id) { sql += ' AND pr.distributor_id = ?'; params.push(distributor_id); }
  if (product_id)     { sql += ' AND pr.product_id = ?';     params.push(product_id); }
  if (type)           { sql += ' AND pr.type = ?';           params.push(type); }

  sql += ' ORDER BY pr.created_at DESC';

  const promotions = db.prepare(sql).all(...params);
  res.json({ promotions });
});

// ── GET /api/promotions/mine — mis promociones (distribuidor) ───────
router.get('/mine', authenticate, authorize('distributor'), (req, res) => {
  const promotions = db.prepare(`
    SELECT pr.*, p.name AS product_name, p.image_url AS product_image, p.price AS product_price
    FROM promotions pr
    LEFT JOIN products p ON pr.product_id = p.id
    WHERE pr.distributor_id = ?
    ORDER BY pr.created_at DESC
  `).all(req.user.id);

  res.json({ promotions });
});

// ── GET /api/promotions/:id — detalle de una promoción ──────────────
router.get('/:id', (req, res) => {
  const promo = db.prepare(`
    SELECT pr.*, p.name AS product_name, p.image_url AS product_image,
           p.price AS product_price, dp.company_name AS distributor_name
    FROM promotions pr
    LEFT JOIN products p ON pr.product_id = p.id
    LEFT JOIN distributor_profiles dp ON pr.distributor_id = dp.user_id
    WHERE pr.id = ?
  `).get(req.params.id);

  if (!promo) return res.status(404).json({ error: 'Promoción no encontrada' });
  res.json({ promotion: promo });
});

// ── POST /api/promotions — crear promoción (distribuidor) ────────────
router.post('/', authenticate, authorize('distributor'), (req, res) => {
  const {
    title,
    description,
    product_id,
    type = 'porcentaje',
    discount_pct = 0,
    discount_amount = 0,
    min_qty = 1,
    max_qty = null,
    expires_at = null,
    code = null
  } = req.body;

  if (!title) return res.status(400).json({ error: 'El título de la promoción es requerido' });

  // Validar tipo
  const validTypes = ['porcentaje', 'cantidad', '2x1', 'envio_gratis', 'volumen'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: `Tipo inválido. Opciones: ${validTypes.join(', ')}` });
  }

  // Si aplica a un producto, verificar que pertenece al distribuidor
  if (product_id) {
    const product = db.prepare('SELECT id FROM products WHERE id = ? AND distributor_id = ? AND active = 1').get(product_id, req.user.id);
    if (!product) return res.status(403).json({ error: 'Producto no encontrado o no te pertenece' });
  }

  // Verificar código único si se proporciona
  if (code) {
    const existing = db.prepare('SELECT id FROM promotions WHERE code = ? AND active = 1').get(code.toUpperCase());
    if (existing) return res.status(409).json({ error: 'Ya existe una promoción activa con ese código' });
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO promotions (id, distributor_id, product_id, title, description, type,
                            discount_pct, discount_amount, min_qty, max_qty, expires_at, code, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    id, req.user.id, product_id || null, title, description || null, type,
    discount_pct, discount_amount, min_qty, max_qty || null,
    expires_at || null, code ? code.toUpperCase() : null
  );

  const promo = db.prepare('SELECT * FROM promotions WHERE id = ?').get(id);
  res.status(201).json({ promotion: promo });
});

// ── PUT /api/promotions/:id — editar promoción ───────────────────────
router.put('/:id', authenticate, authorize('distributor', 'admin'), (req, res) => {
  const promo = db.prepare('SELECT * FROM promotions WHERE id = ?').get(req.params.id);
  if (!promo) return res.status(404).json({ error: 'Promoción no encontrada' });
  if (req.user.role === 'distributor' && promo.distributor_id !== req.user.id) {
    return res.status(403).json({ error: 'No tienes permiso para editar esta promoción' });
  }

  const {
    title, description, product_id, type, discount_pct, discount_amount,
    min_qty, max_qty, expires_at, code, active
  } = req.body;

  // Verificar código único si se cambia
  if (code && code.toUpperCase() !== promo.code) {
    const existing = db.prepare('SELECT id FROM promotions WHERE code = ? AND active = 1 AND id != ?').get(code.toUpperCase(), req.params.id);
    if (existing) return res.status(409).json({ error: 'Ya existe una promoción activa con ese código' });
  }

  db.prepare(`
    UPDATE promotions SET
      title           = COALESCE(?, title),
      description     = COALESCE(?, description),
      product_id      = COALESCE(?, product_id),
      type            = COALESCE(?, type),
      discount_pct    = COALESCE(?, discount_pct),
      discount_amount = COALESCE(?, discount_amount),
      min_qty         = COALESCE(?, min_qty),
      max_qty         = COALESCE(?, max_qty),
      expires_at      = COALESCE(?, expires_at),
      code            = COALESCE(?, code),
      active          = COALESCE(?, active)
    WHERE id = ?
  `).run(
    title, description, product_id, type, discount_pct, discount_amount,
    min_qty, max_qty, expires_at, code ? code.toUpperCase() : null,
    active != null ? (active ? 1 : 0) : null,
    req.params.id
  );

  const updated = db.prepare(`
    SELECT pr.*, p.name AS product_name FROM promotions pr
    LEFT JOIN products p ON pr.product_id = p.id
    WHERE pr.id = ?
  `).get(req.params.id);

  res.json({ promotion: updated });
});

// ── PATCH /api/promotions/:id/toggle — activar/desactivar ───────────
router.patch('/:id/toggle', authenticate, authorize('distributor', 'admin'), (req, res) => {
  const promo = db.prepare('SELECT * FROM promotions WHERE id = ?').get(req.params.id);
  if (!promo) return res.status(404).json({ error: 'Promoción no encontrada' });
  if (req.user.role === 'distributor' && promo.distributor_id !== req.user.id) {
    return res.status(403).json({ error: 'No tienes permiso' });
  }

  const newActive = promo.active ? 0 : 1;
  db.prepare('UPDATE promotions SET active = ? WHERE id = ?').run(newActive, req.params.id);

  res.json({ promotion: { ...promo, active: newActive }, message: newActive ? 'Promoción activada' : 'Promoción desactivada' });
});

// ── DELETE /api/promotions/:id — eliminar promoción ─────────────────
router.delete('/:id', authenticate, authorize('distributor', 'admin'), (req, res) => {
  const promo = db.prepare('SELECT * FROM promotions WHERE id = ?').get(req.params.id);
  if (!promo) return res.status(404).json({ error: 'Promoción no encontrada' });
  if (req.user.role === 'distributor' && promo.distributor_id !== req.user.id) {
    return res.status(403).json({ error: 'No tienes permiso' });
  }

  db.prepare('DELETE FROM promotions WHERE id = ?').run(req.params.id);
  res.json({ message: 'Promoción eliminada' });
});

// ── POST /api/promotions/apply — calcular precio con promoción ───────
router.post('/apply', (req, res) => {
  const { product_id, quantity = 1, code = null } = req.body;
  if (!product_id) return res.status(400).json({ error: 'product_id es requerido' });

  const product = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(product_id);
  if (!product) return res.status(404).json({ error: 'Producto no encontrado' });

  let promo = null;

  if (code) {
    // Buscar por código
    promo = db.prepare(`
      SELECT * FROM promotions
      WHERE code = ? AND active = 1 AND (product_id = ? OR product_id IS NULL)
        AND (expires_at IS NULL OR expires_at > datetime('now'))
        AND min_qty <= ?
    `).get(code.toUpperCase(), product_id, quantity);
    if (!promo) return res.status(404).json({ error: 'Código de promoción inválido o no aplicable' });
  } else {
    // Mejor promoción automática para el producto y cantidad
    promo = db.prepare(`
      SELECT * FROM promotions
      WHERE product_id = ? AND active = 1
        AND (expires_at IS NULL OR expires_at > datetime('now'))
        AND min_qty <= ?
      ORDER BY discount_pct DESC, discount_amount DESC
      LIMIT 1
    `).get(product_id, quantity);
  }

  const originalPrice = product.price;
  let finalPrice = originalPrice;
  let discountApplied = 0;
  let promoLabel = null;

  if (promo) {
    switch (promo.type) {
      case 'porcentaje':
        discountApplied = originalPrice * (promo.discount_pct / 100);
        finalPrice = originalPrice - discountApplied;
        promoLabel = `${promo.discount_pct}% de descuento`;
        break;
      case 'cantidad':
        discountApplied = promo.discount_amount;
        finalPrice = Math.max(0, originalPrice - discountApplied);
        promoLabel = `-$${promo.discount_amount} de descuento`;
        break;
      case '2x1':
        // Precio por unidad baja a la mitad
        finalPrice = originalPrice / 2;
        discountApplied = originalPrice - finalPrice;
        promoLabel = '2 x 1 — pagas la mitad';
        break;
      case 'envio_gratis':
        finalPrice = originalPrice;
        promoLabel = 'Envío gratis incluido';
        break;
      case 'volumen':
        discountApplied = originalPrice * (promo.discount_pct / 100);
        finalPrice = originalPrice - discountApplied;
        promoLabel = `Descuento por volumen: ${promo.discount_pct}%`;
        break;
    }
  }

  res.json({
    product_id,
    quantity,
    original_price: originalPrice,
    final_price: Math.round(finalPrice * 100) / 100,
    discount_applied: Math.round(discountApplied * 100) / 100,
    savings_total: Math.round(discountApplied * quantity * 100) / 100,
    promotion: promo ? {
      id: promo.id,
      title: promo.title,
      type: promo.type,
      label: promoLabel
    } : null
  });
});

module.exports = router;
