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

-- Configuracion base de bonos (almuerzo y refrigerio)
INSERT INTO config_bonos (tipo, cantidad_base, activo) VALUES
  ('almuerzo', 150, true),
  ('refrigerio', 150, true)
ON CONFLICT (tipo) DO NOTHING;

-- NOTA: El administrador inicial se crea automaticamente al iniciar
-- el backend por primera vez (ver auth.service.js). No es necesario
-- insertarlo manualmente aqui porque el password se hashea en runtime.
