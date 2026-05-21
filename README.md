# SIGBA — Sistema de Informacion para la Gestion de Bonos Alimentarios

Universidad del Valle — Bienestar Universitario

---

## Arquitectura

| Componente | Tecnologia | Puerto |
|---|---|---|
| Frontend | Angular 21 + Tailwind CSS v4 + daisyUI | 4200 |
| Backend | Node.js + Express 5 | 3000 |
| Base de datos | PostgreSQL 15 | 5432 |
| SMTP testing | Mailpit | 1025 / 8025 |

```
usuario (navegador) → frontend (:4200) → backend (:3000) → PostgreSQL (:5432)
                                                          → Google Sheets API
```

---

## Requisitos

- Docker + Docker Compose
- Node.js >= 22
- pnpm >= 9 (opcional, tambien funciona con npm)

---

## Instalacion paso a paso

### 1. Clonar el proyecto

```bash
git clone <repo-url> sigba
cd sigba
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Editar `.env` con los valores reales. Como minimo configurar `JWT_SECRET` y `GOOGLE_APPLICATION_CREDENTIALS_JSON`.

### 3. Levantar servicios con Docker

```bash
docker compose up db -d
```

```bash
docker compose up mailpit -d
```

Esto levanta:
- PostgreSQL (la BD se crea automaticamente con `database/init.sql`)
- Mailpit (interfaz web en http://localhost:8025)
- Backend API (http://localhost:3000)
- Frontend (http://localhost:4200)

### 4. Acceder al sistema

- Frontend: http://localhost:4200
- Admin por defecto: `desarrollohumano.yumbo@correounivalle.edu.co`
- Password inicial: `3175635984` (cambiar al primer ingreso)

---

## Desarrollo sin Docker

### Backend

```bash
cd backend
cp .env.template .env   # ya deberia existir .env
pnpm install
node server.js
```

### Frontend

```bash
cd frontend
pnpm install
pnpm start
```

Si sale un error de core-js
```bash
pnpm approve-builds
```
Se marca con tecla ``space`` y se acepta.


Si no se instala chart.js pnpm install
```bash
pnpm install chart.js
```

El frontend usa un proxy (`proxy.conf.json`) que redirige `/api` al backend en `localhost:3000`.

---

## Base de datos

### Crear la BD desde cero

```bash
# Opcion A: Con Docker (automatico al hacer docker compose up)

# Opcion B: Manual
psql -U postgres -c "CREATE DATABASE sigba_db;"
psql -U postgres -d sigba_db -f database/init.sql
psql -U postgres -d sigba_db -f database/seed.sql
```

### Estructura de archivos SQL

```
database/
├── init.sql              # Esquema completo (CREATE TABLE + indices + constraints)
├── seed.sql              # Datos minimos iniciales (periodo, bonos, dias habiles)
└── migrations/           # Migraciones historicas y futuras
    └── 001_initial_migrations.sql
```

### Crear nuevas migraciones

1. Crear archivo en `database/migrations/` con nomenclatura `NNN_descripcion.sql`
2. Ejecutar contra la base de datos:

```bash
psql -U postgres -d sigba_db -f database/migrations/NNN_descripcion.sql
```

---

## Variables de entorno

| Variable | Descripcion | Default (Docker) |
|---|---|---|
| `DB_USER` | Usuario PostgreSQL | `sigba_user` |
| `DB_PASSWORD` | Password PostgreSQL | `sigba_pass` |
| `DB_NAME` | Nombre base de datos | `sigba_db` |
| `DB_HOST` | Host PostgreSQL | `db` (Docker) / `localhost` |
| `DB_PORT` | Puerto PostgreSQL | `5432` |
| `JWT_SECRET` | Secreto para tokens JWT | (obligatorio) |
| `SMTP_HOST` | Servidor SMTP | `smtp.gmail.com` |
| `SMTP_PORT` | Puerto SMTP | `587` |
| `SMTP_USER` | Usuario SMTP | |
| `SMTP_PASSWORD` | Password SMTP | |
| `SMTP_FROM` | Remitente correos | |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | Credenciales Google service account (una sola linea) | |
| `SHEET_ID` | ID de la hoja de Google Sheets destino | |

---

## Comandos utiles

```bash
# Ver logs del backend
docker compose logs -f backend

# Reiniciar un servicio
docker compose restart backend

# Reconstruir imagenes
docker compose build --no-cache

# Entrar a la BD
docker compose exec db psql -U sigba_user -d sigba_db

# Ejecutar migracion manual
docker compose exec -T db psql -U sigba_user -d sigba_db < database/migrations/XXX.sql

# Reset completo (borra datos)
docker compose down -v
docker compose up -d
```
