-- Migración: periodo académico y trazabilidad
-- Ejecutar una sola vez contra la base de datos

ALTER TABLE students
ADD COLUMN IF NOT EXISTS periodo_actual VARCHAR(10),
ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT true;

CREATE TABLE IF NOT EXISTS system_settings (
  id SERIAL PRIMARY KEY,
  periodo_actual VARCHAR(10) NOT NULL,
  fecha_inicio DATE,
  fecha_fin DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insertar fila por defecto si no existe
INSERT INTO system_settings (id, periodo_actual)
VALUES (1, '2026-1')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS working_days (
  id SERIAL PRIMARY KEY,
  dia VARCHAR(20) UNIQUE NOT NULL,
  activo BOOLEAN DEFAULT true
);

-- Insertar días de la semana por defecto
INSERT INTO working_days (dia, activo) VALUES
  ('lunes', true),
  ('martes', true),
  ('miercoles', true),
  ('jueves', true),
  ('viernes', true),
  ('sabado', false),
  ('domingo', false)
ON CONFLICT (dia) DO NOTHING;

CREATE TABLE IF NOT EXISTS holidays (
  id SERIAL PRIMARY KEY,
  fecha DATE UNIQUE NOT NULL,
  descripcion VARCHAR(255)
);
