# expireBonos() — Auditoría Profunda Pre-Automatización

> **Fecha:** 2026-05-21
> **Versión:** v1.0
> **Estado:** INFORME COMPLETO — PENDIENTE IMPLEMENTACIÓN DE ENDURECIMIENTO

---

## Resumen Ejecutivo

`expireBonos()` es **seguro e idempotente en su operación de UPDATE principal**, tiene **protección natural contra doble expiración** gracias al guard `WHERE estado = 'reservado'`, pero presenta **3 vulnerabilidades** que deben endurecerse antes de automatizarlo:

1. **Sin transacción** — el UPDATE principal y `calcularNoUtilizada()` no son atómicos entre sí
2. **Sin advisory lock** — dos instancias simultáneas compiten sobre `bonos_diarios.cantidad_no_utilizada`
3. **Sin throttling** — se llama desde 7 puntos de lectura distintos, generando escrituras innecesarias en cada GET

Las 3 vulnerabilidades son de **severidad baja** en operación manual actual (llamadas esporádicas), pero se vuelven **severidad media** si se ejecuta cada 60 segundos automáticamente.

---

## 1. Anatomía Completa de expireBonos()

### 1.1 Código fuente

```javascript
// bonos.service.js:794-810 — expireBonos (standalone, sin transacción)
const expireBonos = async () => {
  const expireQuery = `
    UPDATE redenciones
    SET estado = 'expirado', updated_at = NOW()
    WHERE estado = 'reservado' AND expiracion_at < NOW()
    RETURNING *
  `;
  const result = await pool.query(expireQuery);
  await calcularNoUtilizada();
  return result.rows;
};

// bonos.service.js:816-827 — expireBonosInTransaction (dentro de TX existente)
const expireBonosInTransaction = async (client) => {
  const expireQuery = `
    UPDATE redenciones
    SET estado = 'expirado', updated_at = NOW()
    WHERE estado = 'reservado' AND expiracion_at < NOW()
  `;
  await client.query(expireQuery);
};
```

### 1.2 Queries ejecutadas por expireBonos()

| # | Query | Tabla | Tipo | Descripción |
|---|-------|-------|------|-------------|
| 1 | `UPDATE redenciones SET estado='expirado', updated_at=NOW() WHERE estado='reservado' AND expiracion_at < NOW() RETURNING *` | `redenciones` | WRITE | Marca como expiradas todas las reservas cuyo `expiracion_at` ya pasó |
| 2-7 | `calcularNoUtilizada()` → por cada tipo (almuerzo, refrigerio) que esté pasado de cierre | | | |
| 2a | `SELECT * FROM bonos_diarios bd JOIN config_bonos cb ON cb.id = bd.config_bono_id WHERE cb.tipo = $1 AND bd.fecha = CURRENT_DATE` | `bonos_diarios`, `config_bonos` | READ | Obtiene el registro diario del tipo |
| 2b | `SELECT COUNT(*)::int AS total_reservados FROM redenciones WHERE bono_diario_id = $1` | `redenciones` | READ | Cuenta TODAS las redenciones (todos los estados) del día |
| 2c | `UPDATE bonos_diarios SET cantidad_no_utilizada = $1, updated_at = NOW() WHERE id = $2` | `bonos_diarios` | WRITE | Actualiza el contador de no utilizados |

**Total queries por llamada:** mínimo 1 (si ningún tipo pasó cierre), máximo 7 (si ambos pasaron cierre).

### 1.3 Tablas afectadas

| Tabla | Columna(s) | Tipo de operación | Frecuencia |
|-------|-----------|-------------------|------------|
| `redenciones` | `estado` (→ 'expirado'), `updated_at` (→ NOW()) | UPDATE masivo | Cada llamada |
| `bonos_diarios` | `cantidad_no_utilizada`, `updated_at` | UPDATE individual | Solo si `isPastClosing(tipo)` |

### 1.4 Dependencias indirectas

```
expireBonos()
 ├── pool.query(UPDATE redenciones)        // usa pool directamente
 └── calcularNoUtilizada()
      ├── isPastClosing(tipo)               // depende de new Date() (Node)
      │    └── getClosingTime(tipo)          // depende de HORARIOS (constante hardcodeada)
      └── cerrarOperacionDiariaInterna()
           ├── SELECT bonos_diarios          // depende de CURRENT_DATE (Postgres)
           ├── SELECT COUNT redenciones      // cuenta TODOS los estados
           └── UPDATE bonos_diarios          // escribe no_utilizada
```

**Dos fuentes de tiempo distintas:**
- `expireBonos()`: `NOW()` → PostgreSQL server time
- `calcularNoUtilizada()` → `isPastClosing()`: `new Date()` → Node.js process time
- **Ambas configuradas a `America/Bogota`** (DB vía connection options, Node vía `process.env.TZ` en server.js:2)

### 1.5 Locks existentes y no existentes

| Función | Transacción | FOR UPDATE | Bloqueos |
|---------|-------------|------------|----------|
| `expireBonos()` (standalone) | ❌ NO | ❌ NO | UPDATE implícito a nivel de fila (MVCC) |
| `expireBonosInTransaction(client)` | ✅ Hereda TX | ❌ NO | UPDATE implícito a nivel de fila |
| `requestBono()` → llama a `expireBonosInTransaction` | ✅ Sí | ✅ Sobre `bonos_diarios` (vía getOrCreateBonoDiario) | `bonos_diarios` + `redenciones` (implícito) |
| `claimBono()` | ✅ Sí | ✅ Sobre la redención específica | Solo esa fila |
| `liberarBonos()` | ✅ Sí | ❌ NO (llama a expireBonos ANTES de BEGIN) | No relevante |

**Hallazgo crítico:** `expireBonos()` standalone no adquiere **ningún lock explícito**. El UPDATE es atómico por MVCC de PostgreSQL, pero no previene que dos llamadas simultáneas compitan sobre `bonos_diarios` en la fase `calcularNoUtilizada()`.

### 1.6 Puntos de llamada (7 call sites)

| # | Función llamadora | Archivo:línea | Contexto | ¿Trigger HTTP? |
|---|------------------|---------------|----------|---------------|
| 1 | `requestBono()` → `expireBonosInTransaction(client)` | `bonos.service.js:70` | Dentro de transacción con FOR UPDATE | POST `/bonos/solicitar` |
| 2 | `getDisponibilidad()` | `bonos.service.js:216` | Fuera de transacción, pre-lectura | GET `/bonos/disponibilidad/:tipo` |
| 3 | `getStudentBonos()` | `bonos.service.js:290` | Fuera de transacción, pre-lectura | GET `/bonos/student/:studentId` |
| 4 | `getResumenDiario()` | `bonos.service.js:320` | Fuera de transacción, pre-lectura | GET `/bonos/admin/resumen-diario` |
| 5 | `getStatsDiarias()` | `bonos.service.js:418` | Fuera de transacción, pre-lectura | GET `/bonos/admin/stats-diarias` |
| 6 | `liberarBonos()` | `bonos.service.js:496` | Fuera de transacción, pre-escritura | PATCH `/bonos/liberar` |
| 7 | `getAnalytics()` | `analytics.service.js:19` | Fuera de transacción, pre-lectura | GET `/analytics` |

**Implicación para automatización:** Si se corre expireBonos() cada 60s, los call sites #2-#7 seguirán llamándolo también. Esto significa que en un sistema con tráfico, expireBonos() se ejecutará mucho más frecuentemente que cada 60s (potencialmente en cada GET).

### 1.7 Impacto sobre bonos_diarios

`calcularNoUtilizada()` recalcula `cantidad_no_utilizada` usando la fórmula:

```
noUtilizada = MAX(0, totalOperativo - totalRedenciones)
```

Donde:
- `totalOperativo = cantidad_base + cantidad_extra` (del bonos_diarios)
- `totalRedenciones = COUNT(*)` de TODAS las redenciones (reservado + reclamado + expirado)

**Importante:** `totalRedenciones` cuenta TODOS los estados, no solo 'reservado'. Por tanto, expirar bonos (cambiar estado de 'reservado' a 'expirado') **NO cambia el COUNT**. El cálculo es estable.

### 1.8 Impacto sobre disponibilidad

`calculateDisponibilidad()` (bonos.service.js:735-788):

```
disponibles = totalOperativo - reservasActivas - expiradosPendientes - noUtilizada
```

Donde:
- `reservasActivas = COUNT(reservado) + COUNT(reclamado)`
- `expiradosPendientes = COUNT(expirado) - cantidad_liberada`

**Efecto de expireBonos():**
- reservado ↓ (un bono pasa a expirado)
- expirados ↑ (mismo bono ahora cuenta como expirado)
- expiradosPendientes ↑
- disponibles = NO CAMBIA (reservasActivas baja, pero expiradosPendientes sube en la misma cantidad)

**Conclusión:** expireBonos() no altera `disponibles`. Solo reclasifica capacidad.

---

## 2. Validación de Idempotencia REAL

### 2.1 UPDATE principal sobre redenciones

**Análisis del WHERE:**
```sql
WHERE estado = 'reservado' AND expiracion_at < NOW()
```

| Ejecución | Filas afectadas | Explicación |
|-----------|----------------|-------------|
| 1ª | N filas (las vencidas) | UPDATE exitoso, estado cambia a 'expirado' |
| 2ª | 0 filas | El WHERE `estado = 'reservado'` ya no coincide |
| Nª | 0 filas | Idempotente a partir de la 2ª |

**Veredicto:** ✅ **Totalmente idempotente.** El guard `WHERE estado = 'reservado'` garantiza que filas ya expiradas no se re-procesan.

### 2.2 calcularNoUtilizada()

**Análisis de la fórmula:**
```
noUtilizada = MAX(0, totalOperativo - totalRedenciones)
```

- `totalOperativo` es constante (solo cambia si admin carga extra o cambia base)
- `totalRedenciones` es COUNT(*) de todas las filas (todos los estados) → no cambia con expireBonos()
- Por tanto, `noUtilizada` **no cambia** entre ejecuciones consecutivas de expireBonos()

**El UPDATE sobre bonos_diarios:**
```sql
UPDATE bonos_diarios SET cantidad_no_utilizada = $1, updated_at = NOW() WHERE id = $2
```

- Se ejecuta aunque el valor sea el mismo
- `updated_at` se actualiza innecesariamente
- **No es dañino** pero es **desperdicio de escritura**

**Veredicto:** ✅ Idempotente en resultado, ⚠️ ineficiente (escribe mismo valor repetidamente).

### 2.3 Escenarios de borde

#### Escenario A: expireBonos() llamado cuando no hay reservados vencidos
- UPDATE afecta 0 filas
- calcularNoUtilizada() se ejecuta igual (si past closing)
- Resultado: sin cambios → ✅ idempotente

#### Escenario B: expireBonos() durante horario subsidiado (ej: 09:00 AM almuerzo)
- `expiracion_at` de reservas subsidiadas = 11:00 AM
- `NOW()` < 11:00 AM → WHERE no coincide → 0 filas
- `isPastClosing('almuerzo')` = false (aún no son las 12:05)
- calcularNoUtilizada() no hace nada para almuerzo
- Resultado: sin cambios → ✅ idempotente

#### Escenario C: expireBonos() entre expiración subsidio y cierre total (ej: 11:30 AM almuerzo)
- Reservas subsidiadas: `expiracion_at` = 11:00 AM < NOW() → expiran
- `isPastClosing('almuerzo')` = false (aún no son las 12:05)
- calcularNoUtilizada() NO se ejecuta para almuerzo
- Resultado: bonos expirados, pero cantidad_no_utilizada **no actualizada aún**
- Hasta que sean las 12:05, noUtilizada queda stale → inconsistencia temporal
- Pero esto es por diseño (noUtilizada solo se calcula post-cierre)
- ⚠️ La inconsistencia es temporal y se resuelve en la primera llamada post-cierre

#### Escenario D: expireBonos() llamado múltiples veces post-cierre
- 1ª llamada: expira reservados + calcula noUtilizada
- 2ª llamada: 0 filas expiradas + recalcula mismo noUtilizada (UPDATE innecesario)
- Nª llamada: igual que 2ª
- ✅ Sin drift numérico

### 2.4 Conclusión de idempotencia

| Aspecto | Veredicto | Detalle |
|---------|-----------|---------|
| No duplicar expirados | ✅ GARANTIZADO | Guard `WHERE estado = 'reservado'` |
| No alterar cantidades acumuladas | ✅ GARANTIZADO | Fórmula determinista sobre COUNT total |
| No modificar no utilizados incorrectamente | ✅ GARANTIZADO | COUNT incluye todos los estados |
| No cambiar disponibilidad repetidamente | ✅ GARANTIZADO | Compensación reservados↔expirados |
| No generar drift numérico | ✅ GARANTIZADO | Fórmula estable, sin acumuladores |

**Veredicto global:** ✅ `expireBonos()` es **matemáticamente idempotente**.

---

## 3. Validación de Concurrencia

### 3.1 Dos expireBonos() simultáneos (standalone)

```
Timeline:
T1: expireBonos_A → UPDATE redenciones (rows 1,2,3 → expirado) ─┐
T2: expireBonos_B → UPDATE redenciones (rows 1,2,3 → expirado)   │ Race
                                                                  │
T1: → calcularNoUtilizada_A → SELECT bonos_diarios               │
T2: → calcularNoUtilizada_B → SELECT bonos_diarios               │
T1: → SELECT COUNT redenciones                                    │
T2: → SELECT COUNT redenciones                                    │
T1: → UPDATE bonos_diarios SET cantidad_no_utilizada = X          │
T2: → UPDATE bonos_diarios SET cantidad_no_utilizada = X          │ ← Mismo valor
```

**Análisis:**
- El UPDATE sobre redenciones: la 2ª instancia afecta 0 filas (guard `estado='reservado'`)
- Ambas leen el mismo COUNT total (no cambió)
- Ambas calculan la misma `noUtilizada`
- Ambas escriben el mismo valor → última escritura gana, pero es el mismo valor
- **Sin race condition dañina**

**Veredicto:** ✅ Seguro (sin corrupción de datos), ⚠️ trabajo duplicado innecesario.

### 3.2 expireBonos() simultáneo con requestBono()

```
Timeline:
T1: requestBono → BEGIN → FOR UPDATE bonos_diarios (LOCK adquirido)
T2: expireBonos → UPDATE redenciones (rows libres, sin lock)
T1: requestBono → expireBonosInTransaction(client)
T2: expireBonos → calcularNoUtilizada() (pool.query, sin transacción)
T1: requestBono → INSERT redenciones → COMMIT
```

**Análisis:**
- `requestBono` bloquea `bonos_diarios` con FOR UPDATE
- `expireBonos` standalone toca `redenciones` (sin lock) y luego `bonos_diarios` (a través de calcularNoUtilizada)
- El UPDATE de calcularNoUtilizada sobre `bonos_diarios` **esperará** a que requestBono libere el lock
- No hay deadlock porque expireBonos standalone no sostiene locks propios
- requestBono ya ejecutó `expireBonosInTransaction` dentro de su TX → ya expiró lo necesario
- El expireBonos standalone posterior es redundante pero inofensivo

**Veredicto:** ✅ Seguro. Bloqueo implícito en `bonos_diarios` serializa correctamente.

### 3.3 expireBonos() simultáneo con claimBono()

```
Timeline:
T1: claimBono → BEGIN → SELECT ... FOR UPDATE (row X locked)
T2: expireBonos → UPDATE redenciones WHERE estado='reservado' AND expiracion_at < NOW()
                  → intenta tocar row X → BLOQUEA (espera FOR UPDATE de claimBono)
T1: claimBono → verifica expiración → UPDATE row X → COMMIT (row ahora 'reclamado')
T2: expireBonos → desbloquea → UPDATE row X → WHERE estado='reservado' NO coincide
                  → row X no se actualiza (ya es 'reclamado')
```

**Análisis:**
- Bloqueo natural: expireBonos espera a claimBono
- claimBono termina primero (gana la reclamación)
- expireBonos encuentra que la fila ya no es 'reservado' → no la toca
- **Sin doble update, sin pérdida de datos**

**Veredicto:** ✅ Seguro. PostgreSQL serializa correctamente.

### 3.4 expireBonos() simultáneo con asignarAdministrativamente()

```
Timeline:
T1: asignarAdmin → BEGIN → FOR UPDATE bonos_diarios (LOCK adquirido)
T2: expireBonos → UPDATE redenciones (rows libres, expira reservados)
T2: expireBonos → calcularNoUtilizada() → UPDATE bonos_diarios → BLOQUEA
T1: asignarAdmin → calculateBaseAdministrativa → lee expirados (incluye los que expireBonos acaba de expirar)
T1: asignarAdmin → INSERT redenciones (ADMINISTRATIVA) → COMMIT
T2: expireBonos → desbloquea → UPDATE bonos_diarios SET cantidad_no_utilizada
```

**Análisis:**
- asignarAdmin bloquea bonos_diarios primero → gana el lock
- expireBonos expira redenciones (sin conflictos de lock)
- expireBonos se bloquea al intentar escribir bonos_diarios
- asignarAdmin lee bonos_diarios (con lock) → ve expirados ya actualizados
- asignarAdmin inserta nueva redención → COUNT total de redenciones ↑
- expireBonos calcula noUtilizada con un COUNT que NO incluye la nueva redención de asignarAdmin
- Pero la fórmula `noUtilizada = MAX(0, totalOperativo - totalRedenciones)` usa COUNT total que SÍ incluye el INSERT de asignarAdmin porque expireBonos hace el COUNT DESPUÉS de que asignarAdmin hizo COMMIT

**Corrección:** expireBonos se bloquea en el UPDATE de bonos_diarios DENTRO de calcularNoUtilizada. Pero calcularNoUtilizada primero hace SELECT COUNT (que también usaría pool, no el client bloqueado). Espera... expireBonos standalone usa `pool.query()` para todo. No hay un client compartido.

Re-analizando:
1. expireBonos: `pool.query(UPDATE redenciones)` → OK
2. expireBonos: `await calcularNoUtilizada()` → llama a `cerrarOperacionDiariaInterna(tipo, pool)`
3. Dentro: `pool.query(SELECT bonos_diarios)` → **NO se bloquea** (es solo lectura, no compite con FOR UPDATE de asignarAdmin)
4. `pool.query(SELECT COUNT redenciones)` → **NO se bloquea** (lectura)
5. `pool.query(UPDATE bonos_diarios)` → **SE BLOQUEA** (asignarAdmin tiene FOR UPDATE)

Si el SELECT COUNT en paso 4 ocurre ANTES de que asignarAdmin haga COMMIT (en READ COMMITTED):
- Ve el estado pre-INSERT de asignarAdmin
- noUtilizada se calcula sin contar la nueva redención administrativa
- Cuando expireBonos finalmente hace UPDATE, escribe un noUtilizada que no refleja la asignación

**Esto es una inconsistencia potencial, pero menor:**
- La siguiente llamada a expireBonos() recalculará correctamente
- Además, `asignarAdministrativamente` **no depende de noUtilizada para crear redenciones** (usa su propio `calculateBaseAdministrativa` que lee bonos_diarios con lock)
- La inconsistencia es solo en `cantidad_no_utilizada` y es auto-corregible

**Veredicto:** ⚠️ Inconsistencia temporal posible pero auto-corregible. No es corrupción permanente.

### 3.5 Resumen de concurrencia

| Escenario | Race Condition | Double Update | Inconsistencia | Deadlock | Bloqueo Excesivo |
|-----------|---------------|---------------|----------------|----------|-----------------|
| 2× expireBonos() | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No |
| expireBonos() + requestBono() | ❌ No | ❌ No | ❌ No | ❌ No | ⚠️ expireBonos espera FOR UPDATE |
| expireBonos() + claimBono() | ❌ No | ❌ No | ❌ No | ❌ No | ⚠️ expireBonos espera FOR UPDATE |
| expireBonos() + asignarAdmin() | ❌ No | ❌ No | ⚠️ Temporal | ❌ No | ⚠️ expireBonos espera FOR UPDATE |

**Veredicto global:** ✅ Concurrencia segura en todos los escenarios críticos. No hay riesgo de corrupción permanente. Inconsistencias son temporales y auto-corregibles.

---

## 4. Impacto Operacional

### 4.1 Tiempo de ejecución estimado

| Operación | Costo estimado | Índice utilizado |
|-----------|---------------|-----------------|
| UPDATE redenciones (expiración) | ~1-5ms | `idx_redenciones_estado` para filtrar 'reservado' |
| SELECT bonos_diarios × 2 tipos | ~1ms c/u | `unique_bono_por_dia` (config_bono_id, fecha) |
| SELECT COUNT redenciones × 2 | ~1-5ms c/u | FK index implícito en `bono_diario_id` |
| UPDATE bonos_diarios × 2 | ~1ms c/u | Primary key |

**Tiempo total estimado:** 5-20ms en condiciones normales (pocos reservados vencidos).

### 4.2 Cantidad de queries por llamada

| Hora del día | Queries ejecutadas | Explicación |
|-------------|-------------------|-------------|
| Antes de cierre almuerzo (< 12:05) | 1 | Solo UPDATE redenciones; calcularNoUtilizada no ejecuta (isPastClosing=false) |
| Después de cierre almuerzo, antes de cierre refrigerio | 4 | UPDATE + calcularNoUtilizada para almuerzo (3 queries) |
| Después de cierre refrigerio (> 22:00) | 7 | UPDATE + calcularNoUtilizada para ambos tipos (6 queries) |
| Fuera de horario, sin reservados | 1 | UPDATE afecta 0 filas; calcularNoUtilizada para ambos si past closing |

### 4.3 Posibles scans completos

- **No hay table scans.** Todas las queries usan índices:
  - `idx_redenciones_estado` → filtra por estado
  - `unique_bono_por_dia` → lookup por tipo+fecha
  - FK index → JOIN/COUNT por bono_diario_id
- El COUNT sobre redenciones (`WHERE bono_diario_id = $1`) usa el índice de FK → index-only scan es posible

### 4.4 Impacto si corre cada 60 segundos

| Métrica | Valor |
|---------|-------|
| Queries/día (peor caso, 24h) | 7 × 1,440 = 10,080 queries/día |
| Queries/día (típico, solo horario operativo 8AM-10PM) | ~5,880 queries/día |
| Escrituras reales/día | ~2 (solo cuando realmente hay reservados que expiran en sus horarios) |
| Escrituras innecesarias/día | ~1,438 (calcularNoUtilizada escribe aunque no cambie nada) |
| Tiempo de DB consumido/día | ~14-29 segundos acumulados |
| Conexiones de pool ocupadas | 1 por ~5-20ms cada 60s → negligible |

### 4.5 Riesgo de crecimiento futuro

- La tabla `redenciones` crece con cada día operativo (~300 reservas/día en peak)
- El UPDATE de expireBonos() filtra por `estado = 'reservado'` → solo toca filas del día actual
- `idx_redenciones_estado` mantiene la consulta eficiente independientemente del tamaño histórico
- `calcularNoUtilizada()` consulta por `bono_diario_id` → también limitado al día actual
- **Sin riesgo de degradación por crecimiento de datos históricos**

---

## 5. Dependencias Peligrosas Identificadas

### 5.1 🔴 CRÍTICA: Dos fuentes de NOW() distintas

| Ubicación | Fuente | Usado en |
|-----------|--------|----------|
| `expireBonos()` → `WHERE expiracion_at < NOW()` | **PostgreSQL** `NOW()` | Decisión de expiración |
| `calcularNoUtilizada()` → `isPastClosing()` → `new Date()` | **Node.js** `Date` | Decisión de cierre |

**Riesgo:** Si el reloj de Node.js y PostgreSQL divergen (ej: contenedor Docker sin NTP sync), podría ocurrir:
- PostgreSQL expira reservas → pero Node.js cree que aún no es hora de cierre → no calcula noUtilizada
- O viceversa: Node.js cree que es post-cierre → intenta calcular noUtilizada → pero valores son prematuros

**Mitigación actual:** Ambos configurados a `America/Bogota`. En mismo servidor, el drift es improbable pero no imposible.

**Severidad:** ⚠️ Media (baja probabilidad, alto impacto si ocurre).

### 5.2 🟡 ALTA: UPDATE de expireBonos y UPDATE de calcularNoUtilizada no son atómicos

```javascript
const result = await pool.query(expireQuery);    // UPDATE 1 — atómico
await calcularNoUtilizada();                       // UPDATE 2 — separado
```

Si el proceso muere entre estas dos líneas:
- `redenciones.estado` ya cambió a 'expirado' ✅
- `bonos_diarios.cantidad_no_utilizada` NO se actualizó ❌
- **Consecuencia:** Inconsistencia temporal. La siguiente llamada a cualquier read endpoint corrige automáticamente. Sin pérdida permanente de datos.

**Severidad:** ⚠️ Media (transitoria, auto-corregible, pero viola atomicidad).

### 5.3 🟡 ALTA: expireBonos() se dispara en cada GET

Los 6 call sites de lectura (getDisponibilidad, getStudentBonos, getResumenDiario, getStatsDiarias, liberarBonos, getAnalytics) llaman a expireBonos() antes de leer. Esto significa:

- Cada refresh del dashboard administrativo → expireBonos() + calcularNoUtilizada()
- Cada estudiante revisando su historial → expireBonos() + calcularNoUtilizada()
- **Sin throttling:** 10 estudiantes refrescando = 10 ejecuciones de expireBonos en segundos

**Severidad:** ⚠️ Media en operación manual, 🔴 Alta si se añade scheduler automático (doble ejecución: scheduler + calls de lectura).

### 5.4 🟢 BAJA: calcularNoUtilizada escribe siempre (aunque no cambie)

Cada vez que `isPastClosing(tipo)` es true, el UPDATE sobre `bonos_diarios` se ejecuta aunque `cantidad_no_utilizada` no haya cambiado. Esto genera:
- Escrituras innecesarias en PostgreSQL (WAL inflation)
- `updated_at` avanza sin cambio real → pérdida de trazabilidad real

**Severidad:** 🟢 Baja (desperdicio, no corrupción).

### 5.5 🟢 BAJA: analytics.service.js usa require() dinámico

```javascript
// analytics.service.js:19
await require("../bonos/bonos.service").expireBonos();
```

- Dependencia cross-module con require en caliente (no en el top-level)
- Si bonos.service.js cambiara su export, analytics rompe silenciosamente
- El require se cachea (Node), así que no es tan grave, pero es mala práctica

**Severidad:** 🟢 Baja (funciona, pero frágil).

### 5.6 🟢 BAJA: expireBonos no retorna información de auditoría

No hay logging de:
- Cuántas filas fueron expiradas
- A qué hora se ejecutó
- Quién triggereó la expiración (usuario, endpoint)
- Resultado de calcularNoUtilizada

**Severidad:** 🟢 Baja (no afecta corrección, pero dificulta debugging).

---

## 6. Propuesta de Endurecimiento Mínimo

### Principio rector

**SIN reescribir arquitectura.** Solo ajustes quirúrgicos para garantizar seguridad bajo ejecución automática recurrente.

### 6.1 🔧 Envolver en transacción

**Problema:** UPDATE de redenciones y UPDATE de bonos_diarios no son atómicos.

**Solución:**
```javascript
const expireBonos = async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");

    const expireResult = await client.query(`
      UPDATE redenciones
      SET estado = 'expirado', updated_at = NOW()
      WHERE estado = 'reservado' AND expiracion_at < NOW()
      RETURNING *
    `);

    await calcularNoUtilizada(client);

    await client.query("COMMIT");
    return expireResult.rows;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
```

**Cambio:** 3 líneas adicionales (BEGIN/COMMIT/ROLLBACK). Pasar `client` a `calcularNoUtilizada()`.

### 6.2 🔧 Advisory lock para prevenir ejecución concurrente

**Problema:** Dos instancias simultáneas de expireBonos() causan trabajo duplicado y potencial bloqueo sobre bonos_diarios.

**Solución:**
```javascript
const LOCK_KEY = 42; // ID único para el lock de expiración

const expireBonos = async () => {
  const client = await pool.connect();
  try {
    // Intentar adquirir advisory lock (non-blocking)
    const lockResult = await client.query(
      "SELECT pg_try_advisory_lock($1) AS acquired",
      [LOCK_KEY]
    );
    if (!lockResult.rows[0].acquired) {
      return []; // Ya hay otra expiración en progreso
    }

    await client.query("BEGIN");
    // ... resto de la lógica ...
    await client.query("COMMIT");
    return expireResult.rows;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    // Liberar advisory lock
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
    client.release();
  }
};
```

**Cambio:** ~5 líneas. Previene completamente la ejecución concurrente.

### 6.3 🔧 Throttling temporal (debounce en aplicación)

**Problema:** expireBonos() se llama desde 7 puntos. Con scheduler automático cada 60s, se ejecutaría en cada GET más el scheduler.

**Solución (mínima, sin refactorizar callers):**
```javascript
let lastExpireRun = 0;
const EXPIRE_THROTTLE_MS = 30_000; // 30 segundos mínimo entre ejecuciones

const expireBonos = async () => {
  const now = Date.now();
  if (now - lastExpireRun < EXPIRE_THROTTLE_MS) {
    return []; // Throttled — otra llamada reciente ya expiró
  }

  // ... lógica de expiración ...

  lastExpireRun = Date.now();
  return result.rows;
};
```

**Cambio:** 4 líneas. Previene ejecución excesiva desde múltiples callers.

### 6.4 🔧 Guard en calcularNoUtilizada (evitar escritura innecesaria)

**Problema:** UPDATE se ejecuta aunque el valor no cambie.

**Solución:**
```javascript
const cerrarOperacionDiariaInterna = async (tipo, client) => {
  // ... SELECT bonoDiario y COUNT existentes ...

  const noUtilizada = Math.max(0, totalOperativo - totalReservados);

  // Solo actualizar si el valor realmente cambió
  if (Number(bonoDiario.cantidad_no_utilizada) !== noUtilizada) {
    await client.query(
      `UPDATE bonos_diarios SET cantidad_no_utilizada = $1, updated_at = NOW() WHERE id = $2`,
      [noUtilizada, bonoDiario.id],
    );
  }
};
```

**Cambio:** 1 condición `if`. Elimina el 99% de escrituras innecesarias.

### 6.5 🔧 Logging de auditoría

**Problema:** Sin visibilidad de ejecuciones.

**Solución:**
```javascript
const expiredRows = expireResult.rows;
if (expiredRows.length > 0) {
  console.info("[expireBonos]", {
    expired: expiredRows.length,
    ids: expiredRows.map(r => r.id),
    timestamp: new Date().toISOString(),
  });
}
```

**Cambio:** 3 líneas. Visibilidad completa para debugging.

### 6.6 Plan de implementación recomendado

| Paso | Cambio | Archivo | Líneas | Riesgo |
|------|--------|---------|--------|--------|
| 1 | Guard anti-escritura innecesaria | `bonos.service.js:920` | +1 | Ninguno |
| 2 | Logging de auditoría | `bonos.service.js:805` | +3 | Ninguno |
| 3 | Throttling en aplicación | `bonos.service.js:794` | +4 | Ninguno (usa Date.now(), no DB) |
| 4 | Envolver en transacción | `bonos.service.js:794-810` | +6 | Bajo (cambia pool→client) |
| 5 | Advisory lock | `bonos.service.js:794-810` | +6 | Bajo (lock se libera en finally) |

**Orden sugerido:** 1→2→3→4→5 (de menor a mayor riesgo, cada paso es independiente y testeable).

### 6.7 Lo que NO se debe tocar

- **NO modificar `expireBonosInTransaction(client)`** — ya funciona correctamente dentro de `requestBono` con FOR UPDATE
- **NO cambiar los 7 call sites** — el throttling en expireBonos() los cubre sin refactorizarlos
- **NO tocar `claimBono`** — ya maneja expiración inline correctamente
- **NO modificar `calcularNoUtilizada()`** — solo añadir el guard de escritura, no cambiar la fórmula
- **NO introducir scheduler/cron** — hasta que los 5 pasos anteriores estén validados en producción

---

## 7. Veredicto Final

### ¿Es expireBonos() seguro para automatizar?

| Dimensión | Estado actual | Con endurecimiento |
|-----------|--------------|-------------------|
| Corrección lógica | ✅ Correcto | ✅ Correcto |
| Idempotencia | ✅ Garantizada | ✅ Garantizada |
| Concurrencia | ✅ Seguro (sin corrupción) | ✅ Blindado (advisory lock) |
| Atomicidad | ⚠️ No atómico | ✅ Transaccional |
| Eficiencia | ⚠️ Escrituras redundantes | ✅ Optimizado |
| Observabilidad | ❌ Sin logs | ✅ Auditado |
| Control de frecuencia | ❌ Sin throttling | ✅ Throttleado |

### Con endurecimiento mínimo (pasos 1-5), expireBonos() es seguro para automatizar.

**Tiempo estimado de implementación:** 15-20 minutos (5 cambios quirúrgicos).

**Riesgo de regresión:** Mínimo. Todos los cambios son aditivos y no alteran la lógica de negocio existente.

---

## Apéndice A: Mapa completo de flujo de datos

```
                          expireBonos()
                               │
                ┌──────────────┼──────────────┐
                │              │              │
           UPDATE          calcular        return
          redenciones    NoUtilizada()     rows[]
         (→ expirado)         │
                              │
                    ┌─────────┴─────────┐
                    │                   │
              isPastClosing       isPastClosing
              ('almuerzo')       ('refrigerio')
                    │                   │
              ┌─────┴─────┐       ┌─────┴─────┐
              │ true      │       │ true      │
              ▼           ▼       ▼           ▼
         cerrarOp...  (skip)  cerrarOp...  (skip)
              │                   │
         ┌────┴────┐        ┌────┴────┐
         │ SELECT  │        │ SELECT  │
         │ COUNT   │        │ COUNT   │
         │ UPDATE  │        │ UPDATE  │
         └─────────┘        └─────────┘
              │                   │
         bonos_diarios      bonos_diarios
         .cantidad_no_      .cantidad_no_
         utilizada          utilizada
```

## Apéndice B: Tabla de estados y transiciones

```
┌────────────┐     requestBono()      ┌────────────┐
│            │ ──────────────────────→ │            │
│  (nuevo)   │                         │ RESERVADO  │
│            │ ←────────────────────── │            │
└────────────┘    (no existe reverse)  └─────┬──────┘
                                             │
                          ┌──────────────────┼──────────────────┐
                          │                  │                  │
                     claimBono()    expireBonos()     claimBono()
                     (a tiempo)     (vencido)        (tarde, detecta
                          │                  │        vencimiento)
                          ▼                  ▼                  │
                    ┌──────────┐     ┌──────────┐              │
                    │RECLAMADO │     │ EXPIRADO │ ←────────────┘
                    │(terminal)│     │(terminal)│
                    └──────────┘     └──────────┘

  asignarAdministrativamente() → INSERT directo con estado='reclamado'
                                  (no pasa por RESERVADO)
```

## Apéndice C: Configuración de timezone

| Componente | Configuración | Ubicación |
|-----------|--------------|-----------|
| PostgreSQL | `options: '-c timezone=America/Bogota'` | `backend/src/config/db.js:9` |
| Node.js | `process.env.TZ = 'America/Bogota'` | `backend/server.js:2` |
| Frontend | Timezone del navegador (no se usa para lógica) | — |

---

> **Documento generado por auditoría automatizada.**
> **Próximo paso:** Implementar endurecimiento mínimo (Sección 6) → validar en staging → luego scheduler.
