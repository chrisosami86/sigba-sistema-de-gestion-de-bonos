-- ============================================================
-- SIGBA — Normalizacion de defaults de timestamps a America/Bogota
-- No destructiva. No cambia tipos, datos existentes ni contratos API.
-- ============================================================

ALTER TABLE config_bonos
  ALTER COLUMN created_at SET DEFAULT (NOW() AT TIME ZONE 'America/Bogota'),
  ALTER COLUMN updated_at SET DEFAULT (NOW() AT TIME ZONE 'America/Bogota');

ALTER TABLE bonos_diarios
  ALTER COLUMN created_at SET DEFAULT (NOW() AT TIME ZONE 'America/Bogota'),
  ALTER COLUMN updated_at SET DEFAULT (NOW() AT TIME ZONE 'America/Bogota');

ALTER TABLE redenciones
  ALTER COLUMN hora_solicitud SET DEFAULT (NOW() AT TIME ZONE 'America/Bogota'),
  ALTER COLUMN created_at SET DEFAULT (NOW() AT TIME ZONE 'America/Bogota'),
  ALTER COLUMN updated_at SET DEFAULT (NOW() AT TIME ZONE 'America/Bogota');

ALTER TABLE admins
  ALTER COLUMN created_at SET DEFAULT (NOW() AT TIME ZONE 'America/Bogota'),
  ALTER COLUMN updated_at SET DEFAULT (NOW() AT TIME ZONE 'America/Bogota');

ALTER TABLE system_settings
  ALTER COLUMN created_at SET DEFAULT (NOW() AT TIME ZONE 'America/Bogota'),
  ALTER COLUMN updated_at SET DEFAULT (NOW() AT TIME ZONE 'America/Bogota');

ALTER TABLE conciliaciones_proveedor
  ALTER COLUMN created_at SET DEFAULT (NOW() AT TIME ZONE 'America/Bogota'),
  ALTER COLUMN updated_at SET DEFAULT (NOW() AT TIME ZONE 'America/Bogota');

ALTER TABLE daily_closure_confirmations
  ALTER COLUMN created_at SET DEFAULT (NOW() AT TIME ZONE 'America/Bogota');
