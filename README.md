# MarketHub Pro 🛒

Marketplace B2B para distribuidores de abarrotes y alimentos en México.  
Conecta distribuidores con minoristas y mayoristas, con control de inventario y monetización integrada.

---

## 🚀 Inicio rápido

```bash
# 1. Instalar dependencias + sembrar base de datos
npm run setup

# 2. Correr el servidor
npm start
```

Abre **http://localhost:3000** en tu navegador.

Para desarrollo con recarga automática:
```bash
npm run dev
```

---

## 📁 Estructura del proyecto

```
markethub-pro/
├── server.js                  # Entrada principal Express
├── package.json
├── .env.example               # Variables de entorno (copiar a .env)
├── index.html                 # App web (React SPA, abre directo en browser)
├── app-movil.html             # Prototipo visual app móvil
├── ARQUITECTURA.md            # Roadmap y stack técnico
├── data/                      # SQLite generado automáticamente
│   └── markethub.db
└── src/
    ├── database/
    │   ├── db.js              # Conexión SQLite + creación de tablas
    │   └── seed.js            # Datos de prueba
    ├── middleware/
    │   └── auth.js            # JWT: authenticate + authorize
    └── routes/
        ├── auth.js            # POST /register /login  GET /me  PUT /profile
        ├── products.js        # CRUD productos + catálogo público
        ├── orders.js          # Pedidos: crear, listar, actualizar estado
        ├── inventory.js       # Control de stock (distribuidor)
        ├── analytics.js       # KPIs distribuidor / ahorros comprador / plataforma
        └── admin.js           # Usuarios, comisiones, suscripciones, destacados
```

---

## 🔑 Variables de entorno

Copia `.env.example` a `.env` y ajusta los valores:

```bash
cp .env.example .env
```

Mínimo necesario para desarrollo:
```
PORT=3000
JWT_SECRET=cambia-esto-en-produccion
```

---

## 👤 Usuarios de prueba

| Rol | Email | Contraseña |
|---|---|---|
| Admin | admin@markethub.mx | demo1234 |
| Distribuidor (Pro) | bebidas@distribuidora.mx | demo1234 |
| Distribuidor (Enterprise) | lacteos@frescos.mx | demo1234 |
| Distribuidor (Free) | botanas@snackmex.mx | demo1234 |
| Comprador minorista | tienda@laesquina.mx | demo1234 |
| Comprador mayorista | super@mercadolocal.mx | demo1234 |
| Comprador minorista | abarrotes@donaluisa.mx | demo1234 |

---

## 📡 API REST

### Autenticación
| Método | Endpoint | Descripción |
|---|---|---|
| POST | `/api/auth/register` | Registrar usuario |
| POST | `/api/auth/login` | Iniciar sesión → devuelve JWT |
| GET | `/api/auth/me` | Perfil del usuario autenticado |
| PUT | `/api/auth/profile` | Actualizar perfil |

### Productos
| Método | Endpoint | Auth | Descripción |
|---|---|---|---|
| GET | `/api/products` | — | Catálogo público (filtros: category, search, featured) |
| GET | `/api/products/categories` | — | Lista de categorías |
| GET | `/api/products/:id` | — | Detalle + promociones |
| GET | `/api/products/distributor/mine` | distributor | Mis productos |
| POST | `/api/products` | distributor | Crear producto |
| PUT | `/api/products/:id` | distributor/admin | Editar producto |
| DELETE | `/api/products/:id` | distributor/admin | Desactivar producto |

### Pedidos
| Método | Endpoint | Auth | Descripción |
|---|---|---|---|
| GET | `/api/orders` | any | Mis pedidos (filtrado por rol) |
| GET | `/api/orders/:id` | any | Detalle de pedido |
| POST | `/api/orders` | buyer | Crear pedido (descuenta stock + registra comisión) |
| PUT | `/api/orders/:id/status` | dist/buyer | Actualizar estado |

### Inventario
| Método | Endpoint | Auth | Descripción |
|---|---|---|---|
| GET | `/api/inventory` | distributor/admin | Inventario + stats |
| PUT | `/api/inventory/:productId` | distributor/admin | Ajustar stock (set/add/subtract) |
| PUT | `/api/inventory/bulk/update` | distributor/admin | Ajuste masivo |

### Analytics
| Método | Endpoint | Auth | Descripción |
|---|---|---|---|
| GET | `/api/analytics/distributor` | distributor | KPIs, ventas, top productos |
| GET | `/api/analytics/buyer` | buyer | Ahorros acumulados |
| GET | `/api/analytics/platform` | admin | GMV, comisiones, top distribuidores |

### Admin
| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/api/admin/dashboard` | Resumen ejecutivo |
| GET/PUT/DELETE | `/api/admin/users` | Gestión de usuarios |
| GET/PUT | `/api/admin/commissions` | Comisiones de la plataforma |
| GET/PUT | `/api/admin/subscriptions` | Suscripciones de distribuidores |
| GET/POST/DELETE | `/api/admin/featured` | Espacios destacados |

---

## 💰 Monetización

1. **Comisión por venta** — 2.5% automático en cada pedido (1.5% plan Enterprise)
2. **Suscripción mensual** — Free (10 productos) / Pro $299 / Enterprise $799
3. **Freemium** — upgrade natural al superar límite de productos
4. **Espacios destacados** — Banner $350, Top búsqueda $250, Categoría $150, Push $100

---

## 🛠️ Comandos

```bash
npm start         # Servidor en producción
npm run dev       # Servidor con recarga automática (nodemon)
npm run seed      # Re-sembrar la base de datos
npm run setup     # Instalar + sembrar (primer uso)
```

---

## 🗺️ Próximos pasos

- [ ] Integración con Stripe Connect (splits automáticos)
- [ ] Notificaciones por email (Resend)
- [ ] Upload de imágenes (Cloudinary)
- [ ] App móvil React Native + Expo
- [ ] Deploy en Vercel + Railway

---

*MarketHub Pro · Hecho con ❤️ en México*
