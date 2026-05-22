# SIGBA — Capa de Operación Proveedor (Conciliación y Trazabilidad Externa)

> **Fecha:** 2026-05-21  
> **Versión:** v1.0 — Fase 2 completada  
> **Estado:** OPERATIVA — Subsistema independiente, sin regresiones en el core  

---

## Resumen

Capa independiente para conciliación diaria con proveedor externo. Permite registrar cantidades reportadas por el proveedor, calcular diferencias automáticamente contra los datos consolidados de SIGBA, mantener historial de conciliaciones con trazabilidad, y exportar reportes en Excel. No modifica el core operacional ni institucional.

---

## 1. Arquitectura

```
┌──────────────────────────────────────────────────────────────┐
│                    CAPAS PREVIAS (CONGELADAS)                │
│                                                              │
│  ┌─────────────────────┐  ┌───────────────────────────────┐ │
│  │ CORE OPERACIONAL     │  │ CAPA INSTITUCIONAL            │ │
│  │ (bonos.service.js)   │  │ (admin.service.js)            │ │
│  │ calculateDisp        │  │ asignarBono                   │ │
│  │ expireBonos          │  │ getAsignaciones               │ │
│  │ calcularNoUtilizada  │  │                               │ │
│  └─────────────────────┘  └───────────────────────────────┘ │
│                                                              │
│  Ambos módulos NO TOCADOS.                                   │
├──────────────────────────────────────────────────────────────┤
│                    CAPA PROVEEDOR (NUEVA)                    │
│                                                              │
│  provider.service.js                                         │
│  ├── getResumenProveedor()  ← Lee bonos_diarios + redenciones│
│  ├── registrarConciliacion()← UPSERT en conciliaciones_     │
│  │                             proveedor                    │
│  ├── getConciliaciones()    ← Historial filtrable paginado  │
│  └── getConciliacionById()  ← Detalle                       │
│                                                              │
│  provider-export.service.js                                  │
│  ├── exportarResumenProveedor() ← XLSX multi-concepto       │
│  └── exportarConciliaciones()   ← XLSX historial            │
│                                                              │
│  provider.controller.js + provider.routes.js                 │
│  Montado en /api/admin/provider                              │
│  Todas las rutas con authenticateAdmin                       │
└──────────────────────────────────────────────────────────────┘

NUEVA TABLA: conciliaciones_proveedor
  - Independiente de redenciones
  - UPSERT por (fecha, tipo)
  - Columnas: fecha, tipo, cantidad_sigba, cantidad_proveedor,
              diferencia, estado, observaciones, admin_id
```

---

## 2. Flujo de Conciliación

```
POST /api/admin/provider/conciliaciones
Body: { fecha, tipo, cantidadProveedor, observaciones }

1. provider.controller.registrarConciliacion(req, res)
2. └→ providerService.registrarConciliacion({
       fecha, tipo, cantidadProveedor, observaciones,
       adminId: req.admin.id, adminNombre: req.admin.nombre
     })
3.   ├── Validar tipo ∈ ['almuerzo', 'refrigerio']
4.   ├── Validar cantidadProveedor ≥ 0
5.   ├── getResumenProveedor(fecha) → obtener totalEntregado de SIGBA
6.   │     cantidadSigba = reclamados + administrativos del día
7.   ├── diferencia = cantidadSigba - cantidadProveedor
8.   ├── estado = determinarEstado(diferencia):
9.   │     |diferencia| = 0 → CONCILIADO
10.  │     |diferencia| ≤ 2 → DIFERENCIA_MENOR
11.  │     |diferencia| > 2 → DIFERENCIA_CRITICA
12.  ├── UPSERT conciliaciones_proveedor (ON CONFLICT fecha+tipo)
13.  └── Log auditado: info("[provider.conciliacion]", ...)
```

---

## 3. Estados de Conciliación

| Estado | Regla | Significado |
|--------|-------|------------|
| `CONCILIADO` | diferencia = 0 | Coincidencia exacta |
| `DIFERENCIA_MENOR` | 1 ≤ \|diferencia\| ≤ 2 | Diferencia leve, revisar |
| `DIFERENCIA_CRITICA` | \|diferencia\| > 2 | Diferencia significativa, requiere auditoría |
| `PENDIENTE` | (no usado aún, reservado) | Sin conciliar |

**Fuente de verdad:** SIGBA sigue siendo fuente primaria. La conciliación registra diferencias pero NO modifica redenciones, bonos_diarios ni históricos.

---

## 4. Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/admin/provider/resumen` | Resumen proveedor del día (métricas por tipo) |
| `POST` | `/api/admin/provider/conciliaciones` | Registrar conciliación |
| `GET` | `/api/admin/provider/conciliaciones` | Historial filtrable paginado |
| `GET` | `/api/admin/provider/conciliaciones/:id` | Detalle de conciliación |
| `GET` | `/api/admin/provider/exportar/resumen` | Descargar Excel resumen |
| `GET` | `/api/admin/provider/exportar/conciliaciones` | Descargar Excel historial |

---

## 5. Exportaciones Excel

### 5.1 Resumen proveedor

Columnas: Concepto, Valor — por tipo (almuerzo, refrigerio):
- Total operativo, Reclamados, Administrativos, Total SIGBA
- Expirados, No utilizados, Reutilizables
- Conciliación: proveedor, diferencia, estado

**Formato:** `.xlsx` multi-sheet con columnas auto-ajustadas.  
**Acceso:** Botón "Excel resumen" en frontend (HTML-to-XLS) + endpoint backend para historial.

### 5.2 Historial conciliaciones

Columnas: Fecha, Tipo, SIGBA, Proveedor, Diferencia, Estado, Admin, Observaciones, Registrado.

**Formato:** `.xlsx` con XLSX (SheetJS).  
**Acceso:** Botón "Excel historial" en frontend (link directo a endpoint backend).

---

## 6. Auditoría

Toda conciliación registra:

| Campo | Origen | Descripción |
|-------|--------|-------------|
| `admin_id` | `req.admin.id` (JWT) | Admin que registró |
| `observaciones` | `req.body.observaciones` | Notas de conciliación |
| `cantidad_sigba` | Automático | Total calculado por SIGBA |
| `cantidad_proveedor` | Manual | Reportado por proveedor |
| `diferencia` | Automático | SIGBA - Proveedor |
| `estado` | Automático | Determinado por regla |
| `created_at` | NOW() | Timestamp |

**Log:** `info("[provider.conciliacion]", { fecha, tipo, cantidadSigba, cantidadProveedor, diferencia, estado, adminId, adminNombre })`

---

## 7. Invariantes Nuevas (Capa Proveedor)

| # | Invariante | Garantía |
|---|-----------|----------|
| IP1 | La capa proveedor NO modifica redenciones | Solo lectura de redenciones + escritura en tabla propia |
| IP2 | La capa proveedor NO recalcula disponibilidad | No importa calculateDisponibilidad |
| IP3 | La capa proveedor NO afecta cierres | No toca bonos_diarios (solo lectura) |
| IP4 | SIGBA sigue siendo fuente primaria | `cantidad_sigba` se calcula de datos consolidados |
| IP5 | Las conciliaciones son inmutables (UPSERT) | Cada fecha+tipo tiene exactamente un registro activo |
| IP6 | El historial de conciliaciones es trazable | admin_id + created_at + observaciones |

---

## 8. Separación del Core

La capa proveedor fue verificada estáticamente:

- `provider.service.js` NO importa `calculateDisponibilidad`
- `provider.service.js` NO importa `expireBonos`
- `provider-export.service.js` solo lee vía `provider.service`
- Tabla `conciliaciones_proveedor` independiente de `redenciones`

---

## 9. Archivos

### Backend

| Archivo | Cambio |
|---------|--------|
| `database/migrations/002_provider_conciliations.sql` | **Nuevo** — CREATE TABLE conciliaciones_proveedor + índices |
| `backend/src/modules/provider/provider.service.js` | **Nuevo** — getResumenProveedor, registrarConciliacion, getConciliaciones |
| `backend/src/modules/provider/provider-export.service.js` | **Nuevo** — Excel: resumen + historial |
| `backend/src/modules/provider/provider.controller.js` | **Nuevo** — 6 endpoints |
| `backend/src/modules/provider/provider.routes.js` | **Nuevo** — Rutas con authenticateAdmin |
| `backend/src/app.js` | **Modificado** — +2 líneas (import + mount) |

### Frontend

| Archivo | Cambio |
|---------|--------|
| `frontend/src/app/admin/services/provider-operations.service.ts` | **Nuevo** — HTTP client para 6 endpoints |
| `frontend/src/app/admin/pages/admin-dashboard-page/admin-dashboard-page.ts` | **Modificado** — Módulo 'proveedor': 16 signals, 6 métodos, helper absValue |
| `frontend/src/app/admin/pages/admin-dashboard-page/admin-dashboard-page.html` | **Modificado** — Nav button + bloque completo: resumen, métricas, formulario conciliación, historial, filtros, paginación, exportación |

### Scripts

| Archivo | Cambio |
|---------|--------|
| `scripts/run-migration-002.js` | **Nuevo** — Aplicar migración vía pg |
| `scripts/diagnostics/validar-provider-layer.js` | **Nuevo** — 21 smoke tests |

---

## 10. Smoke Tests

### Core operacional: 25/25 ✅
### Capa institucional: 21/21 ✅  
### Capa proveedor: 21/21 ✅

**Total acumulado: 67/67 — CERO REGRESIONES**

---

## 11. Próximos Pasos

1. Exportar PDF del resumen de conciliación (fuera del alcance actual)
2. Dashboard de tendencias de diferencias a lo largo del tiempo
3. Alertas automáticas cuando `DIFERENCIA_CRITICA` persiste N días consecutivos
4. Integrar con notificaciones (email al admin cuando hay diferencia crítica)
5. Automatizar carga de reportes del proveedor (CSV/Excel upload)

---

> **Estado final de Fase 2: COMPLETADA.**  
> Core operacional: intacto.  
> Capa institucional: intacta.  
> Capa proveedor: operativa, auditada, exportable.  
> Smoke tests acumulados: 67/67 ✅
