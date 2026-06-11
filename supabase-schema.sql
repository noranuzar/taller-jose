-- =============================================
-- TALLER DE JOSÉ — Schema para Supabase
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query
-- =============================================

-- Tabla de pedidos
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  ticket_num INTEGER NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  service_id TEXT,
  service_name TEXT NOT NULL,
  service_icon TEXT DEFAULT '🧵',
  price NUMERIC(8,2) DEFAULT 0,
  signal NUMERIC(8,2) DEFAULT 0,
  signal_paid BOOLEAN DEFAULT FALSE,
  mins INTEGER DEFAULT 30,
  notes TEXT DEFAULT '',
  delivery_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'registrado',
  source TEXT DEFAULT 'tienda',
  assigned_to TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de configuración (una sola fila)
CREATE TABLE config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contador de tickets
CREATE TABLE counters (
  id TEXT PRIMARY KEY DEFAULT 'ticket',
  value INTEGER DEFAULT 0
);

-- Insertar contador inicial
INSERT INTO counters (id, value) VALUES ('ticket', 0);

-- Índices para búsqueda rápida
CREATE INDEX idx_orders_phone ON orders (phone);
CREATE INDEX idx_orders_status ON orders (status);
CREATE INDEX idx_orders_delivery ON orders (delivery_date);
CREATE INDEX idx_orders_ticket ON orders (ticket_num);

-- Habilitar acceso público (Row Level Security desactivado para simplificar)
-- Para un taller de barrio esto es suficiente. Si crece, activar RLS.
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE config ENABLE ROW LEVEL SECURITY;
ALTER TABLE counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on orders" ON orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on config" ON config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on counters" ON counters FOR ALL USING (true) WITH CHECK (true);
