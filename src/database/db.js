const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Asegurar que el directorio de datos exista
const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const DB_PATH = process.env.DB_PATH || path.join(dataDir, 'markethub.db');
const db = new Database(DB_PATH);

// Habilitar WAL para mejor concurrencia
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Creación de tablas ────────────────────────────────────────────
db.exec(`
  -- USUARIOS
  CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    email       TEXT UNIQUE NOT NULL,
    password    TEXT NOT NULL,
    name        TEXT NOT NULL,
    role        TEXT NOT NULL CHECK(role IN ('distributor','buyer','admin')),
    avatar      TEXT,
    phone       TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS distributor_profiles (
    user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    company_name TEXT NOT NULL,
    rfc          TEXT,
    logo_url     TEXT,
    cover_url    TEXT,
    description  TEXT,
    city         TEXT DEFAULT 'CDMX',
    plan_id      TEXT DEFAULT 'free',
    verified     INTEGER DEFAULT 0,
    rating       REAL DEFAULT 0,
    total_reviews INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS buyer_profiles (
    user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    company_name TEXT,
    buyer_type   TEXT DEFAULT 'minorista' CHECK(buyer_type IN ('minorista','mayorista')),
    address      TEXT,
    city         TEXT DEFAULT 'CDMX'
  );

  -- CATEGORÍAS
  CREATE TABLE IF NOT EXISTS categories (
    id        TEXT PRIMARY KEY,
    name      TEXT NOT NULL,
    icon      TEXT,
    parent_id TEXT REFERENCES categories(id)
  );

  -- PRODUCTOS
  CREATE TABLE IF NOT EXISTS products (
    id              TEXT PRIMARY KEY,
    distributor_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id     TEXT REFERENCES categories(id),
    name            TEXT NOT NULL,
    sku             TEXT,
    description     TEXT,
    price           REAL NOT NULL,
    price_retail    REAL,
    unit            TEXT DEFAULT 'pieza',
    min_order       INTEGER DEFAULT 1,
    stock           INTEGER DEFAULT 0,
    featured        INTEGER DEFAULT 0,
    active          INTEGER DEFAULT 1,
    image_url       TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
  );

  -- PROMOCIONES
  CREATE TABLE IF NOT EXISTS promotions (
    id              TEXT PRIMARY KEY,
    distributor_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id      TEXT REFERENCES products(id) ON DELETE CASCADE,
    title           TEXT NOT NULL DEFAULT 'Promoción',
    description     TEXT,
    code            TEXT UNIQUE,
    type            TEXT DEFAULT 'porcentaje' CHECK(type IN ('porcentaje','cantidad','2x1','envio_gratis','volumen')),
    discount_pct    REAL DEFAULT 0,
    discount_amount REAL DEFAULT 0,
    min_qty         INTEGER DEFAULT 1,
    max_qty         INTEGER,
    expires_at      TEXT,
    active          INTEGER DEFAULT 1,
    created_at      TEXT DEFAULT (datetime('now'))
  );

  -- Migración: agregar columnas faltantes si la tabla ya existe
  -- (ignorar errores si ya existen)


  -- PEDIDOS
  CREATE TABLE IF NOT EXISTS orders (
    id               TEXT PRIMARY KEY,
    buyer_id         TEXT NOT NULL REFERENCES users(id),
    distributor_id   TEXT NOT NULL REFERENCES users(id),
    status           TEXT DEFAULT 'pendiente' CHECK(status IN ('pendiente','confirmado','en_camino','entregado','cancelado')),
    total            REAL NOT NULL,
    commission_rate  REAL DEFAULT 0.025,
    commission_amount REAL DEFAULT 0,
    delivery_address TEXT,
    notes            TEXT,
    payment_method   TEXT DEFAULT 'transferencia',
    created_at       TEXT DEFAULT (datetime('now')),
    updated_at       TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id          TEXT PRIMARY KEY,
    order_id    TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id  TEXT NOT NULL REFERENCES products(id),
    quantity    INTEGER NOT NULL,
    unit_price  REAL NOT NULL,
    subtotal    REAL NOT NULL
  );

  -- MONETIZACIÓN
  CREATE TABLE IF NOT EXISTS subscription_plans (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    price           REAL DEFAULT 0,
    product_limit   INTEGER DEFAULT 10,
    commission_rate REAL DEFAULT 0.025,
    features        TEXT
  );

  CREATE TABLE IF NOT EXISTS distributor_subscriptions (
    id              TEXT PRIMARY KEY,
    distributor_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id         TEXT NOT NULL REFERENCES subscription_plans(id),
    status          TEXT DEFAULT 'active' CHECK(status IN ('active','cancelled','expired')),
    started_at      TEXT DEFAULT (datetime('now')),
    expires_at      TEXT
  );

  CREATE TABLE IF NOT EXISTS platform_commissions (
    id          TEXT PRIMARY KEY,
    order_id    TEXT NOT NULL REFERENCES orders(id),
    amount      REAL NOT NULL,
    rate        REAL NOT NULL,
    settled_at  TEXT
  );

  CREATE TABLE IF NOT EXISTS featured_spots (
    id             TEXT PRIMARY KEY,
    distributor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id     TEXT REFERENCES products(id),
    position       TEXT NOT NULL CHECK(position IN ('banner','top_search','category','push')),
    price          REAL NOT NULL,
    start_date     TEXT NOT NULL,
    end_date       TEXT NOT NULL,
    active         INTEGER DEFAULT 1
  );

  -- RESEÑAS
  CREATE TABLE IF NOT EXISTS reviews (
    id             TEXT PRIMARY KEY,
    order_id       TEXT NOT NULL REFERENCES orders(id),
    buyer_id       TEXT NOT NULL REFERENCES users(id),
    distributor_id TEXT NOT NULL REFERENCES users(id),
    rating         INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    comment        TEXT,
    created_at     TEXT DEFAULT (datetime('now'))
  );
`);

// ── Migraciones para tablas existentes ───────────────────────────────
// Agregar columnas nuevas a promotions si ya existía la tabla sin ellas
const existingCols = db.prepare("PRAGMA table_info(promotions)").all().map(c => c.name);
const newCols = [
  { name: 'title',           def: "TEXT NOT NULL DEFAULT 'Promoción'" },
  { name: 'description',     def: 'TEXT' },
  { name: 'code',            def: 'TEXT' },
  { name: 'discount_amount', def: 'REAL DEFAULT 0' },
  { name: 'max_qty',         def: 'INTEGER' }
];
for (const col of newCols) {
  if (!existingCols.includes(col.name)) {
    db.exec(`ALTER TABLE promotions ADD COLUMN ${col.name} ${col.def}`);
  }
}

module.exports = db;
