require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middlewares globales ──────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes, intenta en 15 minutos.' }
});
app.use('/api', limiter);

// ── Archivos estáticos ────────────────────────────────────────────
// Sirve index.html y app-movil.html desde la raíz del proyecto
app.use(express.static(path.join(__dirname)));

// ── Rutas API ─────────────────────────────────────────────────────
app.use('/api/auth',      require('./src/routes/auth'));
app.use('/api/products',  require('./src/routes/products'));
app.use('/api/orders',    require('./src/routes/orders'));
app.use('/api/inventory', require('./src/routes/inventory'));
app.use('/api/analytics', require('./src/routes/analytics'));
app.use('/api/admin',      require('./src/routes/admin'));
app.use('/api/promotions', require('./src/routes/promotions'));
app.use('/api/chat',      require('./src/routes/chat'));

// ── Health check ──────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() });
});

// ── Fallback → sirve index.html para SPA ─────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── Manejo de errores global ──────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Error interno del servidor'
  });
});

// ── Inicio del servidor ───────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 MarketHub Pro corriendo en http://localhost:${PORT}`);
  console.log(`📦 API disponible en http://localhost:${PORT}/api`);
  console.log(`🔧 Entorno: ${process.env.NODE_ENV || 'development'}\n`);
});

module.exports = app;
