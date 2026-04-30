const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { authenticate, signToken } = require('../middleware/auth');

// ── POST /api/auth/register ───────────────────────────────────────
router.post('/register', (req, res) => {
  const { email, password, name, role = 'buyer', company_name, buyer_type = 'minorista' } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'email, password y name son requeridos' });
  }
  if (!['distributor', 'buyer'].includes(role)) {
    return res.status(400).json({ error: 'role debe ser distributor o buyer' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'password debe tener al menos 6 caracteres' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'El email ya está registrado' });

  const id = uuidv4();
  const hashed = bcrypt.hashSync(password, 10);

  db.transaction(() => {
    db.prepare('INSERT INTO users (id, email, password, name, role) VALUES (?,?,?,?,?)').run(id, email, hashed, name, role);
    if (role === 'distributor') {
      db.prepare('INSERT INTO distributor_profiles (user_id, company_name, plan_id, verified) VALUES (?,?,?,?)').run(id, company_name || name, 'free', 0);
    } else {
      db.prepare('INSERT INTO buyer_profiles (user_id, company_name, buyer_type) VALUES (?,?,?)').run(id, company_name || name, buyer_type);
    }
  })();

  const token = signToken({ id, email, name, role });
  res.status(201).json({ token, user: { id, email, name, role } });
});

// ── POST /api/auth/login ──────────────────────────────────────────
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email y password requeridos' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }

  let profile = null;
  if (user.role === 'distributor') {
    profile = db.prepare('SELECT * FROM distributor_profiles WHERE user_id = ?').get(user.id);
  } else if (user.role === 'buyer') {
    profile = db.prepare('SELECT * FROM buyer_profiles WHERE user_id = ?').get(user.id);
  }

  const token = signToken({ id: user.id, email: user.email, name: user.name, role: user.role });
  const { password: _pw, ...safeUser } = user;
  res.json({ token, user: safeUser, profile });
});

// ── GET /api/auth/me ──────────────────────────────────────────────
router.get('/me', authenticate, (req, res) => {
  const user = db.prepare('SELECT id, email, name, role, phone, avatar, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  let profile = null;
  if (user.role === 'distributor') {
    profile = db.prepare('SELECT * FROM distributor_profiles WHERE user_id = ?').get(user.id);
  } else if (user.role === 'buyer') {
    profile = db.prepare('SELECT * FROM buyer_profiles WHERE user_id = ?').get(user.id);
  }
  res.json({ user, profile });
});

// ── PUT /api/auth/profile ─────────────────────────────────────────
router.put('/profile', authenticate, (req, res) => {
  const { name, phone, company_name, description, city } = req.body;
  if (name) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, req.user.id);
  if (phone) db.prepare('UPDATE users SET phone = ? WHERE id = ?').run(phone, req.user.id);
  if (req.user.role === 'distributor' && (company_name || description || city)) {
    if (company_name) db.prepare('UPDATE distributor_profiles SET company_name = ? WHERE user_id = ?').run(company_name, req.user.id);
    if (description)  db.prepare('UPDATE distributor_profiles SET description = ? WHERE user_id = ?').run(description, req.user.id);
    if (city)         db.prepare('UPDATE distributor_profiles SET city = ? WHERE user_id = ?').run(city, req.user.id);
  }
  res.json({ message: 'Perfil actualizado' });
});

module.exports = router;
