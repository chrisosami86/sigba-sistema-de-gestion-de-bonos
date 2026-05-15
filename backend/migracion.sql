-- Migración: periodo académico y trazabilidad
-- Ejecutar una sola vez contra la base de datos

ALTER TABLE students
ADD COLUMN IF NOT EXISTS periodo_actual VARCHAR(10),
ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT true;

-- Corregir estudiantes existentes con activo NULL
UPDATE students SET activo = true WHERE activo IS NULL;

-- Migración: seguridad (passwords + JWT)

ALTER TABLE students
ADD COLUMN IF NOT EXISTS password_hash TEXT,
ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;

-- Migración: tabla de administradores

CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  correo VARCHAR(255) UNIQUE NOT NULL,
  telefono VARCHAR(20),
  password_hash TEXT NOT NULL,
  must_change_password BOOLEAN DEFAULT true,
  last_login TIMESTAMP,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

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

-- Migración: trazabilidad de cupos no utilizados

ALTER TABLE bonos_diarios
ADD COLUMN IF NOT EXISTS cantidad_no_utilizada INTEGER DEFAULT 0;
