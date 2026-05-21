-- ============================================================
-- SIGBA — Esquema inicial completo
-- Generado desde la base de datos real en produccion
-- Ejecutar contra una base PostgreSQL vacia:
--   psql -U postgres -d sigba_db -f init.sql
-- ============================================================

-- 1. Tabla de estudiantes (entidad principal)
CREATE TABLE students (
  id                SERIAL PRIMARY KEY,
  codigo            VARCHAR(20) NOT NULL UNIQUE,
  tipo_documento    VARCHAR(10) NOT NULL,
  numero_documento  VARCHAR(20) NOT NULL,
  nombre            VARCHAR(100) NOT NULL,
  correo            VARCHAR(100) NOT NULL,
  programa_codigo   VARCHAR(10),
  programa_nombre   VARCHAR(100),
  tipo_estudiante   VARCHAR(20) NOT NULL,
  periodo_actual    VARCHAR(10),
  activo            BOOLEAN DEFAULT true,
  password_hash     TEXT,
  must_change_password BOOLEAN DEFAULT true,
  last_login        TIMESTAMP
);

-- 2. Subsidios
CREATE TABLE subsidies (
  id          SERIAL PRIMARY KEY,
  student_id  INTEGER REFERENCES students(id) ON DELETE CASCADE,
  tiene_beca  BOOLEAN DEFAULT false
);

-- 3. Dias de subsidio
CREATE TABLE subsidy_days (
  id          SERIAL PRIMARY KEY,
  subsidy_id  INTEGER REFERENCES subsidies(id) ON DELETE CASCADE,
  dia         VARCHAR(10) NOT NULL
);

-- 4. Configuracion de tipos de bono
CREATE TABLE config_bonos (
  id              SERIAL PRIMARY KEY,
  tipo            VARCHAR(20) NOT NULL UNIQUE,
  cantidad_base   INTEGER NOT NULL,
  activo          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Bonos diarios (pool diario por tipo)
CREATE TABLE bonos_diarios (
  id                    SERIAL PRIMARY KEY,
  config_bono_id        INTEGER NOT NULL REFERENCES config_bonos(id),
  fecha                 DATE NOT NULL,
  cantidad_base         INTEGER NOT NULL,
  cantidad_extra        INTEGER NOT NULL DEFAULT 0,
  cantidad_liberada     INTEGER NOT NULL DEFAULT 0,
  cantidad_no_utilizada INTEGER DEFAULT 0,
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX unique_bono_por_dia ON bonos_diarios (config_bono_id, fecha);
CREATE INDEX idx_bonos_diarios_fecha ON bonos_diarios (fecha);

-- 6. Redenciones (registro de cada bono solicitado/reclamado)
CREATE TABLE redenciones (
  id                    SERIAL PRIMARY KEY,
  student_id            INTEGER NOT NULL REFERENCES students(id),
  bono_diario_id        INTEGER NOT NULL REFERENCES bonos_diarios(id),
  estado                VARCHAR(20) NOT NULL,
  hora_solicitud        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  hora_reclamo          TIMESTAMP,
  expiracion_at         TIMESTAMP,
  codigo_bono           INTEGER,
  sincronizado_google   BOOLEAN DEFAULT false,
  fecha_sincronizacion  TIMESTAMP,
  tipo_asignacion       VARCHAR(30) NOT NULL DEFAULT 'OPERATIVA',
  admin_id              INTEGER,
  motivo_asignacion     TEXT,
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_redenciones_student ON redenciones (student_id);
CREATE INDEX idx_redenciones_estado ON redenciones (estado);

-- 7. Administradores
CREATE TABLE admins (
  id                    SERIAL PRIMARY KEY,
  nombre                VARCHAR(255) NOT NULL,
  correo                VARCHAR(255) UNIQUE NOT NULL,
  telefono              VARCHAR(20),
  password_hash         TEXT NOT NULL,
  must_change_password  BOOLEAN DEFAULT true,
  last_login            TIMESTAMP,
  activo                BOOLEAN DEFAULT true,
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW()
);

-- 8. Configuracion del sistema
CREATE TABLE system_settings (
  id              SERIAL PRIMARY KEY,
  periodo_actual  VARCHAR(10) NOT NULL,
  fecha_inicio    DATE,
  fecha_fin       DATE,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- 9. Dias habiles de operacion
CREATE TABLE working_days (
  id      SERIAL PRIMARY KEY,
  dia     VARCHAR(20) UNIQUE NOT NULL,
  activo  BOOLEAN DEFAULT true
);

-- 10. Festivos y dias no habiles
CREATE TABLE holidays (
  id          SERIAL PRIMARY KEY,
  fecha       DATE UNIQUE NOT NULL,
  descripcion VARCHAR(255)
);
