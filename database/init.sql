-- ============================================================
-- SIGBA — Esquema inicial completo (Fase 1-4B)
-- Incluye: tablas base, constraints, indices, conciliaciones proveedor,
--          confirmaciones de cierre diario.
-- Ejecutar contra una base PostgreSQL vacia:
--   psql -U postgres -d sigba_db -f init.sql
--
-- ZONA HORARIA: Todo SIGBA opera bajo America/Bogota.
-- - Backend:  process.env.TZ = 'America/Bogota' (server.js)
-- - Database: timezone=America/Bogota (db.js connection options)
-- - Frontend: el navegador convierte automaticamente a hora local.
--
-- NOTA PARA FUTURAS TABLAS:
--   Toda nueva columna con fecha operacional debe usar:
--     TIMESTAMP WITH TIME ZONE (o TIMESTAMPTZ)
--   en lugar de TIMESTAMP sin zona horaria.
--   NO migrar tablas existentes en produccion — mantienen
--   compatibilidad con el modelo actual que interpreta todo
--   como America/Bogota via configuracion de conexion.
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
  created_at      TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'America/Bogota'),
  updated_at      TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'America/Bogota')
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
  created_at            TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'America/Bogota'),
  updated_at            TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'America/Bogota'),
  CONSTRAINT unique_config_bono_fecha UNIQUE (config_bono_id, fecha)
);

CREATE INDEX idx_bonos_diarios_fecha ON bonos_diarios (fecha);

-- 6. Redenciones (registro de cada bono solicitado/reclamado)
CREATE TABLE redenciones (
  id                    SERIAL PRIMARY KEY,
  student_id            INTEGER NOT NULL REFERENCES students(id),
  bono_diario_id        INTEGER NOT NULL REFERENCES bonos_diarios(id),
  estado                VARCHAR(20) NOT NULL,
  hora_solicitud        TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Bogota'),
  hora_reclamo          TIMESTAMP,
  expiracion_at         TIMESTAMP,
  codigo_bono           INTEGER,
  sincronizado_google   BOOLEAN DEFAULT false,
  fecha_sincronizacion  TIMESTAMP,
  tipo_asignacion       VARCHAR(30) NOT NULL DEFAULT 'OPERATIVA',
  admin_id              INTEGER,
  motivo_asignacion     TEXT,
  modalidad_operacional VARCHAR(30),
  created_at            TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'America/Bogota'),
  updated_at            TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'America/Bogota')
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
  created_at            TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'America/Bogota'),
  updated_at            TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'America/Bogota')
);

-- 8. Configuracion del sistema
CREATE TABLE system_settings (
  id              SERIAL PRIMARY KEY,
  periodo_actual  VARCHAR(10) NOT NULL,
  fecha_inicio    DATE,
  fecha_fin       DATE,
  created_at      TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'America/Bogota'),
  updated_at      TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'America/Bogota')
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

-- 10B. Periodos academicos administrables
CREATE TABLE academic_periods (
  id            SERIAL PRIMARY KEY,
  periodo       VARCHAR(20) NOT NULL,
  fecha_inicio  DATE NOT NULL,
  fecha_fin     DATE NOT NULL,
  activo        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Bogota'),
  updated_at    TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Bogota'),
  created_by    INTEGER NULL REFERENCES admins(id),
  updated_by    INTEGER NULL REFERENCES admins(id)
);

CREATE UNIQUE INDEX unique_academic_period_periodo
  ON academic_periods (periodo);

CREATE UNIQUE INDEX unique_academic_period_active
  ON academic_periods (activo)
  WHERE activo = true;

CREATE TABLE academic_period_working_days (
  id                  SERIAL PRIMARY KEY,
  academic_period_id  INTEGER NOT NULL REFERENCES academic_periods(id) ON DELETE CASCADE,
  dia                 VARCHAR(20) NOT NULL,
  activo              BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Bogota'),
  updated_at          TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Bogota'),
  CONSTRAINT unique_academic_period_working_day UNIQUE (academic_period_id, dia)
);

CREATE TABLE academic_period_holidays (
  id                  SERIAL PRIMARY KEY,
  academic_period_id  INTEGER NOT NULL REFERENCES academic_periods(id) ON DELETE CASCADE,
  fecha               DATE NOT NULL,
  descripcion         VARCHAR(255),
  created_at          TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Bogota'),
  updated_at          TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Bogota'),
  CONSTRAINT unique_academic_period_holiday UNIQUE (academic_period_id, fecha)
);

-- 11. Conciliaciones proveedor (Fase 2)
CREATE TABLE conciliaciones_proveedor (
  id                  SERIAL PRIMARY KEY,
  fecha               DATE NOT NULL,
  tipo                VARCHAR(20) NOT NULL CHECK (tipo IN ('almuerzo', 'refrigerio')),
  cantidad_sigba      INTEGER NOT NULL,
  cantidad_proveedor  INTEGER NOT NULL,
  diferencia          INTEGER NOT NULL,
  estado              VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE'
                      CHECK (estado IN ('CONCILIADO', 'DIFERENCIA_MENOR', 'DIFERENCIA_CRITICA', 'PENDIENTE')),
  observaciones       TEXT,
  admin_id            INTEGER REFERENCES admins(id),
  created_at          TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Bogota'),
  updated_at          TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Bogota')
);

CREATE INDEX idx_conciliaciones_fecha
  ON conciliaciones_proveedor (fecha);

CREATE INDEX idx_conciliaciones_tipo
  ON conciliaciones_proveedor (tipo);

CREATE UNIQUE INDEX unique_conciliacion_dia_tipo
  ON conciliaciones_proveedor (fecha, tipo);

-- 12. Confirmaciones de cierre diario (Fase 4B)
CREATE TABLE daily_closure_confirmations (
  id                SERIAL PRIMARY KEY,
  fecha_operacion   DATE NOT NULL,
  confirmado_por    INTEGER REFERENCES admins(id),
  confirmado_at     TIMESTAMP,
  estado            VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE_CONFIRMACION'
                    CHECK (estado IN ('PENDIENTE_CONFIRMACION', 'CONFIRMADO')),
  observaciones     TEXT,
  created_at        TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Bogota')
);

CREATE UNIQUE INDEX unique_closure_confirmation_fecha
  ON daily_closure_confirmations (fecha_operacion);

CREATE INDEX idx_closure_confirmation_estado
  ON daily_closure_confirmations (estado);
