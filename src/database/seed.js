require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

console.log('🌱 Sembrando base de datos MarketHub Pro...\n');

// ── Planes de suscripción ─────────────────────────────────────────
const plans = [
  { id: 'free',       name: 'Básico',     price: 0,   product_limit: 10,  commission_rate: 0.025, features: 'Catálogo básico,Pedidos,Soporte email' },
  { id: 'pro',        name: 'Pro',        price: 299, product_limit: 999, commission_rate: 0.025, features: 'Todo Básico,Ilimitados,Analytics avanzado,Destacados incluidos,Soporte prioritario' },
  { id: 'enterprise', name: 'Enterprise', price: 799, product_limit: 999, commission_rate: 0.015, features: 'Todo Pro,Comisión 1.5%,API acceso,Account manager dedicado,Facturación automática' },
];
const insertPlan = db.prepare(`INSERT OR REPLACE INTO subscription_plans (id, name, price, product_limit, commission_rate, features) VALUES (?,?,?,?,?,?)`);
plans.forEach(p => insertPlan.run(p.id, p.name, p.price, p.product_limit, p.commission_rate, p.features));
console.log('✅ Planes de suscripción creados');

// ── Categorías ────────────────────────────────────────────────────
const categories = [
  { id: 'bebidas',    name: 'Bebidas',      icon: '🥤' },
  { id: 'lacteos',    name: 'Lácteos',      icon: '🥛' },
  { id: 'abarrotes',  name: 'Abarrotes',    icon: '🛒' },
  { id: 'botanas',    name: 'Botanas',      icon: '🍿' },
  { id: 'limpieza',   name: 'Limpieza',     icon: '🧹' },
  { id: 'cuidado',    name: 'Cuidado Pers.', icon: '🧴' },
  { id: 'congelados', name: 'Congelados',   icon: '🧊' },
  { id: 'panaderia',  name: 'Panadería',    icon: '🍞' },
];
const insertCat = db.prepare(`INSERT OR REPLACE INTO categories (id, name, icon) VALUES (?,?,?)`);
categories.forEach(c => insertCat.run(c.id, c.name, c.icon));
console.log('✅ Categorías creadas');

// ── Helper para crear usuarios ────────────────────────────────────
const insertUser = db.prepare(`INSERT OR REPLACE INTO users (id, email, password, name, role, phone) VALUES (?,?,?,?,?,?)`);
const insertDist = db.prepare(`INSERT OR REPLACE INTO distributor_profiles (user_id, company_name, rfc, description, city, plan_id, verified, rating, total_reviews) VALUES (?,?,?,?,?,?,?,?,?)`);
const insertBuyer = db.prepare(`INSERT OR REPLACE INTO buyer_profiles (user_id, company_name, buyer_type, city) VALUES (?,?,?,?)`);

const HASH = bcrypt.hashSync('demo1234', 10);

// Admin
const adminId = 'admin-001';
insertUser.run(adminId, 'admin@markethub.mx', HASH, 'Administrador', 'admin', '5500000000');
console.log('✅ Admin creado  →  admin@markethub.mx / demo1234');

// ── Distribuidores ─────────────────────────────────────────────────
const distributors = [
  { id: 'dist-001', email: 'bebidas@distribuidora.mx', name: 'Carlos Mendoza', company: 'Distribuidora del Valle', rfc: 'DV2015010101', desc: 'Distribuidora líder de bebidas y refrescos en CDMX. 15 años de experiencia.', plan: 'pro',    rating: 4.8, reviews: 124 },
  { id: 'dist-002', email: 'lacteos@frescos.mx',        name: 'María López',    company: 'Lácteos Frescos SA',        rfc: 'LF2018050515', desc: 'Proveedor de lácteos frescos directamente de rancho. Calidad garantizada.', plan: 'enterprise', rating: 4.9, reviews: 98  },
  { id: 'dist-003', email: 'botanas@snackmex.mx',       name: 'Juan Hernández', company: 'SnackMex Distribuciones',   rfc: 'SM2020080808', desc: 'Las mejores botanas mexicanas e importadas para tu negocio.', plan: 'free',   rating: 4.6, reviews: 67  },
];
distributors.forEach(d => {
  insertUser.run(d.id, d.email, HASH, d.name, 'distributor', '5511112222');
  insertDist.run(d.id, d.company, d.rfc, d.desc, 'CDMX', d.plan, 1, d.rating, d.reviews);
});
console.log('✅ Distribuidores creados  →  (email arriba) / demo1234');

// ── Compradores ───────────────────────────────────────────────────
const buyers = [
  { id: 'buyer-001', email: 'tienda@laesquina.mx',    name: 'Tienda La Esquina',    type: 'minorista'  },
  { id: 'buyer-002', email: 'super@mercadolocal.mx',  name: 'Super Mercado Local',  type: 'mayorista'  },
  { id: 'buyer-003', email: 'abarrotes@donaluisa.mx', name: 'Abarrotes Doña Luisa', type: 'minorista'  },
];
buyers.forEach(b => {
  insertUser.run(b.id, b.email, HASH, b.name, 'buyer', '5533334444');
  insertBuyer.run(b.id, b.name, b.type, 'CDMX');
});
console.log('✅ Compradores creados     →  (email arriba) / demo1234');

// ── Suscripciones activas ─────────────────────────────────────────
const insertSub = db.prepare(`INSERT OR REPLACE INTO distributor_subscriptions (id, distributor_id, plan_id, status, expires_at) VALUES (?,?,?,?,?)`);
const nextYear = new Date(Date.now() + 365*24*60*60*1000).toISOString();
distributors.forEach(d => insertSub.run(uuidv4(), d.id, d.plan, 'active', nextYear));
console.log('✅ Suscripciones activas creadas');

// ── Productos ─────────────────────────────────────────────────────
const insertProduct = db.prepare(`
  INSERT OR REPLACE INTO products (id, distributor_id, category_id, name, sku, description, price, price_retail, unit, min_order, stock, featured, active, image_url)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
`);

const products = [
  // Dist-001: Bebidas
  { id:'prod-001', dist:'dist-001', cat:'bebidas', name:'Refresco Coca-Cola 600ml (caja 24)',  sku:'CC-600-24', desc:'Caja con 24 botellas de 600ml. Precio mayorista exclusivo.', price:180, retail:240, unit:'caja',   min:2,  stock:350, featured:1 },
  { id:'prod-002', dist:'dist-001', cat:'bebidas', name:'Agua Natural 1L (caja 12)',           sku:'AG-1L-12',  desc:'Agua purificada, caja de 12 litros.',                        price:65,  retail:96,  unit:'caja',   min:5,  stock:500, featured:0 },
  { id:'prod-003', dist:'dist-001', cat:'bebidas', name:'Jugo de Naranja 1L (caja 12)',        sku:'JN-1L-12',  desc:'100% naranja natural, sin conservadores.',                   price:145, retail:204, unit:'caja',   min:2,  stock:180, featured:1 },
  { id:'prod-004', dist:'dist-001', cat:'bebidas', name:'Cerveza Clara 355ml (caja 24)',       sku:'CV-355-24', desc:'Caja de 24 latas. Solo para establecimientos con licencia.', price:320, retail:420, unit:'caja',   min:2,  stock:220, featured:0 },
  // Dist-002: Lácteos
  { id:'prod-005', dist:'dist-002', cat:'lacteos', name:'Leche Entera 1L (caja 12)',           sku:'LE-1L-12',  desc:'Leche fresca de rancho pasteurizada, caja 12 litros.',       price:155, retail:216, unit:'caja',   min:3,  stock:400, featured:1 },
  { id:'prod-006', dist:'dist-002', cat:'lacteos', name:'Queso Panela 500g',                   sku:'QP-500',    desc:'Queso panela artesanal, fresco del día.',                    price:38,  retail:55,  unit:'pieza',  min:10, stock:200, featured:0 },
  { id:'prod-007', dist:'dist-002', cat:'lacteos', name:'Yogurt Natural 1kg',                  sku:'YN-1KG',    desc:'Yogurt natural sin azúcar, ideal para tiendas naturistas.',  price:42,  retail:62,  unit:'pieza',  min:6,  stock:150, featured:1 },
  { id:'prod-008', dist:'dist-002', cat:'lacteos', name:'Crema Ácida 1L',                      sku:'CA-1L',     desc:'Crema ácida de alta calidad, envase de 1 litro.',             price:55,  retail:78,  unit:'pieza',  min:6,  stock:180, featured:0 },
  // Dist-003: Botanas
  { id:'prod-009', dist:'dist-003', cat:'botanas', name:'Papas Fritas 45g (caja 40)',          sku:'PF-45-40',  desc:'Caja 40 bolsas de papas surtidas. Venta mínima 1 caja.',    price:280, retail:400, unit:'caja',   min:1,  stock:120, featured:1 },
  { id:'prod-010', dist:'dist-003', cat:'botanas', name:'Cacahuates Japoneses 500g',            sku:'CJ-500',    desc:'Cacahuates japoneses, presentación granel 500g.',            price:45,  retail:68,  unit:'bolsa',  min:12, stock:300, featured:0 },
  { id:'prod-011', dist:'dist-003', cat:'abarrotes',name:'Arroz Morelos 5kg',                  sku:'AR-5KG',    desc:'Arroz de grano largo, cosecha Morelos. Bolsa 5kg.',           price:85,  retail:120, unit:'bolsa',  min:6,  stock:450, featured:0 },
  { id:'prod-012', dist:'dist-003', cat:'abarrotes',name:'Frijol Negro 1kg',                   sku:'FN-1KG',    desc:'Frijol negro michoacano limpio, cosecha actual.',             price:28,  retail:42,  unit:'bolsa',  min:12, stock:600, featured:1 },
];

products.forEach(p => {
  insertProduct.run(p.id, p.dist, p.cat, p.name, p.sku, p.desc, p.price, p.retail, p.unit, p.min, p.stock, p.featured?1:0, 1, null);
});
console.log(`✅ ${products.length} productos creados`);

// ── Promociones ───────────────────────────────────────────────────
const insertPromo = db.prepare(`INSERT OR REPLACE INTO promotions (id, distributor_id, product_id, type, discount_pct, min_qty, expires_at) VALUES (?,?,?,?,?,?,?)`);
const future = new Date(Date.now() + 30*24*60*60*1000).toISOString();
insertPromo.run(uuidv4(), 'dist-001', 'prod-001', 'porcentaje', 15, 5, future);
insertPromo.run(uuidv4(), 'dist-001', 'prod-003', 'porcentaje', 10, 2, future);
insertPromo.run(uuidv4(), 'dist-002', 'prod-005', 'porcentaje', 12, 3, future);
insertPromo.run(uuidv4(), 'dist-003', 'prod-009', 'porcentaje', 20, 2, future);
console.log('✅ Promociones creadas');

// ── Pedidos de muestra ────────────────────────────────────────────
const insertOrder = db.prepare(`INSERT OR REPLACE INTO orders (id, buyer_id, distributor_id, status, total, commission_rate, commission_amount, delivery_address, payment_method) VALUES (?,?,?,?,?,?,?,?,?)`);
const insertItem  = db.prepare(`INSERT OR REPLACE INTO order_items (id, order_id, product_id, quantity, unit_price, subtotal) VALUES (?,?,?,?,?,?)`);
const insertComm  = db.prepare(`INSERT OR REPLACE INTO platform_commissions (id, order_id, amount, rate) VALUES (?,?,?,?)`);

const sampleOrders = [
  { id:'ord-001', buyer:'buyer-001', dist:'dist-001', status:'entregado',  total:540,  items:[{prod:'prod-001',qty:3,price:180}] },
  { id:'ord-002', buyer:'buyer-002', dist:'dist-002', status:'en_camino',  total:465,  items:[{prod:'prod-005',qty:3,price:155}] },
  { id:'ord-003', buyer:'buyer-001', dist:'dist-003', status:'confirmado', total:280,  items:[{prod:'prod-009',qty:1,price:280}] },
  { id:'ord-004', buyer:'buyer-003', dist:'dist-001', status:'pendiente',  total:325,  items:[{prod:'prod-002',qty:5,price:65}] },
  { id:'ord-005', buyer:'buyer-002', dist:'dist-002', status:'entregado',  total:612,  items:[{prod:'prod-005',qty:4,price:153}] },
];

sampleOrders.forEach(o => {
  const comm = parseFloat((o.total * 0.025).toFixed(2));
  insertOrder.run(o.id, o.buyer, o.dist, o.status, o.total, 0.025, comm, 'Calle Reforma 100, CDMX', 'transferencia');
  o.items.forEach(i => {
    insertItem.run(uuidv4(), o.id, i.prod, i.qty, i.price, i.qty * i.price);
  });
  insertComm.run(uuidv4(), o.id, comm, 0.025);
});
console.log(`✅ ${sampleOrders.length} pedidos de muestra creados`);

// ── Reseñas ───────────────────────────────────────────────────────
const insertReview = db.prepare(`INSERT OR REPLACE INTO reviews (id, order_id, buyer_id, distributor_id, rating, comment) VALUES (?,?,?,?,?,?)`);
insertReview.run(uuidv4(), 'ord-001', 'buyer-001', 'dist-001', 5, 'Excelente servicio, entrega rápida y productos frescos.');
insertReview.run(uuidv4(), 'ord-005', 'buyer-002', 'dist-002', 5, 'Los lácteos llegaron en perfectas condiciones. Muy recomendados.');
console.log('✅ Reseñas creadas');

console.log('\n🎉 Base de datos lista!\n');
console.log('═══════════════════════════════════════════════════');
console.log('  USUARIOS DE PRUEBA (contraseña: demo1234)');
console.log('═══════════════════════════════════════════════════');
console.log('  ADMIN       →  admin@markethub.mx');
console.log('  DIST 1      →  bebidas@distribuidora.mx');
console.log('  DIST 2      →  lacteos@frescos.mx');
console.log('  DIST 3      →  botanas@snackmex.mx');
console.log('  COMPRADOR 1 →  tienda@laesquina.mx');
console.log('  COMPRADOR 2 →  super@mercadolocal.mx');
console.log('  COMPRADOR 3 →  abarrotes@donaluisa.mx');
console.log('═══════════════════════════════════════════════════\n');
