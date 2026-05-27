# Migraciones — SIGBA

## Orden de carga

1. `database/init.sql` — snapshot oficial del esquema actual (tablas, constraints, indices)
2. `database/seed.sql` — datos de configuracion minima (periodo, tipos bono, dias habiles)
3. Migraciones — cambios incrementales historicos ya incorporados en init.sql

## Migraciones legacy (ya incorporadas en init.sql)

### 001_initial_migrations.sql

Cambios historicos que YA estan reflejados en `init.sql`:

- Columnas `periodo_actual`, `activo`, `password_hash`, `must_change_password`, `last_login` en `students`
- Columnas `codigo_bono`, `sincronizado_google`, `fecha_sincronizacion`, `tipo_asignacion`, `admin_id`, `motivo_asignacion` en `redenciones`
- Columna `cantidad_no_utilizada` en `bonos_diarios`
- Tablas: `admins`, `system_settings`, `working_days`, `holidays`
- Constraints: `unique_bono_por_dia` (INDEX en init.sql)
- Datos seed: periodo 2026-1, dias habiles

**NO es necesario ejecutar esta migracion sobre una instalacion limpia.**
`init.sql` contiene toda su estructura.

### 002_provider_conciliations.sql

- Tabla `conciliaciones_proveedor` con sus indices

**YA INCORPORADA en init.sql.** No es necesario ejecutarla en instalaciones nuevas.

### 003_daily_closure_confirmations.sql

- Tabla `daily_closure_confirmations` con sus indices y CHECK de estado

**YA INCORPORADA en init.sql.** No es necesario ejecutarla en instalaciones nuevas.

### 004_normalize_bogota_timestamp_defaults.sql

- Ajusta defaults de columnas `TIMESTAMP` existentes para usar `NOW() AT TIME ZONE 'America/Bogota'`
- No modifica datos existentes, tipos de columnas ni contratos API
- Refuerza que `hora_solicitud`, `created_at` y `updated_at` no dependan de timezone de sesion

## Como aplicar sobre BD existente

Si la BD ya fue creada con una version anterior de `init.sql`, ejecutar unicamente las migraciones
pendientes en orden numerico:

```bash
psql -U sigba_user -d sigba_db -f database/migrations/002_provider_conciliations.sql
psql -U sigba_user -d sigba_db -f database/migrations/003_daily_closure_confirmations.sql
psql -U sigba_user -d sigba_db -f database/migrations/004_normalize_bogota_timestamp_defaults.sql
```

Usar `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` garantiza idempotencia.

## NO hacer

- NO modificar migraciones existentes
- NO reordenar archivos de migracion
- NO eliminar migraciones historicas
