-- ============================================================
-- SIGBA - Gestion de multiples periodos academicos
-- ============================================================
--
-- Capa administrativa compatible con system_settings.
-- Los consumidores operativos siguen leyendo system_settings,
-- working_days y holidays.

CREATE TABLE IF NOT EXISTS academic_periods (
  id SERIAL PRIMARY KEY,
  periodo VARCHAR(20) NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Bogota'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Bogota'),
  created_by INTEGER NULL REFERENCES admins(id),
  updated_by INTEGER NULL REFERENCES admins(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_academic_period_periodo
  ON academic_periods (periodo);

CREATE UNIQUE INDEX IF NOT EXISTS unique_academic_period_active
  ON academic_periods (activo)
  WHERE activo = true;

CREATE TABLE IF NOT EXISTS academic_period_working_days (
  id SERIAL PRIMARY KEY,
  academic_period_id INTEGER NOT NULL REFERENCES academic_periods(id) ON DELETE CASCADE,
  dia VARCHAR(20) NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Bogota'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Bogota'),
  CONSTRAINT unique_academic_period_working_day UNIQUE (academic_period_id, dia)
);

CREATE TABLE IF NOT EXISTS academic_period_holidays (
  id SERIAL PRIMARY KEY,
  academic_period_id INTEGER NOT NULL REFERENCES academic_periods(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  descripcion VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Bogota'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Bogota'),
  CONSTRAINT unique_academic_period_holiday UNIQUE (academic_period_id, fecha)
);

INSERT INTO academic_periods (periodo, fecha_inicio, fecha_fin, activo)
SELECT
  ss.periodo_actual,
  COALESCE(ss.fecha_inicio, (NOW() AT TIME ZONE 'America/Bogota')::date),
  COALESCE(ss.fecha_fin, (NOW() AT TIME ZONE 'America/Bogota')::date),
  true
FROM system_settings ss
WHERE ss.id = 1
  AND NOT EXISTS (SELECT 1 FROM academic_periods);

INSERT INTO academic_period_working_days (academic_period_id, dia, activo)
SELECT ap.id, wd.dia, wd.activo
FROM academic_periods ap
CROSS JOIN working_days wd
WHERE ap.activo = true
  AND NOT EXISTS (
    SELECT 1
    FROM academic_period_working_days apwd
    WHERE apwd.academic_period_id = ap.id
      AND apwd.dia = wd.dia
  );

INSERT INTO academic_period_holidays (academic_period_id, fecha, descripcion)
SELECT ap.id, h.fecha, h.descripcion
FROM academic_periods ap
CROSS JOIN holidays h
WHERE ap.activo = true
  AND NOT EXISTS (
    SELECT 1
    FROM academic_period_holidays aph
    WHERE aph.academic_period_id = ap.id
      AND aph.fecha = h.fecha
  );
