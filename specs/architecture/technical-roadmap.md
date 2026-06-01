# SIGBA — Technical Roadmap

## Objetivo

Definir la estrategia técnica progresiva para evolucionar SIGBA hacia una arquitectura:

* mantenible
* modular
* estable
* auditable
* escalable operativamente

SIN detener la operación actual del sistema.

El roadmap NO representa:

* una reescritura completa
* migraciones agresivas
* cambios masivos inmediatos

Representa:

* evolución controlada
* estabilización progresiva
* reducción de deuda técnica
* consolidación de dominios funcionales

---

# Principios del Roadmap

Toda evolución técnica deberá priorizar:

1. Estabilidad operativa
2. Trazabilidad institucional
3. Compatibilidad funcional
4. Modularización progresiva
5. Claridad arquitectónica
6. Simplicidad operativa

---

# Restricciones Oficiales

NO implementar:

* microservicios
* clean architecture extrema
* sobreingeniería
* refactors masivos sin dominio claro
* múltiples fuentes de verdad
* sistemas distribuidos innecesarios

La prioridad es:

* operación institucional real
* mantenibilidad gradual
* claridad del sistema
* estabilidad a largo plazo

---

# Estado Actual

SIGBA ya cuenta con:

* autenticación JWT
* recuperación de contraseña
* estudiantes
* subsidios
* reservas
* reclamaciones
* expiraciones
* analytics
* dashboard
* concurrencia básica
* integración Google Sheets
* configuración institucional
* Docker + PostgreSQL

El sistema ya se considera:

## operativo institucionalmente

La prioridad ahora es:

* estabilizar
* modularizar
* consolidar arquitectura

---

# Estrategia General

La evolución de SIGBA seguirá esta filosofía:

## “Mover sin romper comportamiento”

Los refactors deben:

* separar responsabilidades
* reducir deuda técnica
* mejorar mantenibilidad

SIN:

* alterar reglas operativas
* cambiar flujos funcionales ya estabilizados
* introducir reescrituras innecesarias

---

# FASE 1 — Estabilización Operativa

## Prioridad: CRÍTICA
## Estado: PARCIALMENTE COMPLETADA ✅

Objetivo:
Garantizar consistencia operativa del sistema actual.

---
## Completado

### Concurrencia y race conditions ✅
* bloqueo correcto de cupos (FOR UPDATE)
* transacciones seguras (READ COMMITTED)
* validaciones concurrentes
* prevención de sobreasignación (unique_student_bono_diario)

### Horarios y expiraciones ✅
* validación correcta de días hábiles
* expiraciones automáticas (scheduler 60s, advisory lock 42)
* cierre correcto de franjas (calcularNoUtilizada)
* consistencia de estados (expireBonos idempotente)

### Zona horaria ✅ (Fases TZ1 + TZ2)
* `getBogotaDate()` reemplaza `toISOString().slice(0,10)`
* `BOGOTA.date` / `BOGOTA.timestamp` reemplazan `CURRENT_DATE` / `NOW()`
* Timezone unificado: America/Bogota en Node.js y PostgreSQL

### Docker e infraestructura ✅
* init.sql estable
* migraciones consistentes (001-005)
* bootstrap reproducible
* timezone unificado

## Pendiente

### Sincronización reactiva
* polling inteligente
* actualización automática de franjas
* sincronización entre pestañas
* actualización inmediata de disponibilidad

---

## Resultado esperado

SIGBA debe:

* comportarse consistentemente
* reaccionar correctamente
* soportar concurrencia real
* mantener sincronización operativa estable

---

# FASE 2 — Modularización Frontend

## Prioridad: ALTA

Objetivo:
Reducir deuda técnica del frontend SIN cambiar comportamiento.

---

## Dominios prioritarios

### Dashboard

Separar:

* analytics
* cards
* gráficos
* filtros
* métricas

### Admin

Extraer:

* operaciones diarias
* configuración
* resumen diario
* reutilización

### Auth

Separar:

* login
* recuperación
* guards
* sesiones
* estado auth

---

## Estrategia

Aplicar:

* container/component
* services pequeños
* signals localizados
* componentes reutilizables

---

## Restricciones

NO:

* migrar a ngrx complejo
* crear stores globales innecesarios
* rehacer UI completa

---

## Resultado esperado

Frontend:

* más mantenible
* más modular
* más entendible
* con menos lógica por página

---

# FASE 3 — Consolidación Backend

## Prioridad: ALTA

Objetivo:
Reducir lógica cruzada y consolidar dominios backend.

---

## Prioridades

### Bonos

Separar:

* disponibilidad
* reservas
* expiraciones
* reclamaciones
* cierres

### Students/Subsidies

Consolidar:

* periodos
* subsidios
* activación
* importaciones

### Integrations

Separar:

* Google Sheets
* correo
* futuros conectores

---

## Resultado esperado

Backend:

* modular
* con servicios más pequeños
* menos dependencias cruzadas
* más fácil de mantener

---

# FASE 4 — Reutilización Administrativa

## Prioridad: MEDIA
## Estado: COMPLETADA ✅

Objetivo:
Implementar reutilización manual institucional.

---
## Completado ✅

### Bolsa reutilizable
* trazabilidad (calculateBaseAdministrativa)
* conteo histórico
* cierre diario

### Asignación administrativa
* búsqueda estudiante
* tipo bono
* motivo administrativo
* auditoría (admin_id, motivo_asignacion, created_at)

### Franja administrativa
* separada de subsidio
* separada de venta libre
* visible en frontend (sección Asignaciones Admin)
* `modalidad_operacional = 'administrativo'`

---

## Resultado esperado

La reutilización:

* NO dependerá de reaperturas automáticas
* NO romperá horarios actuales
* mantendrá trazabilidad completa

---

# FASE 5 — Cierres Operativos

## Prioridad: MEDIA

Objetivo:
Congelar históricos operativos diarios.

---

## Incluye

### Cierres automáticos

* almuerzo
* refrigerio
* reutilización

### Consolidación histórica

* reclamados
* expirados
* no utilizados
* pendientes proveedor

### Reportes históricos

* consumo
* desperdicio
* pendientes acumulados

---

## Resultado esperado

SIGBA podrá:

* generar reportes reales
* congelar históricos
* soportar auditoría institucional

---

# FASE 6 — Analytics Institucionales

## Prioridad: MEDIA

Objetivo:
Construir analytics alineados con operación real.

---

## Prioridades

### Subsidios

* asistencia real
* inasistencia real
* horarios válidos
* disciplina operativa

### Reportes operativos

* uso por día
* tendencias
* pendientes
* aprovechamiento

### Dashboard institucional

* métricas simples
* información accionable
* visualización clara

---

## Restricciones

NO construir:

* dashboards saturados
* métricas irrelevantes
* visualizaciones innecesarias

---

# FASE 7 — Estabilización Final

## Prioridad: BAJA

Objetivo:
Preparar SIGBA para crecimiento futuro estable.

---

## Incluye

### Observabilidad

* logging estructurado
* errores centralizados
* monitoreo básico

### Performance

* queries críticas
* índices
* polling optimizado

### Seguridad

* hardening JWT
* sesiones
* auditoría administrativa

### Documentación

* specs
* onboarding
* despliegue
* mantenimiento

---

# Fases Completadas (Post-Roadmap Original)

## FASE TZ1 — Normalización Zona Horaria Node.js (2026-05-27) ✅

**Objetivo:** Corregir `toISOString().slice(0,10)` que devolvía fecha UTC en vez de Colombia.

**Entregables:**
- `backend/src/shared/helpers/timezone.helper.js` — `getBogotaDate()`, `formatBogotaDate(date)`
- 15 archivos backend migrados de `toISOString().slice(0,10)` a helper
- Logs temporales de timezone en `requestBono`, `claimBono`, `expireBonos`, `scheduler`

**Resultado:** Backend usa exclusivamente fecha Colombia para lógica operacional.

## FASE TZ2 — Normalización Zona Horaria PostgreSQL (2026-05-27) ✅

**Objetivo:** Reemplazar `CURRENT_DATE` y `NOW()` operacional por `AT TIME ZONE 'America/Bogota'` explícito.

**Entregables:**
- `backend/src/shared/helpers/sql-timezone.helper.js` — `BOGOTA.date`, `BOGOTA.timestamp`
- 14 `CURRENT_DATE` → `${BOGOTA.date}`, 6 `NOW()` → `${BOGOTA.timestamp}`
- `init.sql` actualizado con nota de zona horaria

**Resultado:** PostgreSQL y Node.js usan la misma referencia temporal explícita.

## FASE M1 — Modalidad Operacional: Columna + Backfill (2026-05-29) ✅

**Objetivo:** Agregar `modalidad_operacional` sin cambiar lógica.

**Entregables:**
- Migración `005_add_modalidad_operacional.sql`
- Backfill histórico con misma lógica de `getModalidadExpression()`
- `requestBono()` y `createAdminRedencion()` persisten la clasificación

## FASE M2 — Modalidad Operacional: Consumo (2026-05-30) ✅

**Objetivo:** `getModalidadExpression()` prioriza `modalidad_operacional` con fallback legacy.

**Entregables:**
- `modalidad.helper.js` actualizado con doble CASE
- `administrativo` → `venta_libre` (compatibilidad temporal)

## FASE M3 — Modalidad Operacional: Frontend (2026-05-31) ✅

**Objetivo:** Exponer `modalidad_operacional` en UI sin romper `franja` legacy.

**Entregables:**
- Columna `Modalidad` en Resumen Diario y Asignaciones Admin
- Interfaces TypeScript actualizadas
- Exportación PDF con ambas columnas

## FIX — Operational Snapshot (2026-06-01) ✅

**Bug:** Estado Operacional Diario siempre mostraba fecha actual, ignorando filtro del usuario.

**Fix:** `snapshotDate = fechaSnapshot || inicio` en `analytics-v2.service.js:27`

## DOC — Actualización Documental (2026-06-01) ✅

**Entregables:**
- `CURRENT_PROJECT_STATUS.md`, `daily-operational-cycle.md`
- `source-of-truth.md`, `formal-testing.md` completados
- `invariants.md`, `operational-rules.md`, `critical-flows.md`, `bonos-stable-core.md` actualizados

---

# Estrategia de Trabajo con IA

Toda nueva funcionalidad deberá:

* partir desde specs
* respetar bounded contexts
* respetar arquitectura actual
* evitar lógica cruzada

---

## Filosofía Oficial

Primero:

1. analizar
2. entender dominio
3. detectar impacto
4. proponer estrategia

Después:
5. implementar

---

# Objetivo Final

Construir un sistema:

* mantenible
* modular
* estable
* auditable
* institucionalmente sólido

SIN perder:

* simplicidad operativa
* claridad funcional
* estabilidad del negocio
