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

## Como aplicar sobre BD existente

Si la BD ya fue creada con una version anterior de `init.sql`, ejecutar unicamente las migraciones
pendientes en orden numerico:

```bash
psql -U sigba_user -d sigba_db -f database/migrations/002_provider_conciliations.sql
```

Usar `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` garantiza idempotencia.

## NO hacer

- NO modificar migraciones existentes
- NO reordenar archivos de migracion
- NO eliminar migraciones historicas
