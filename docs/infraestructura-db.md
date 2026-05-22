# Infraestructura DB — SIGBA

## Estructura de archivos

```
database/
├── init.sql                          # Snapshot oficial del esquema actual
├── seed.sql                          # Configuracion minima inicial
└── migrations/
    ├── README.md                     # Documentacion de migraciones
    ├── 001_initial_migrations.sql    # Legacy — ya incorporado en init.sql
    └── 002_provider_conciliations.sql # Legacy — ya incorporado en init.sql
```

## Orden de carga

Al ejecutar `docker compose up` por primera vez:

1. PostgreSQL inicia
2. `01_init.sql` se ejecuta → crea todas las tablas, constraints e indices
3. `02_seed.sql` se ejecuta → inserta configuracion minima

Este orden esta definido en `docker-compose.yml`:

```yaml
volumes:
  - ./database/init.sql:/docker-entrypoint-initdb.d/01_init.sql:ro
  - ./database/seed.sql:/docker-entrypoint-initdb.d/02_seed.sql:ro
```

## init.sql — snapshot oficial

Contiene la estructura COMPLETA actual del sistema (11 tablas):

| # | Tabla | Proposito |
|---|-------|-----------|
| 1 | `students` | Estudiantes con autenticacion |
| 2 | `subsidies` | Relacion estudiante-beca |
| 3 | `subsidy_days` | Dias de subsidio por estudiante |
| 4 | `config_bonos` | Tipos de bono (almuerzo, refrigerio) |
| 5 | `bonos_diarios` | Pool diario por tipo de bono |
| 6 | `redenciones` | Cada bono solicitado/reclamado |
| 7 | `admins` | Administradores del sistema |
| 8 | `system_settings` | Configuracion de periodo academico |
| 9 | `working_days` | Dias habiles de operacion |
| 10 | `holidays` | Festivos y dias no habiles |
| 11 | `conciliaciones_proveedor` | Conciliaciones con proveedor externo |

Todas las columnas, constraints, indices y foreign keys estan definidas inline.
init.sql es autocontenido: no requiere ejecutar migraciones adicionales.

## seed.sql — configuracion minima

Inserta unicamente datos de configuracion:

- Periodo academico: `2026-1`
- Dias habiles: lunes a viernes activos, sabado/domingo inactivos
- Tipos de bono: almuerzo (150), refrigerio (150)

**NO inserta:** estudiantes, redenciones, conciliaciones, historicos, datos operacionales.

El administrador inicial se crea automaticamente al iniciar el backend por primera vez
(auth.service.js hashea el password en runtime).

## Docker Compose

Servicios definidos en `docker-compose.yml`:

| Servicio | Puerto | Imagen/Contexto |
|----------|--------|-----------------|
| `db` | 5432 | `postgres:15` |
| `mailpit` | 1025, 8025 | `axllent/mailpit` |
| `backend` | 3000 | `./backend/Dockerfile` |
| `frontend` | 4200 | `./frontend/Dockerfile.dev` |

Variables de entorno requeridas (definidas en `.env`):

```
DB_USER=sigba_user
DB_PASSWORD=sigba_pass
DB_NAME=sigba_db
DB_PORT=5432
JWT_SECRET=sigba_jwt_secret_change_in_production
GOOGLE_APPLICATION_CREDENTIALS_JSON=...  (opcional, Sheets)
SHEET_ID=...                              (opcional, Sheets)
```

## Como levantar desde cero

```bash
# 1. Clonar y configurar .env
cp .env.example .env
# Editar .env con credenciales deseadas

# 2. Levantar todo
docker compose down -v    # limpiar volumenes anteriores
docker compose up --build # construir y levantar

# 3. Verificar
# - Backend:  http://localhost:3000
# - Frontend: http://localhost:4200
# - Mailpit:  http://localhost:8025
```

## Como recrear BD sin Docker

```bash
# 1. Conectarse a PostgreSQL
psql -U postgres

# 2. Crear BD y usuario
CREATE USER sigba_user WITH PASSWORD 'sigba_pass';
CREATE DATABASE sigba_db OWNER sigba_user;
\q

# 3. Cargar esquema y seed
psql -U sigba_user -d sigba_db -f database/init.sql
psql -U sigba_user -d sigba_db -f database/seed.sql
```

## Migraciones sobre BD existente

Si la BD ya fue creada con una version anterior de `init.sql`,
aplicar unicamente las migraciones faltantes en orden:

```bash
psql -U sigba_user -d sigba_db -f database/migrations/002_provider_conciliations.sql
```

Usar `IF NOT EXISTS` garantiza idempotencia.

## NO modificar manualmente

- Estructura de tablas directamente en la BD
- init.sql sin coordinar con migraciones
- Orden de migraciones
- Constraints manualmente sin registrar el cambio
