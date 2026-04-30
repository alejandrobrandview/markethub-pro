# MarketHub Pro — Arquitectura Técnica & Roadmap

## 🎯 Visión del Producto

Marketplace B2B para el sector abarrotes/alimentos en México, donde distribuidores ofrecen sus productos a minoristas y mayoristas con precios especiales. La plataforma cobra por facilitar estas conexiones de valor.

---

## 🏗️ Stack Tecnológico Recomendado

### Web App (Producción)
| Capa | Tecnología | Justificación |
|---|---|---|
| Frontend | **Next.js 14** (App Router) | SSR/SSG para SEO, excelente DX |
| UI | **Tailwind CSS + shadcn/ui** | Rapidez, consistencia, accesibilidad |
| Estado global | **Zustand** | Ligero, perfecto para carrito e inventario |
| Autenticación | **NextAuth.js + JWT** | Multi-rol desde el día 1 |
| Backend/API | **Next.js API Routes + tRPC** | Tipado end-to-end, menos errores |
| Base de datos | **PostgreSQL (Supabase)** | Relacional, Row Level Security para multi-tenant |
| ORM | **Prisma** | Migraciones seguras, autocompletado |
| Storage | **Supabase Storage / Cloudinary** | Imágenes de productos |
| Pagos | **Stripe Connect** | Splits automáticos + comisiones a la plataforma |
| Email | **Resend + React Email** | Notificaciones transaccionales |
| Analytics | **PostHog (self-hosted)** | Privacy-first, eventos personalizados |
| Deploy | **Vercel (web) + Railway (DB)** | CI/CD automático |

### App Móvil
| Capa | Tecnología |
|---|---|
| Framework | **React Native + Expo** |
| Navegación | **Expo Router** |
| API | Mismo backend que la web (tRPC) |
| Notificaciones push | **Expo Push Notifications** |
| Pagos móvil | **Stripe SDK para React Native** |
| Deploy | App Store + Google Play Store |

---

## 🗄️ Modelo de Base de Datos

```sql
-- USUARIOS
users (id, email, name, role: ENUM[distributor, buyer, admin], created_at)
distributor_profiles (user_id, company_name, rfc, logo_url, plan_id, verified)
buyer_profiles (user_id, company_name, buyer_type: ENUM[minorista, mayorista])

-- CATÁLOGO
products (id, distributor_id, name, sku, category, price, price_retail, 
          stock, min_order, unit, description, featured, active)
categories (id, name, icon, parent_id)
product_images (id, product_id, url, is_primary)

-- PEDIDOS
orders (id, buyer_id, distributor_id, status, total, commission_amount, 
        payment_method, delivery_address, notes, created_at)
order_items (id, order_id, product_id, quantity, unit_price, subtotal)

-- MONETIZACIÓN
subscription_plans (id, name, price, product_limit, commission_rate, features)
distributor_subscriptions (id, distributor_id, plan_id, status, expires_at)
platform_commissions (id, order_id, amount, rate, settled_at)
featured_spots (id, distributor_id, product_id, position, price, start_date, end_date)

-- SOCIAL
reviews (id, order_id, buyer_id, distributor_id, rating, comment)
promotions (id, distributor_id, type, discount_pct, min_qty, expires_at)
```

---

## 💰 Modelo de Monetización (4 fuentes)

### 1. Comisión por Venta — *Revenue variable*
- **2.5%** sobre el monto total de cada transacción
- Se cobra automáticamente vía Stripe Connect antes de liquidar al distribuidor
- Proyección: con $5M en GMV/año → **$125,000 de comisiones**

### 2. Suscripción Mensual — *Revenue recurrente*
| Plan | Precio | Límite productos | Comisión |
|---|---|---|---|
| Básico | Gratis | 10 productos | 2.5% |
| Pro | $299/mes | Ilimitados | 2.5% |
| Enterprise | $799/mes | Ilimitados + API | 1.5% |

### 3. Plan Freemium → Conversión
- Free: funciones básicas, 10 productos, analytics limitado
- Upgrade natural cuando el distribuidor supera el límite o necesita analytics

### 4. Destacados & Publicidad — *Revenue de alta margen*
| Posición | Precio/mes | Impresiones estimadas |
|---|---|---|
| Banner principal | $350 | ~5,000 |
| Top búsqueda #1 | $250 | ~3,500 |
| Categoría destacada | $150 | ~2,000 |
| Notificación push | $100 | ~1,200 |

---

## 🗺️ Módulos del Producto

### Portal Distribuidor
- [x] Dashboard con KPIs (ventas, pedidos, rating)
- [x] Gestión de catálogo (CRUD de productos)
- [x] Control de inventario en tiempo real
- [x] Gestión de pedidos (confirmar, despachar, entregar)
- [x] Creación de promociones (paquetes, volumen, flash)
- [x] Analytics avanzado (ventas, compradores, productos top)
- [x] Gestión de plan/suscripción

### Portal Comprador (Minorista/Mayorista)
- [x] Catálogo con búsqueda y filtros
- [x] Detalle de producto con ahorro tangible
- [x] Carrito de compras
- [x] Checkout y pedido
- [x] Historial de pedidos
- [x] Dashboard de ahorros acumulados

### Panel Administrador
- [x] Overview de KPIs de plataforma
- [x] Registro de comisiones por transacción
- [x] Gestión de suscripciones
- [x] Gestión de usuarios (distribuidores y compradores)
- [x] Venta y administración de espacios destacados

---

## 📱 Roadmap de App Móvil (React Native + Expo)

### Fase 1 — MVP Web (semanas 1-6)
- [ ] Autenticación y onboarding
- [ ] Catálogo y búsqueda
- [ ] Carrito y checkout
- [ ] Notificaciones por email

### Fase 2 — Estabilización (semanas 7-10)
- [ ] Integración Stripe Connect
- [ ] Panel analytics distribuidor
- [ ] Sistema de reseñas
- [ ] Notificaciones in-app

### Fase 3 — App Móvil (semanas 11-18)
- [ ] Setup Expo + React Native
- [ ] Pantallas de catálogo y producto
- [ ] Carrito y checkout móvil
- [ ] Push notifications (pedidos, stock bajo)
- [ ] Publicar en App Store + Google Play

### Fase 4 — Crecimiento (mes 5+)
- [ ] API pública para integraciones ERP
- [ ] Sistema de crédito comercial
- [ ] Logística integrada (Lalamove, DHL API)
- [ ] App de scanner de inventario
- [ ] Inteligencia de precios con ML

---

## 🚀 Comandos de inicio (desarrollo)

```bash
# Clonar y configurar
npx create-next-app@latest markethub-pro --typescript --tailwind --app
cd markethub-pro

# Instalar dependencias clave
npm install @prisma/client prisma zustand @tanstack/react-query
npm install next-auth stripe @stripe/stripe-js
npm install recharts lucide-react class-variance-authority

# Base de datos
npx prisma init
npx prisma db push
npx prisma studio  # UI visual de la BD

# Desarrollo
npm run dev  # http://localhost:3000
```

---

## 📊 Proyecciones Financieras (Año 1)

| Métrica | Mes 3 | Mes 6 | Mes 12 |
|---|---|---|---|
| Distribuidores | 50 | 200 | 800 |
| Compradores | 500 | 3,000 | 15,000 |
| GMV mensual | $250K | $1.2M | $5M |
| Comisiones (2.5%) | $6,250 | $30,000 | $125,000 |
| Suscripciones | $8,500 | $42,000 | $180,000 |
| Destacados | $2,000 | $12,000 | $48,000 |
| **Revenue total** | **$16,750** | **$84,000** | **$353,000** |

---

*Generado por MarketHub Pro · Abril 2024*
