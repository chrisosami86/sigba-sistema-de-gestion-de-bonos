# SIGBA — Estado Actual del Proyecto

> **Fecha:** 2026-06-01
> **Estado general:** OPERATIVO — Producción activa en Universidad del Valle (Yumbo)

---

## 1. Funcionalidades Estables

| Funcionalidad | Estado | Verificación |
|--------------|--------|-------------|
| Core bonos (requestBono, claimBono) | ESTABLE | 25/25 smoke tests |
| Scheduler (60s, advisory locks) | ESTABLE | Sin memory leaks |
| Expiraciones automáticas (expireBonos) | ESTABLE | Idempotente, transaccional |
| QR (generación, escaneo, reclamo) | ESTABLE | 78/78 smoke tests |
| Provider (conciliaciones, resumen, export) | ESTABLE | 67/67 smoke tests |
| Analytics V2 (5 dominios desacoplados) | ESTABLE | Solo lectura, sin dependencia del core |
| Modalidad Operativa (columna + helper) | ESTABLE | 3 fases completadas |
| Asignaciones administrativas | ESTABLE | 46/46 smoke tests |
| Normalización de zona horaria | ESTABLE | Node.js + PostgreSQL consistente |
| Dashboard Institucional V2 | ESTABLE | 6 secciones, Charts.js |
| Auth (JWT student + admin) | ESTABLE | Guards, interceptor, recuperación |
| Google Sheets sync | ESTABLE | Sincronización post-reclamo |
| Docker + PostgreSQL 15 | ESTABLE | 4 servicios, reproducible |

## 2. Funcionalidades Parcialmente Estabilizadas

| Funcionalidad | Estado | Pendiente |
|--------------|--------|----------|
| Cierre operacional diario | FUNCIONAL | Orden de operaciones corregido (Fase 1 timezone). Pendiente: scheduler de pre-cierre automático |
| Confirmación de cierre diario | FUNCIONAL | Endpoint existe, tabla `daily_closure_confirmations` poblada. Pendiente: integración completa con UI de confirmación |
| Analytics legacy | FUNCIONAL | Coexiste con V2. Pendiente: retiro en Fase 6 |
| Dashboard legacy (`/admin`) | FUNCIONAL | Coexiste con V2. Pendiente: retiro progresivo |
| Liberación manual (liberarBonos) | DEPRECADO | Reemplazado por asignación administrativa. Se mantiene por compatibilidad |

## 3. Deuda Técnica Priorizada

### P0 — Crítico
- ~~Separar credenciales/token por contexto en frontend~~ → Verificar estado actual
- ~~Corregir orden de rutas students (`/:id` antes de `/code/:codigo`)~~ → Verificar estado actual
- ~~Confirmar dependencia `chart.js` en package.json~~ → Verificar estado actual

### P1 — Alto
- Dividir `admin-dashboard-page.ts` (1765 LOC) en containers/componentes
- Dividir `bonos.service.js` (1076 LOC) en subservicios internos (congelado por riesgo de regresión)

### P2 — Medio
- Extraer importación Excel de `students.service.js`
- Separar analytics SQL/reporting del servicio
- Mover sincronización Google Sheets fuera del controller

### P3 — Bajo
- Ordenar módulos vacíos `admin` y `records`
- Mejorar convenciones de error/status
- Crear pruebas críticas de concurrencia y cierre operativo

## 4. Backlog Priorizado

1. **Corrección flujo cierre diario**: Pre-cierre automático vía scheduler + notificación
2. **Restricciones días no hábiles**: Bloquear reservas en festivos y fines de semana
3. **Bloqueos post-cierre**: Impedir operaciones después del cierre del período
4. **Deuda proveedor acumulada**: Dashboard de diferencias acumuladas multi-día
5. **Fase 4 modalidad**: Migrar dashboards a `modalidad_operacional` como fuente primaria
6. **Fase 5 modalidad**: Eliminar inferencia por horario, retirar `getModalidadExpression` legacy
7. **Fase 6**: Eliminar reutilización, liberaciones, analytics híbridos, métricas obsoletas
8. **Internacionalización del frontend**: Preparar para multi-idioma (opcional)
9. **Notificaciones**: Email/SMS para estudiantes con inasistencia crítica

## 5. Arquitectura Actual

```
SIGBA (Monolito Modular)
├── Frontend: Angular 21 + Signals + Tailwind v4 + daisyUI v5 + Chart.js 4.5
├── Backend:  Node.js + Express 5 (CommonJS)
├── Database: PostgreSQL 15
└── Infra:    Docker Compose (db, mailpit, backend, frontend)
```

### Módulos Backend
| Módulo | Estado | LOC aprox |
|--------|--------|----------|
| `bonos/` | Core congelado | 1076 + 406 |
| `analytics-v2/` | Nuevo, desacoplado | 8 archivos |
| `analytics/` | Legacy | 405 |
| `admin/` | Capa institucional | 227 |
| `provider/` | Conciliaciones | 315 + 103 |
| `system/` | Config + scheduler + cierres | ~400 |
| `auth/` | Autenticación | ~300 |
| `students/` | CRUD + import | 624 |
| `qr/` | QR service | 114 |

### Helpers Compartidos
| Helper | Propósito |
|--------|----------|
| `timezone.helper.js` | Fechas Bogotá (getBogotaDate, formatBogotaDate) |
| `sql-timezone.helper.js` | SQL explícito `AT TIME ZONE 'America/Bogota'` |
| `modalidad.helper.js` | Clasificación: `modalidad_operacional` → legacy fallback |
| `logger.helper.js` | Logger con flag `BONOS_DEBUG` |
| `workingDay.helper.js` | Días hábiles + festivos (usa timezone helper) |
| `operational-calendar.helper.js` | Calendario operacional (usa timezone helper) |

### Rutas Frontend
| Ruta | Componente | Guard |
|------|-----------|-------|
| `/` | LoginStudentsPage | — |
| `/details` | DetailsStudentsPage | studentAuthGuard |
| `/admin/login` | AdminLoginPage | — |
| `/admin` | AdminDashboardPage (legacy) | adminAuthGuard |
| `/admin/scan` | AdminScanPage | adminAuthGuard |
| `/admin/institutional` | InstitutionalDashboardPage (V2) | adminAuthGuard |

## 6. Migraciones de Base de Datos

| # | Archivo | Descripción | Estado |
|---|---------|------------|--------|
| 001 | `001_initial_migrations.sql` | Students/auth/constraints | Incorporado en init.sql |
| 002 | `002_provider_conciliations.sql` | Conciliaciones proveedor | Incorporado en init.sql |
| 003 | `003_daily_closure_confirmations.sql` | Cierres diarios | Incorporado en init.sql |
| 004 | (implícita) | Timezone: `NOW() AT TIME ZONE 'America/Bogota'` defaults | En init.sql |
| 005 | `005_add_modalidad_operacional.sql` | Columna `modalidad_operacional` + backfill | Aplicar en producción |

## 7. Fases Completadas Recientemente

| Fase | Descripción | Fecha |
|------|------------|-------|
| Timezone F1 | Helper `timezone.helper.js`, reemplazo `toISOString().slice(0,10)` | 2026-05-27 |
| Timezone F2 | Helper `sql-timezone.helper.js`, migración `CURRENT_DATE`/`NOW()` | 2026-05-27 |
| Modalidad F1 | Columna `modalidad_operacional`, migración 005, backfill | 2026-05-29 |
| Modalidad F2 | `getModalidadExpression()` usa `modalidad_operacional` → fallback legacy | 2026-05-30 |
| Modalidad F3 | Exposición en frontend (Resumen Diario + Asignaciones + PDF) | 2026-05-31 |
| Bug Fix | Operational Snapshot usa `fechaInicio` en vez de siempre `today` | 2026-06-01 |
