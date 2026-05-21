# SIGBA — Núcleo Estable de Bonos (Bonos Stable Core)

> **Fecha:** 2026-05-21  
> **Versión:** v2.0 — Congelamiento formal  
> **Estado:** OPERACIONALMENTE ESTABLE  
> **Línea base:** `bonos.service.js` (1043 LOC), `bonos.admin-assignment.service.js` (404 LOC), `scheduler.js` (72 LOC)  

---

## Resumen

El núcleo operacional de bonos fue auditado, corregido, endurecido y validado.  
Este documento congela su estado actual como la referencia oficial para cualquier trabajo futuro.

**Regla de oro:** TODO cambio que toque el núcleo debe pasar auditoría previa documentada en `specs/architecture/`.

---

# 1. Arquitectura Actual

## 1.1 Diagrama de componentes

```
┌─────────────────────────────────────────────────────────────────┐
│                        app.js / server.js                       │
│  process.env.TZ = 'America/Bogota'                              │
│  db.js → pool PostgreSQL (timezone=America/Bogota)              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐    ┌───────────────────┐    ┌──────────────────┐  │
│  │ Scheduler│    │  bonos.service.js  │    │ admin-assignment │  │
│  │  60s     │───→│                    │    │   .service.js    │  │
│  │          │    │  requestBono       │    │                   │  │
│  │ getStatus│    │  claimBono         │    │  asignarAdmin     │  │
│  │          │    │  expireBonos       │    │  getBaseAdmin     │  │
│  │ start()  │    │  getDisponibilidad │    │  calculateBase    │  │
│  │ stop()   │    │  getEstadoSistema  │    │                   │  │
│  └──────────┘    │  calcularNoUtil    │    └──────────────────┘  │
│                  │  cerrarOperacion   │                          │
│  ┌──────────┐    │  liberarBonos      │    ┌──────────────────┐  │
│  │ Health   │    │  cargarBonosExtra  │    │  Logger Helper   │  │
│  │ Endpoint │    │  calculateDisp     │    │                   │  │
│  │ /health  │    │                    │    │  log()→BONOS_DEBUG│  │
│  └──────────┘    └───────────────────┘    │  info()→always    │  │
│                                           │  error()→always   │  │
│  ┌─────────────────────────────────┐     └──────────────────┘  │
│  │  PostgreSQL (advisory locks)    │                            │
│  │  - pg_try_advisory_lock(42)     │                            │
│  │  - FOR UPDATE sobre bonos_      │                            │
│  │    diarios y redenciones        │                            │
│  └─────────────────────────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
```

## 1.2 Scheduler (`backend/src/modules/system/scheduler.js`)

| Propiedad | Valor |
|-----------|-------|
| Intervalo | 60,000 ms (60 segundos) |
| Arranque | Automático al iniciar server (vía `app.js`) |
| Idempotencia | `if (intervalId) return` previene doble start |
| Concurrencia | `if (running) return` previene solapamiento de ciclos |
| Tracking | `active`, `startTime`, `lastCycleAt`, `lastExpireCount`, `lastErrorAt`, `lastErrorMessage`, `currentlyRunning` |

**Ciclo de vida:**
```
app.js → DB conectada → scheduler.start()
  └→ runCycle() inmediato
  └→ setInterval(runCycle, 60000)
       └→ expireBonos()
            └→ pg_try_advisory_lock(42)
                 └→ BEGIN → UPDATE redenciones → calcularNoUtilizada → COMMIT
                      └→ UNLOCK
```

**Métricas expuestas por `getStatus()`:**
```json
{
  "active": true,
  "startTime": "2026-05-21T14:00:00.000Z",
  "lastCycleAt": "2026-05-21T21:36:38.416Z",
  "lastExpireCount": 3,
  "lastErrorAt": null,
  "lastErrorMessage": null,
  "intervalMs": 60000,
  "currentlyRunning": false
}
```

## 1.3 expireBonos — el motor de expiración transaccional

**Ubicación:** `bonos.service.js:801-853`  
**Locks:** Advisory lock `pg_try_advisory_lock(42)` + transacción READ COMMITTED  
**Throttling:** 30,000 ms mínimo entre ejecuciones (previene stampede)  

```
expireBonos()
  ├── [T-30s: throttle? → retornar []]
  ├── [pg_try_advisory_lock(42): lock? → retornar []]
  ├── BEGIN
  │    ├── UPDATE redenciones SET estado='expirado'
  │    │    WHERE estado='reservado' AND expiracion_at < NOW()
  │    │    RETURNING *
  │    ├── calcularNoUtilizada(client)
  │    │    └── por cada tipo (almuerzo, refrigerio):
  │    │         if (!isPastClosing(tipo)) skip
  │    │         cerrarOperacionDiariaInterna(tipo, client)
  │    │              ├── SELECT bd.* FROM bonos_diarios (vía JOIN config_bonos)
  │    │              ├── COUNT redenciones (excluyendo ADMINISTRATIVA)
  │    │              ├── noUtilizada = MAX(0, totalOperativo - totalRedenciones)
  │    │              └── IF cambiara → UPDATE bonos_diarios
  │    └── COMMIT
  ├── [FINALLY: pg_advisory_unlock(42), client.release()]
  └── retornar filas expiradas
```

**Garantías:**
- Idempotente: el guard `WHERE estado = 'reservado'` asegura que solo se expira una vez
- Atómico: todo dentro de una transacción (BEGIN/COMMIT/ROLLBACK)
- Anti-stampede: advisory lock + throttling previenen ejecución concurrente
- Escritura condicional: `calcularNoUtilizada` solo UPDATE si el valor realmente cambió

**Invariante de disponibilidad ante expireBonos:**
```
reservado ↓ (pasa a expirado)
expirados ↑ (mismo bono)
→ reservasActivas ↓ 1, expiradosPendientes ↑ 1
→ disponibles = SIN CAMBIOS
```

Expirar bonos **no altera `disponibles`**. Solo reclasifica capacidad.

## 1.4 Cierre Operacional (`calcularNoUtilizada` + `cerrarOperacionDiariaInterna`)

**Disparador:** `isPastClosing(tipo)` → `new Date() >= getClosingTime(tipo)`  
**Horas de cierre total:**
- Almuerzo: 12:05 PM (ventaLibre.expiracion)
- Refrigerio: 10:00 PM (ventaLibre.expiracion)

**Fórmula de consolidación:**
```
noUtilizada = MAX(0, totalOperativo - totalRedenciones)
donde:
  totalOperativo = cantidad_base + cantidad_extra
  totalRedenciones = COUNT(redenciones WHERE tipo_asignacion != 'ADMINISTRATIVA')
```

**Orden correcto de operaciones (corregido):**
```
getOrCreateBonoDiario(tipo)  ← PRIMERO: crear/obtener fila del día
expireBonos()                 ← DESPUÉS: expirar reservas vencidas
calculateDisponibilidad(id)   ← LEER: datos consolidados
```

## 1.5 Advisory Locks

| Lock | Clave | Propietario | Alcance |
|------|-------|------------|---------|
| `pg_try_advisory_lock(42)` | 42 | `expireBonos()` standalone | Previene 2 expireBonos simultáneos |
| `FOR UPDATE` sobre `bonos_diarios` | — | `requestBono()`, `asignarAdministrativamente()` | Serializa acceso a la fila del día |
| `FOR UPDATE` sobre `redenciones` | — | `claimBono()` | Bloquea la redención específica |

**Propósito de `pg_try_advisory_lock(42)`:**
- `expireBonos()` standalone usa `pg_try_` (non-blocking): si el lock está tomado, retorna `[]` sin esperar
- Liberado en `finally` (garantizado, incluso en error/ROLLBACK)
- Previene ejecución redundante entre el scheduler y los 7 call sites de lectura

## 1.6 Throttling

```javascript
const EXPIRE_THROTTLE_MS = 30_000; // 30 segundos
let lastExpireRun = 0;

// Al inicio de expireBonos():
if (Date.now() - lastExpireRun < EXPIRE_THROTTLE_MS) return [];
// Al final (tras COMMIT exitoso):
lastExpireRun = Date.now();
```

**Efecto:** Los 7 call sites que llaman a `expireBonos()` desde endpoints de lectura son throttled.  
El scheduler (60s) + throttling (30s) aseguran que `expireBonos()` se ejecuta como máximo cada 30s.

## 1.7 Asignaciones Administrativas (`bonos.admin-assignment.service.js`)

**Regla de capacidad:**
```
base_administrativa = expirados + no_utilizados - administrativos_ya_realizados
```

**Flujo transaccional:**
```
asignarAdministrativamente({ tipo, studentId, codigoBono, adminId, motivo })
  ├── BEGIN
  ├── assertAssignmentSchemaReady (verifica migración)
  ├── getLockedBonoDiario (FOR UPDATE sobre bonos_diarios)
  ├── getActiveStudentForAssignment (FOR UPDATE sobre students)
  ├── studentAlreadyConsumedToday (previene solapamiento)
  ├── calculateBaseAdministrativa (expirados + noUtilizados - administrativos)
  ├── IF disponible <= 0 → ERROR
  ├── createAdminRedencion (INSERT redenciones estado='reclamado' tipo='ADMINISTRATIVA')
  └── COMMIT
```

**Características:**
- No depende de `calculateDisponibilidad` — tiene su propio cálculo `calculateBaseAdministrativa`
- No crea nuevos bonos — consume del pool expirados + no utilizados
- Aislado del núcleo operacional: no modifica disponibilidad ni noUtilizada
- El lock `FOR UPDATE` sobre `bonos_diarios` serializa vs `requestBono`
- Estado: preparado pero **no conectado a rutas ni frontend** (capacidad futura)

---

# 2. Invariantes Oficiales

## 2.1 Invariantes de dominio

| # | Invariante | Garantía |
|---|-----------|----------|
| I1 | Un estudiante **no** puede consumir almuerzo y refrigerio el mismo día | `studentAlreadyHasBono` + unique constraint |
| I2 | Un bono **reclamado** es terminal | No existe transición de `reclamado` a otro estado |
| I3 | Un bono **expirado** es terminal | No existe transición de `expirado` a otro estado |
| I4 | Un bono **no utilizado** es terminal | Consolidado en `cantidad_no_utilizada`, nunca se reabre |
| I5 | Analytics **NO** modifica operación viva | Solo lectura, sin UPDATE/INSERT en tablas operativas |
| I6 | Cierres congelan históricos | Una vez calculado `cantidad_no_utilizada`, no se recalcula sin nueva operación |
| I7 | Backend es fuente oficial | Frontend no calcula expiraciones, disponibilidad ni estados operativos |
| I8 | Reutilización automática está **prohibida** | Eliminada del sistema; reemplazada por asignación administrativa manual |
| I9 | Administrativos **NO** crean nuevos bonos | Consumen del pool expirados + no utilizados |
| I10 | Administrativos consumen expirados + no utilizados | `base_administrativa = expirados + noUtilizados - administrativos` |

## 2.2 Invariantes de datos

| # | Invariante | Implicación |
|---|-----------|------------|
| D1 | Snapshots históricos inmutables | `bonos_diarios.cantidad_no_utilizada` solo se actualiza con guard `if (cambiara)` |
| D2 | Separación operacional/admin | Redenciones administrativas se excluyen del COUNT operacional (`tipo_asignacion != 'ADMINISTRATIVA'`) |
| D3 | Disponibilidad derivada | `disponibles = totalOperativo - reservasActivas - expiradosPendientes - noUtilizada` |
| D4 | Idempotencia de expireBonos | WHERE `estado = 'reservado'` garantiza que la 2ª ejecución afecta 0 filas |
| D5 | Escritura condicional | `calcularNoUtilizada` solo UPDATE si `valorPrevio !== noUtilizada` |

## 2.3 Invariantes de fórmula

**Disponibilidad (cuando `noUtilizada > 0`):**
```
disponibles = cantidad_liberada
```

**Prueba algebraica (reducción completa en `specs/architecture/cierre-operacional-audit.md`):**
```
disponibles = totalOperativo - reservasActivas - expiradosPendientes - noUtilizada
            = totalOperativo - (reservados + reclamados) - (expirados - liberados)
              - [totalOperativo - (reservados + reclamados + expirados)]
            = liberados
```

---

# 3. Flujos Oficiales

## 3.1 requestBono

```
POST /bonos/solicitar  { studentId, tipo }

1. validateTipo, validateStudentId
2. isWorkingDay → ERROR si no es día hábil
3. getEstadoSistema(tipo) → ERROR si bloqueado/cerrado
4. BEGIN TRANSACTION READ COMMITTED
5. expireBonosInTransaction(client) — expira reservas vencidas dentro de TX
6. getOrCreateBonoDiario(tipo, client) — FOR UPDATE
7. IF subsidiado → validateSubsidio
8. studentAlreadyHasBono → ERROR si ya consumió hoy
9. calculateDisponibilidad(id, client) → ERROR si disponibles ≤ 0
10. INSERT redenciones (estado='reservado', expiracion_at=calculado)
11. COMMIT
12. Retornar: redención + disponibilidad actualizada
```

## 3.2 claimBono

```
POST /bonos/reclamar/:redencionId  { codigoBono }

1. validate codigoBono (entero positivo)
2. BEGIN TRANSACTION
3. SELECT redenciones WHERE id = $1 FOR UPDATE
4. IF no encontrada → ERROR
5. IF estado != 'reservado' → ERROR
6. IF expiracion_at < NOW() → expirar dentro de TX → ERROR "ya expiró"
7. UPDATE redenciones SET estado='reclamado', hora_reclamo=NOW(), codigo_bono=$2
8. COMMIT
9. Retornar: redención actualizada
```

## 3.3 expireBonos

```
Disparado por: scheduler (cada 60s) + 7 call sites de lectura (throttled a 30s)

1. Throttle check: si < 30s desde última ejecución → retornar []
2. pg_try_advisory_lock(42): si lock ocupado → retornar []
3. BEGIN TRANSACTION READ COMMITTED
4. UPDATE redenciones SET estado='expirado'
   WHERE estado='reservado' AND expiracion_at < NOW() RETURNING *
5. IF rows.length > 0 → log INFO
6. calcularNoUtilizada(client):
   FOR EACH tipo IN ['almuerzo', 'refrigerio']:
     IF isPastClosing(tipo):
       cerrarOperacionDiariaInterna(tipo, client):
         a. SELECT bd.* FROM bonos_diarios JOIN config_bonos
         b. COUNT redenciones (excluyendo ADMINISTRATIVA)
         c. noUtilizada = MAX(0, totalOperativo - totalRedenciones)
         d. IF valorPrevio !== noUtilizada → UPDATE
7. COMMIT
8. FINALLY: pg_advisory_unlock(42), client.release()
9. lastExpireRun = Date.now()
```

## 3.4 Scheduler

```
Ciclo cada 60 segundos:

scheduler.start()
  ├── runCycle() inmediato
  └── setInterval(runCycle, 60000)
       └── IF running → skip (anti-solapamiento)
           running = true
           TRY:
             result = await expireBonos()
             lastCycleAt = now
             lastExpireCount = result.length
             IF expired > 0 → log INFO
           CATCH:
             lastErrorAt = now
             lastErrorMessage = err.message
             log ERROR
           FINALLY:
             running = false

Métricas expuestas vía getStatus() → GET /api/system/health
```

## 3.5 Cierre Automático (vía `calcularNoUtilizada`)

```
Disparado por expireBonos() cuando isPastClosing(tipo) = true

Almuerzo: se activa ≥ 12:05 PM
Refrigerio: se activa ≥ 10:00 PM

Fórmula:
  noUtilizada = MAX(0, totalOperativo - totalRedenciones)
  donde totalRedenciones excluye asignaciones administrativas

Escritura condicional: solo UPDATE si el valor cambió respecto a DB.
```

## 3.6 Asignación Administrativa

```
Disparado por: admin (futuro, no conectado a rutas aún)

1. validate tipo, studentId, codigoBono
2. isWorkingDay → ERROR si no
3. BEGIN TRANSACTION
4. assertAssignmentSchemaReady → ERROR si migración no aplicada
5. getLockedBonoDiario(tipo) → FOR UPDATE sobre bonos_diarios
6. getActiveStudentForAssignment → FOR UPDATE sobre students
7. studentAlreadyConsumedToday → ERROR si ya consumió
8. calculateBaseAdministrativa:
   base = expirados + noUtilizados - administrativos_ya_realizados
9. IF disponible ≤ 0 → ERROR
10. createAdminRedencion → INSERT estado='reclamado' tipo='ADMINISTRATIVA'
11. COMMIT
```

---

# 4. Restricciones — Lo que NO se debe modificar

## 4.1 Zona crítica (ROJA)

**Prohibido modificar sin auditoría previa documentada:**

| Componente | Archivo | Líneas | Motivo |
|-----------|---------|--------|--------|
| `calculateDisponibilidad` | `bonos.service.js` | 738-791 | Fórmula matemática validada. Cualquier cambio altera el output de 7 endpoints. |
| `calcularNoUtilizada` | `bonos.service.js` | 934-939 | Consolida cierre operacional. Depende de `isPastClosing`. |
| `cerrarOperacionDiariaInterna` | `bonos.service.js` | 941-979 | Escritura condicional sobre `bonos_diarios`. El guard `if (cambiara)` es crítico. |
| `expireBonos` (advisory lock) | `bonos.service.js` | 801-853 | Lock key=42, throttling=30s. Cambiar estos valores puede causar stampede. |
| `getOrCreateBonoDiario` + orden en `getDisponibilidad` | `bonos.service.js` | 215-226 | El orden corregido (crear PRIMERO, expirar DESPUÉS) es crítico. |
| Invariantes históricas | `bonos_diarios.cantidad_no_utilizada` | — | Una vez consolidado, no se recalcula sin nueva operación. |
| `FOR UPDATE` locks | `bonos.service.js` | 74, 158, 175 | Serializan concurrencia. Removerlos causa race conditions. |
| Scheduler cadence | `scheduler.js` | 4 | 60s es el intervalo validado. Cambiarlo afecta frescura de datos y carga de DB. |

## 4.2 Zona de precaución (AMARILLA)

**Modificable con revisión:**

| Componente | Riesgo |
|-----------|--------|
| `requestBono` (validaciones) | Medio — las validaciones de subsidio, día hábil y solapamiento son reglas institucionales |
| `claimBono` (validación de código) | Bajo — la validación de código es UI/UX, no operacional |
| `getEstadoSistema` (horarios) | Alto — los horarios son institucionales. Cambiarlos requiere aprobación. |
| `HORARIOS` constantes | Alto — definen franjas subsidiado/ventaLibre/cierre. Cambios afectan disponibilidad. |
| `Scheduler` (métricas) | Bajo — añadir métricas a `getStatus()` es seguro |
| `Logger` (tags) | Bajo — cambiar tags de log no afecta operación |

---

# 5. Errores Históricos Resueltos

## 5.1 Capacidad Fantasma (Bug #1 — Corregido 2026-05-21)

**Síntoma:** `getDisponibilidad('almuerzo')` mostraba 108 disponibles cuando debía mostrar 0.

**Causa raíz:** Orden incorrecto de operaciones — `expireBonos()` → `calcularNoUtilizada()` se ejecutaba **antes** de que `getOrCreateBonoDiario()` creara la fila del día. Como `calcularNoUtilizada()` no encontraba `bonos_diarios`, omitía el UPDATE → `cantidad_no_utilizada` permanecía en 0 (DEFAULT) → la fórmula de disponibilidad calculaba capacidad fantasma.

**Corrección:** Invertir orden en `getDisponibilidad()` y `liberarBonos()`: crear/obtener `bonos_diarios` PRIMERO, luego `expireBonos()` DESPUÉS.

**Archivos:** `bonos.service.js:215-226`, `bonos.service.js:496-502`  
**Doc:** `specs/architecture/cierre-operacional-fix.md`

## 5.2 Bug `SELECT *` en JOIN con colisión de columnas (Bug #2 — Corregido 2026-05-21)

**Síntoma:** `calcularNoUtilizada()` usaba `config_bonos.id` en vez de `bonos_diarios.id` debido a que PostgreSQL colapsa columnas con el mismo nombre en `SELECT *`.

**Causa raíz:**  
```sql
-- ANTES (roto):
SELECT * FROM bonos_diarios bd JOIN config_bonos cb ON cb.id = bd.config_bono_id
-- row.id = cb.id (1 para almuerzo), NO bd.id (3)

-- DESPUÉS (corregido):
SELECT bd.* FROM bonos_diarios bd JOIN config_bonos cb ON cb.id = bd.config_bono_id
-- row.id = bd.id (correcto)
```

**Impacto:** COUNT de redenciones operaba sobre la fila equivocada → 0 redenciones → noUtilizada = totalOperativo (incorrecto).

**Corrección:** Cambiar `SELECT *` → `SELECT bd.*` en `cerrarOperacionDiariaInterna` y `cerrarOperacionDiaria`.

**Archivos:** `bonos.service.js:943`, `bonos.service.js:899`  
**Doc:** `specs/architecture/cierre-operacional-fix.md`

## 5.3 Dependencia de Frontend para Decisión Operativa (Bug #3 — Corregido)

**Síntoma:** El frontend decidía si un bono era válido basándose en su propio reloj y lógica de horarios.

**Causa raíz:** Lógica de expiración y validación de horarios estaba duplicada en frontend.

**Corrección:** El backend es la única fuente de verdad para horarios, expiraciones, disponibilidad y estados operativos.

## 5.4 Corrupción de `noUtilizada` por Administrativos (Bug #4 — Prevenido)

**Riesgo identificado:** Las asignaciones administrativas crean redenciones con estado `reclamado`. Si `calcularNoUtilizada()` contara TODAS las redenciones (incluyendo administrativas), la fórmula `noUtilizada = totalOperativo - COUNT` daría un valor incorrecto (subestimaría noUtilizada).

**Mitigación:** El COUNT en `cerrarOperacionDiariaInterna` excluye explícitamente `tipo_asignacion = 'ADMINISTRATIVA'`.

**Archivo:** `bonos.service.js:964`  
**Doc:** `specs/architecture/invariants.md`

## 5.5 Franja Desconocida para Administrativos (Bug #5 — Corregido)

**Síntoma:** `getEstadoSistema` no consideraba la posibilidad de que una asignación administrativa ocurriera fuera de los horarios subsidiado/ventaLibre regulares.

**Corrección:** Las asignaciones administrativas tienen su propio flujo (`bonos.admin-assignment.service.js`) que no depende de `getEstadoSistema`. Validan solo `isWorkingDay`.

## 5.6 Logs de Debug Inundando Producción (Bug #6 — Corregido 2026-05-21)

**Síntoma:** 38+ `console.info` por llamada en operación normal, incluyendo logs detallados de `calcularNoUtilizada` por tipo, `cerrarOperacionDiariaInterna` con datos completos, y `logAdminAssignment` en cada paso.

**Corrección:** Logger centralizado con flag `BONOS_DEBUG`:
- `log()`: solo emite si `BONOS_DEBUG=true`
- `info()`: siempre emite (logs operacionales críticos)
- `error()`: siempre emite

**Resultado:** Reducción de 38+ logs/call a ~8 en operación normal.

**Archivos:** `backend/src/shared/helpers/logger.helper.js` (nuevo), `bonos.service.js`, `bonos.admin-assignment.service.js`, `scheduler.js`

---

# 6. Política de Cambios

## 6.1 Permitido (VERDE)

**Sin restricciones, seguir convenciones existentes:**

| Área | Ejemplos |
|------|----------|
| Frontend | Nuevas páginas, componentes, mejoras UX/UI |
| Reportes | Nuevos dashboards, gráficos, exportaciones |
| Analytics externos | Consultas de solo lectura, nuevas vistas SQL |
| Dashboards | Visualizaciones adicionales en admin |
| Health endpoint | Añadir nuevas métricas a `getHealth()` |
| Scripts de diagnóstico | Nuevos scripts en `scripts/diagnostics/` |
| Documentación | Nuevos documentos en `specs/` |

## 6.2 Riesgo Medio (AMARILLO)

**Requiere revisión de 1 reviewer + smoke tests:**

| Área | Precauciones |
|------|-------------|
| Scheduler | No cambiar intervalo sin medir impacto en DB. Verificar que no haya 2 instancias de scheduler. |
| expireBonos | No cambiar lock key (42) o throttling (30s) sin benchmark de concurrencia. |
| Admin assignments | Verificar que COUNT excluye ADMINISTRATIVA. El lock `FOR UPDATE` debe mantenerse. |
| getEstadoSistema | Cualquier cambio en horarios afecta disponibilidad y franjas. Requiere aprobación institucional. |
| HORARIOS constantes | Cambios en horas de cierre afectan `isPastClosing` y consolidación. |

## 6.3 Riesgo Crítico (ROJO)

**PROHIBIDO modificar sin auditoría completa documentada:**

| Componente | Qué se rompe si se toca mal |
|-----------|--------------------------|
| `calculateDisponibilidad` | 7 endpoints devuelven datos incorrectos. El dashboard muestra capacidad fantasma. |
| `calcularNoUtilizada` / `cerrarOperacionDiariaInterna` | `cantidad_no_utilizada` se corrompe. La fórmula de disponibilidad colapsa. |
| `cerrarOperacionDiaria` | El cierre explícito falla. Los históricos quedan inconsistentes. |
| Orden en `getDisponibilidad` | Regresa el bug de capacidad fantasma. |
| `SELECT bd.*` en queries JOIN | Regresa el bug de colisión de columnas. |
| Invariantes (I1-I10, D1-D5) | El sistema viola reglas institucionales. |
| Advisory lock / FOR UPDATE | Race conditions, doble asignación, capacidad fantasma. |
| `getOrCreateBonoDiario` | Si no crea la fila a tiempo, todo el sistema de disponibilidad falla. |

---

# 7. Roadmap Separado

**El núcleo operacional de bonos está CONGELADO.**  
Las siguientes áreas evolucionan de forma independiente, sin tocar el core:

## 7.1 Mejoras externas al core

| Área | Descripción | Dependencia del core |
|------|------------|---------------------|
| **Proveedor** | Módulo de gestión de proveedores, pendientes, conciliación | Ninguna (lee `bonos_diarios`) |
| **BI / Analytics** | Dashboards avanzados, tendencias, reportes históricos | Ninguna (solo lectura) |
| **QR** | Generación y escaneo de QR para bonos | Ninguna (extiende `claimBono`) |
| **Mobile** | App móvil para estudiantes (PWA o nativa) | Ninguna (consume API existente) |
| **Integrations** | Google Sheets, email, notificaciones | Baja (usa exports existentes) |
| **Auditoría** | Logs de auditoría, trazabilidad de cambios admin | Baja (hooks en endpoints existentes) |

## 7.2 Mejoras internas congeladas (no prioritarias)

| Área | Estado | Razón de congelamiento |
|------|--------|----------------------|
| Dividir `bonos.service.js` (1043 LOC) | Congelado | Riesgo de regresión. Posponer hasta tener test suite completa. |
| Extraer `HORARIOS` a BD | Congelado | Los horarios son institucionales y estables. No justifica el riesgo. |
| Refactor `calcularNoUtilizada` con `FOR UPDATE` | Congelado | El advisory lock + throttling son suficientes. |
| Migrar scheduler a `pg_cron` | Congelado | El scheduler en Node es simple y suficiente para la escala actual. |

---

# 8. Health Endpoint

**Ruta:** `GET /api/system/health` (pública, sin autenticación)

**Respuesta:**
```json
{
  "status": "ok",
  "uptime": 3600,
  "db": "ok",
  "scheduler": {
    "active": true,
    "startTime": "2026-05-21T14:00:00.000Z",
    "lastCycleAt": "2026-05-21T21:36:38.416Z",
    "lastExpireCount": 3,
    "lastErrorAt": null,
    "lastErrorMessage": null,
    "intervalMs": 60000,
    "currentlyRunning": false
  },
  "timestamp": "2026-05-21T21:36:39.881Z"
}
```

**Ubicación:** `system.controller.js:15-35`, `system.routes.js:8`

---

# 9. Logger y Modo DEBUG

**Flag:** `BONOS_DEBUG=true` (variable de entorno)

| Función | Emite en producción | Emite con DEBUG |
|---------|-------------------|-----------------|
| `log(tag, data)` | ❌ No | ✅ Sí |
| `info(tag, data)` | ✅ Sí | ✅ Sí |
| `error(tag, data)` | ✅ Sí | ✅ Sí |

**Logs operacionales en producción (siempre visibles):**
- `[scheduler] start` / `[scheduler] stop`
- `[expireBonos]` (solo cuando `expired > 0`)
- `[scheduler] expireBonos ejecutado` (cuando expira > 0)
- `[scheduler] error` (cuando falla)

**Logs de debug (solo con `BONOS_DEBUG=true`):**
- `[getDisponibilidad]` — datos detallados de la consulta
- `[calcularNoUtilizada]` — por tipo
- `[cerrarOperacionDiariaInterna]` — totalOperativo, totalRedenciones, cambiara
- `[cerrarOperacionDiariaInterna]` — BONO_DIARIO_NO_ENCONTRADO
- `[bonos.admin-assignment]` — todos los pasos del flujo

---

# 10. Scripts de Diagnóstico

**Ubicación:** `scripts/diagnostics/`  
**Documentación:** `scripts/diagnostics/README.md`

| Script | Propósito |
|--------|-----------|
| `smoke-tests.js` | 25 tests de regresión |
| `validar-scheduler.js` | Scheduler end-to-end |
| `validar-health.js` | Health endpoint + memory |
| `validar-fix.js` | Verificar corrección de capacidad fantasma |
| `validar-invariantes.js` | Verificar invariantes I1-I10 |
| `validar-franja.js` | Validar modalidad para admin |
| `simulacion-cierre.js` | 7 escenarios de disponibilidad |
| `diagnostico-cierre.js` | Timezone, horarios, estado DB |
| `diagnostico-noUtil.js` | Verificar corrupción de noUtilizada |
| `debug-bono-id.js` (1,2,3) | Diagnóstico de IDs y colisiones |
| `check-base-admin.js` | Verificar fórmula base administrativa |

---

# 11. Referencia Rápida de Archivos

| Archivo | LOC | Rol |
|---------|-----|-----|
| `backend/src/modules/bonos/bonos.service.js` | 1043 | Núcleo operacional completo |
| `backend/src/modules/bonos/bonos.admin-assignment.service.js` | 404 | Asignaciones administrativas |
| `backend/src/modules/system/scheduler.js` | 72 | Scheduler de expiración |
| `backend/src/modules/system/system.controller.js` | 129 | Health endpoint + config |
| `backend/src/modules/system/system.routes.js` | 20 | Rutas (incluye `/health`) |
| `backend/src/shared/helpers/logger.helper.js` | 16 | Logger con flag DEBUG |
| `backend/src/shared/helpers/modalidad.helper.js` | — | Helper de modalidad (franjas) |
| `backend/src/shared/helpers/workingDay.helper.js` | — | Días hábiles/festivos |
| `backend/src/config/db.js` | — | Pool PostgreSQL + timezone |

| Documento | Contenido |
|-----------|-----------|
| `specs/architecture/bonos-stable-core.md` | Este documento — referencia oficial |
| `specs/architecture/invariants.md` | Invariantes I1-I10 |
| `specs/architecture/critical-flows.md` | Flujos críticos detallados |
| `specs/architecture/operational-rules.md` | Reglas operativas institucionales |
| `specs/architecture/expireBonos-audit.md` | Auditoría completa de expireBonos |
| `specs/architecture/cierre-operacional-audit.md` | Auditoría del cierre operacional |
| `specs/architecture/cierre-operacional-fix.md` | Corrección de capacidad fantasma |
| `specs/architecture/bounded-contexts.md` | Bounded contexts del sistema |

---

> **Estado final del módulo bonos: OPERACIONALMENTE ESTABLE.**  
> Smoke tests: 25/25 ✅  
> Scheduler: activo, sin memory leaks  
> Health endpoint: funcional  
> Logs: limpios en producción, detallados con `BONOS_DEBUG=true`  
> 
> **Próximo paso:** Integrar asignaciones administrativas a rutas y frontend (sin tocar el core).
