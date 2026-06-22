-- ============================================================
-- SIGBA — Datos iniciales minimos (seed)
-- Ejecutar despues de init.sql:
--   psql -U postgres -d sigba_db -f seed.sql
-- ============================================================

-- Configuracion del periodo academico por defecto
INSERT INTO system_settings (id, periodo_actual)
VALUES (1, '2026-1')
ON CONFLICT (id) DO NOTHING;

-- Dias habiles de operacion
INSERT INTO working_days (dia, activo) VALUES
  ('lunes', true),
  ('martes', true),
  ('miercoles', true),
  ('jueves', true),
  ('viernes', true),
  ('sabado', false),
  ('domingo', false)
ON CONFLICT (dia) DO NOTHING;

-- Periodo academico inicial administrable
INSERT INTO academic_periods (periodo, fecha_inicio, fecha_fin, activo)
SELECT
  ss.periodo_actual,
  COALESCE(ss.fecha_inicio, (NOW() AT TIME ZONE 'America/Bogota')::date),
  COALESCE(ss.fecha_fin, (NOW() AT TIME ZONE 'America/Bogota')::date),
  true
FROM system_settings ss
WHERE ss.id = 1
ON CONFLICT (periodo) DO NOTHING;

INSERT INTO academic_period_working_days (academic_period_id, dia, activo)
SELECT ap.id, wd.dia, wd.activo
FROM academic_periods ap
CROSS JOIN working_days wd
WHERE ap.activo = true
ON CONFLICT (academic_period_id, dia) DO NOTHING;

-- Configuracion base de bonos (almuerzo y refrigerio)
INSERT INTO config_bonos (tipo, cantidad_base, activo) VALUES
  ('almuerzo', 110, true),
  ('refrigerio', 30, true)
ON CONFLICT (tipo) DO NOTHING;

-- NOTA: El administrador inicial se crea automaticamente al iniciar
-- el backend por primera vez (ver auth.service.js). No es necesario
-- insertarlo manualmente aqui porque el password se hashea en runtime.
