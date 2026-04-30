const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/chat/conversations ──────────────────────────────────────
// Lista todas las conversaciones del usuario autenticado
router.get('/conversations', authenticate, (req, res) => {
  const uid = req.user.id;
  const role = req.user.role;

  let rows;
  if (role === 'distributor') {
    rows = db.prepare(`
      SELECT c.*,
        u.name  AS buyer_name,  u.avatar  AS buyer_avatar,
        p.name  AS product_name
      FROM conversations c
      JOIN users u ON u.id = c.buyer_id
      LEFT JOIN products p ON p.id = c.product_id
      WHERE c.distributor_id = ?
      ORDER BY c.last_at DESC
    `).all(uid);
  } else {
    rows = db.prepare(`
      SELECT c.*,
        u.name  AS dist_name, u.avatar AS dist_avatar,
        dp.company_name,
        p.name  AS product_name
      FROM conversations c
      JOIN users u ON u.id = c.distributor_id
      LEFT JOIN distributor_profiles dp ON dp.user_id = c.distributor_id
      LEFT JOIN products p ON p.id = c.product_id
      WHERE c.buyer_id = ?
      ORDER BY c.last_at DESC
    `).all(uid);
  }

  res.json({ conversations: rows });
});

// ── POST /api/chat/conversations ─────────────────────────────────────
// Crea o retorna conversación existente entre buyer y distributor
router.post('/conversations', authenticate, (req, res) => {
  const { distributor_id, product_id } = req.body;
  const buyer_id = req.user.id;

  if (!distributor_id) {
    return res.status(400).json({ error: 'distributor_id requerido' });
  }

  // Buscar si ya existe
  const existing = db.prepare(`
    SELECT * FROM conversations
    WHERE buyer_id = ? AND distributor_id = ?
      AND (product_id = ? OR (product_id IS NULL AND ? IS NULL))
    LIMIT 1
  `).get(buyer_id, distributor_id, product_id || null, product_id || null);

  if (existing) return res.json({ conversation: existing });

  const id = uuidv4();
  db.prepare(`
    INSERT INTO conversations (id, buyer_id, distributor_id, product_id)
    VALUES (?, ?, ?, ?)
  `).run(id, buyer_id, distributor_id, product_id || null);

  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  res.status(201).json({ conversation: conv });
});

// ── GET /api/chat/conversations/:id/messages ─────────────────────────
// Obtiene mensajes de una conversación y marca como leídos
router.get('/conversations/:id/messages', authenticate, (req, res) => {
  const { id } = req.params;
  const uid = req.user.id;

  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' });
  if (conv.buyer_id !== uid && conv.distributor_id !== uid) {
    return res.status(403).json({ error: 'Sin acceso' });
  }

  const messages = db.prepare(`
    SELECT m.*, u.name AS sender_name, u.avatar AS sender_avatar, u.role AS sender_role
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    WHERE m.conversation_id = ?
    ORDER BY m.created_at ASC
  `).all(id);

  // Marcar como leídos los mensajes del otro lado
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE messages SET read_at = ?
    WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL
  `).run(now, id, uid);

  // Resetear contador de no leídos para este usuario
  if (conv.buyer_id === uid) {
    db.prepare('UPDATE conversations SET unread_buyer = 0 WHERE id = ?').run(id);
  } else {
    db.prepare('UPDATE conversations SET unread_dist = 0 WHERE id = ?').run(id);
  }

  res.json({ messages });
});

// ── POST /api/chat/conversations/:id/messages ────────────────────────
// Envía un mensaje en la conversación
router.post('/conversations/:id/messages', authenticate, (req, res) => {
  const { id } = req.params;
  const { body } = req.body;
  const uid = req.user.id;

  if (!body || !body.trim()) {
    return res.status(400).json({ error: 'El mensaje no puede estar vacío' });
  }

  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' });
  if (conv.buyer_id !== uid && conv.distributor_id !== uid) {
    return res.status(403).json({ error: 'Sin acceso' });
  }

  const msgId = uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO messages (id, conversation_id, sender_id, body, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(msgId, id, uid, body.trim(), now);

  // Actualizar last_message y contador de no leídos en la conversación
  const isFromBuyer = conv.buyer_id === uid;
  db.prepare(`
    UPDATE conversations
    SET last_message = ?,
        last_at = ?,
        unread_buyer = CASE WHEN ? THEN 0 ELSE unread_buyer + 1 END,
        unread_dist  = CASE WHEN ? THEN unread_dist + 1 ELSE 0 END
    WHERE id = ?
  `).run(body.trim(), now, isFromBuyer ? 1 : 0, isFromBuyer ? 1 : 0, id);

  const msg = db.prepare(`
    SELECT m.*, u.name AS sender_name, u.avatar AS sender_avatar, u.role AS sender_role
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    WHERE m.id = ?
  `).get(msgId);

  res.status(201).json({ message: msg });
});

// ── GET /api/chat/unread ──────────────────────────────────────────────
// Número total de mensajes no leídos para el usuario actual
router.get('/unread', authenticate, (req, res) => {
  const uid = req.user.id;
  const role = req.user.role;

  let result;
  if (role === 'distributor') {
    result = db.prepare(`
      SELECT COALESCE(SUM(unread_dist), 0) AS total
      FROM conversations WHERE distributor_id = ?
    `).get(uid);
  } else {
    result = db.prepare(`
      SELECT COALESCE(SUM(unread_buyer), 0) AS total
      FROM conversations WHERE buyer_id = ?
    `).get(uid);
  }

  res.json({ unread: result.total });
});

module.exports = router;
