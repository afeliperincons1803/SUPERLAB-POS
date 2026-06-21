-- Esquema de referencia PostgreSQL. La aplicación crea las mismas tablas mediante SQLAlchemy.
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(160) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  pin_hash VARCHAR(255),
  role VARCHAR(20) NOT NULL DEFAULT 'cashier',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  immutable BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS categories (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(80) UNIQUE NOT NULL,
  color VARCHAR(12) NOT NULL,
  icon VARCHAR(20) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  category_id BIGINT NOT NULL REFERENCES categories(id),
  name VARCHAR(120) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  price NUMERIC(12,0),
  sku VARCHAR(40) UNIQUE,
  available BOOLEAN NOT NULL DEFAULT TRUE,
  customizable BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS toppings (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  group_name VARCHAR(60) NOT NULL,
  price NUMERIC(12,0),
  available BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS cash_sessions (
  id BIGSERIAL PRIMARY KEY,
  opened_by_id BIGINT NOT NULL REFERENCES users(id),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opening_cash NUMERIC(12,0) NOT NULL DEFAULT 0,
  closed_at TIMESTAMPTZ,
  closing_cash NUMERIC(12,0),
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  notes TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  number VARCHAR(30) UNIQUE NOT NULL,
  cashier_id BIGINT NOT NULL REFERENCES users(id),
  cash_session_id BIGINT NOT NULL REFERENCES cash_sessions(id),
  status VARCHAR(20) NOT NULL,
  payment_method VARCHAR(30) NOT NULL,
  cash_amount NUMERIC(12,0) NOT NULL DEFAULT 0,
  qr_amount NUMERIC(12,0) NOT NULL DEFAULT 0,
  card_amount NUMERIC(12,0) NOT NULL DEFAULT 0,
  subtotal NUMERIC(12,0) NOT NULL,
  discount NUMERIC(12,0) NOT NULL DEFAULT 0,
  total NUMERIC(12,0) NOT NULL,
  received NUMERIC(12,0),
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id),
  product_name VARCHAR(120) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,0) NOT NULL,
  toppings TEXT NOT NULL DEFAULT '',
  subtotal NUMERIC(12,0) NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS ix_orders_cashier_id ON orders(cashier_id);
CREATE INDEX IF NOT EXISTS ix_products_category_id ON products(category_id);
