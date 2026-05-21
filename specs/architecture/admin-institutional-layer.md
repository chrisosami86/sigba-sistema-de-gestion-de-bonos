# SIGBA — Capa Institucional de Asignaciones Administrativas

> **Fecha:** 2026-05-21  
> **Versión:** v1.0 — Fase 1 completada  
> **Estado:** OPERATIVA — Sin regresiones en el core  

---

## Resumen

Se implementó la capa institucional completa para asignaciones administrativas, manteniendo el núcleo operacional de bonos congelado según `specs/architecture/bonos-stable-core.md`. La funcionalidad permite asignar bonos administrativamente, consultar historial, auditar quién asignó y por qué, con separación absoluta entre operación y administrativos.

---

## 1. Arquitectura

```
┌──────────────────────────────────────────────────────────┐
│                     CORE CONGELADO                        │
│  bonos.service.js                                         │
│  ├── calculateDisponibilidad  ← NO TOCADO                │
│  ├── expireBonos               ← NO TOCADO                │
│  ├── requestBono               ← NO TOCADO                │
│  ├── claimBono                 ← NO TOCADO                │
│  ├── calcularNoUtilizada       ← NO TOCADO                │
│  └── cerrarOperacionDiariaInterna ← NO TOCADO            │
├──────────────────────────────────────────────────────────┤
│  bonos.admin-assignment.service.js ← YA EXISTENTE         │
│  ├── asignarAdministrativamente  ← Reutilizado            │
│  ├── getBaseAdministrativa       ← Reutilizado            │
│  └── calculateBaseAdministrativa ← Reutilizado            │
├──────────────────────────────────────────────────────────┤
│                  CAPA INSTITUCIONAL (NUEVA)               │
│  admin.service.js                                         │
│  ├── asignarBono()         ← Wrapper institucional       │
│  ├── getAsignaciones()     ← Historial filtrable         │
│  └── getAsignacionById()   ← Detalle de asignación       │
│                                                           │
│  admin.controller.js                                      │
│  ├── asignarBono           ← POST /api/admin/bonos/asignar│
│  ├── getBaseAdministrativa ← GET  /api/admin/bonos/base  │
│  ├── getAsignaciones       ← GET  /api/admin/bonos/asignaciones│
│  └── getAsignacionById     ← GET  /api/admin/bonos/asignaciones/:id│
│                                                           │
│  admin.routes.js           ← Todas con authenticateAdmin  │
└──────────────────────────────────────────────────────────┘
```

**Principio rector:** La capa institucional consume servicios del core operacional sin modificarlos. Todas las operaciones administrativas pasan por el servicio `bonos.admin-assignment.service.js` que YA existía y YA era seguro.

---

## 2. Flujo Transaccional

### 2.1 Asignar bono administrativo

```
POST /api/admin/bonos/asignar
Auth: authenticateAdmin → req.admin = { id, nombre, correo, role }

1. admin.controller.asignarBono(req, res)
2. └→ adminService.asignarBono({
       tipo, studentId, codigoBono, motivo,
       adminId: req.admin.id,
       adminNombre: req.admin.nombre
     })
3.   ├── validateTipo, validateStudentId, validateCodigoBono
4.   ├── validateMotivo (obligatorio)
5.   ├── isWorkingDay
6.   └→ adminAssignmentService.asignarAdministrativamente({
         tipo, studentId, codigoBono, motivo, adminId
       })
7.       ├── BEGIN TRANSACTION
8.       ├── FOR UPDATE bonos_diarios (lock)
9.       ├── FOR UPDATE students (validación)
10.      ├── studentAlreadyConsumedToday
11.      ├── calculateBaseAdministrativa
12.      │     base = expirados + noUtilizados - administrativos
13.      ├── IF disponible <= 0 → ERROR
14.      ├── INSERT redenciones (estado='reclamado', tipo_asignacion='ADMINISTRATIVA')
15.      └── COMMIT
16.  └→ info("[admin.asignarBono]", { adminId, adminNombre, tipo, studentId, ... })
```

### 2.2 Consultar historial administrativo

```
GET /api/admin/bonos/asignaciones?tipo=almuerzo&fechaDesde=2026-05-01&fechaHasta=2026-05-21&page=1&limit=20

1. admin.controller.getAsignaciones(req, res)
2. └→ adminService.getAsignaciones(req.query)
3.   ├── Construir WHERE dinámico:
4.   │     WHERE r.tipo_asignacion = 'ADMINISTRATIVA'
5.   │     AND bd.fecha >= $1        (si fechaDesde)
6.   │     AND bd.fecha <= $2        (si fechaHasta)
7.   │     AND cb.tipo = $3          (si tipo)
8.   │     AND r.student_id = $4     (si studentId)
9.   │     AND r.admin_id = $5       (si adminId)
10.  │     AND r.codigo_bono = $6    (si codigoBono)
11.  ├── SELECT COUNT(*) para paginación
12.  └── SELECT con JOINs:
13.        redenciones r
14.        JOIN bonos_diarios bd     → fecha, tipo
15.        JOIN config_bonos cb      → tipo validado
16.        JOIN students s           → datos estudiante
17.        LEFT JOIN admins a        → nombre admin (auditoría)
```

**Filtros soportados:** fechaDesde, fechaHasta, tipo (almuerzo/refrigerio), studentId, adminId, codigoBono.

**Paginación:** page + limit (default: page=1, limit=20, max=100).

### 2.3 Detalle de una asignación

```
GET /api/admin/bonos/asignaciones/:id

1. admin.controller.getAsignacionById(req, res)
2. └→ adminService.getAsignacionById(id)
3.   └── SELECT completo con:
         r.*, s.*, cb.tipo, bd.fecha, bd.cantidad_base, bd.cantidad_extra,
         a.nombre, a.correo
         WHERE r.id = $1 AND r.tipo_asignacion = 'ADMINISTRATIVA'
4.   └── Si no existe → 404
```

---

## 3. Endpoints

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| `POST` | `/api/admin/bonos/asignar` | `authenticateAdmin` | Registrar asignación administrativa |
| `GET` | `/api/admin/bonos/base` | `authenticateAdmin` | Base administrativa por tipo |
| `GET` | `/api/admin/bonos/asignaciones` | `authenticateAdmin` | Historial filtrable paginado |
| `GET` | `/api/admin/bonos/asignaciones/:id` | `authenticateAdmin` | Detalle de una asignación |

**Nota:** El endpoint `POST /api/bonos/admin/asignaciones` existente en `bonos.routes.js` sigue funcional y coexiste. Ambos llaman al mismo `adminAssignmentService.asignarAdministrativamente()`.

---

## 4. Auditoría Administrativa

Cada asignación registra automáticamente:

| Campo | Fuente | Descripción |
|-------|--------|-------------|
| `r.admin_id` | `req.admin.id` (JWT) | ID del admin que realizó la asignación |
| `r.motivo_asignacion` | `req.body.motivo` | Motivo obligatorio de la asignación |
| `r.tipo_asignacion` | Constante `'ADMINISTRATIVA'` | Discriminador de tipo |
| `r.codigo_bono` | `req.body.codigoBono` | Código del bono físico |
| `r.hora_reclamo` | `NOW()` (PostgreSQL) | Timestamp de la asignación |
| `r.estado` | `'reclamado'` (terminal) | Estado final |

**Log de auditoría:** La función `asignarBono()` en `admin.service.js` emite un log `info()` con `adminId`, `adminNombre`, `tipo`, `studentId`, `codigoBono`, `redencionId`, `baseRestante`. Usa `logger.helper.js`.

---

## 5. Invariantes Nuevas (Capa Institucional)

| # | Invariante | Garantía |
|---|-----------|----------|
| IA1 | Toda asignación administrativa requiere autenticación admin | `authenticateAdmin` middleware en todas las rutas |
| IA2 | Toda asignación requiere motivo obligatorio | Validación en `admin.service.js:asignarBono()` |
| IA3 | Las asignaciones NO afectan `calculateDisponibilidad` | El COUNT en `calcularNoUtilizada` excluye `tipo_asignacion = 'ADMINISTRATIVA'` |
| IA4 | Las asignaciones NO recalcular `noUtilizada` | `cerrarOperacionDiariaInterna` excluye administrativas |
| IA5 | El historial administrativo está separado del analytics operacional | Queries independientes con `WHERE tipo_asignacion = 'ADMINISTRATIVA'` |
| IA6 | Los administrativos consumen expirados + no utilizados | `base = expirados + noUtilizados - administrativos` |
| IA7 | El core operacional NO fue modificado | Verificado estáticamente en smoke tests |

---

## 6. Riesgos y Mitigaciones

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| `FOR UPDATE` sobre `bonos_diarios` bloquea lecturas concurrentes | Medio | El lock es breve (~10ms). `expireBonos` tiene advisory lock separado. |
| `studentAlreadyConsumedToday` podría bloquear asignación si el estudiante ya reclamó en venta libre | Bajo | Es intencional — un estudiante solo puede consumir un bono al día |
| La tabla `admins` podría no existir | Bajo | Uso `LEFT JOIN` en queries. Si no existe, muestra 'Sistema'. |
| Historial sin datos si no hay migración de columnas | Medio | `assertAssignmentSchemaReady` verifica columnas `tipo_asignacion`, `admin_id`, `motivo_asignacion` antes de insertar |

---

## 7. Decisiones Técnicas

1. **Separación de rutas:** Las nuevas rutas se montan en `/api/admin/bonos` para mantener separación institucional del core en `/api/bonos`.

2. **Reutilización de `adminAssignmentService`:** No se duplicó lógica transaccional. La capa institucional es un wrapper que añade validaciones (motivo obligatorio) y auditoría (logs), delegando al servicio existente.

3. **Wrapper `asignarBono()` en `admin.service.js`:** Añade `adminNombre` al log de auditoría y valida motivo obligatorio antes de delegar al servicio core.

4. **`LEFT JOIN admins` para historial:** Si la tabla `admins` no existe o el admin fue eliminado, muestra 'Sistema' en vez de fallar.

5. **Mismo formulario frontend reutilizado:** El formulario de asignación ya existía en el módulo "Bonos del día". Se duplicó en el nuevo módulo "Asignaciones admin" para mantener consistencia UX, añadiendo historial y filtros.

6. **Paginación con límite:** Máximo 100 registros por página para evitar consultas pesadas.

---

## 8. Archivos Creados/Modificados

### Backend

| Archivo | Cambio |
|---------|--------|
| `backend/src/modules/admin/admin.service.js` | **Nuevo** — Servicio institucional: `asignarBono`, `getAsignaciones`, `getAsignacionById` |
| `backend/src/modules/admin/admin.controller.js` | **Reemplazado** (era stub vacío) — Controller con 4 endpoints |
| `backend/src/modules/admin/admin.routes.js` | **Reemplazado** (era stub vacío) — Rutas protegidas en `/api/admin/bonos` |
| `backend/src/app.js` | **Modificado** — Añadido `adminRoutes` import y mount |

### Frontend

| Archivo | Cambio |
|---------|--------|
| `frontend/src/app/admin/services/admin-assignment.service.ts` | **Nuevo** — Servicio HTTP para endpoints institucionales |
| `frontend/src/app/admin/pages/admin-dashboard-page/admin-dashboard-page.ts` | **Modificado** — Añadido módulo 'asignaciones', signals, métodos |
| `frontend/src/app/admin/pages/admin-dashboard-page/admin-dashboard-page.html` | **Modificado** — Añadido nav button + bloque HTML del módulo |

### Scripts

| Archivo | Cambio |
|---------|--------|
| `scripts/diagnostics/validar-admin-layer.js` | **Nuevo** — 21 smoke tests para capa institucional |

---

## 9. Core Operacional — Sin Cambios

Los siguientes archivos NO fueron modificados en esta fase:

- `backend/src/modules/bonos/bonos.service.js`
- `backend/src/modules/bonos/bonos.admin-assignment.service.js`
- `backend/src/modules/bonos/bonos.controller.js`
- `backend/src/modules/bonos/bonos.routes.js`
- `backend/src/modules/system/scheduler.js`
- `backend/src/shared/helpers/logger.helper.js`
- `specs/architecture/bonos-stable-core.md`

---

## 10. Smoke Tests Ejecutados

### Core operacional (25/25 ✅)

- Exports: 15 funciones exportadas correctamente
- Lectura: getDisponibilidad ×2, getEstadoSistema ×2, getStudentBonos, getResumenDiario, getStatsDiarias, getBaseAdministrativa
- Escritura: expireBonos standalone
- Post-expire: disponibles=0, noUtilizada=108 (sin cambios)

### Capa institucional (21/21 ✅)

- Exports: 5 funciones (adminService + adminAssignmentService)
- Base administrativa: ambos tipos retornan datos
- Historial: default, filtro tipo, filtro fecha, filtro código inexistente
- Detalle: 404 en ID inexistente
- Validaciones: motivo obligatorio (síncrono)
- Core sin cambios: getDisponibilidad ×2, expireBonos, calculateDisponibilidad, calcularNoUtilizada
- Integridad: pool funcional, lecturas concurrentes sin deadlocks
- Separación: admin service/controller no importan calculateDisponibilidad

**Total: 46/46 ✅ — CERO REGRESIONES**

---

## 11. Próximos Pasos (Fuera del Alcance de Fase 1)

1. Añadir campo `admin_nombre` a la tabla `redenciones` para redundancia de auditoría
2. Exportar historial administrativo a Excel/PDF desde el dashboard
3. Filtro por admin en el historial (dropdown de admins disponibles)
4. Modal de detalle de asignación (click en fila de la tabla)
5. Integrar con Google Sheets para trazabilidad externa

---

> **Estado final de Fase 1: COMPLETADA.**  
> Core operacional: congelado, sin regresiones.  
> Capa institucional: operativa, auditada, documentada.  
> Smoke tests: 46/46 ✅
