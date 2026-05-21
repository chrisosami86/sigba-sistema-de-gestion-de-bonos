# SIGBA — Auditoría del Cierre Operacional Diario

> **Fecha:** 2026-05-21 15:05 COT
> **Estado:** COMPLETO — BUG raíz identificado, pendiente corrección

---

## Resumen Ejecutivo

**`cantidad_no_utilizada` NO se está consolidando visualmente en disponibilidad debido a un bug de orden de operaciones en `getDisponibilidad()` y `liberarBonos()`.**

Cuando `expireBonos()` → `calcularNoUtilizada()` → `cerrarOperacionDiariaInterna()` se ejecuta **ANTES** de que `getOrCreateBonoDiario()` cree el registro del día, `calcularNoUtilizada()` no encuentra la fila `bonos_diarios` → omite el UPDATE → `cantidad_no_utilizada` permanece en 0 (DEFAULT) → `calculateDisponibilidad()` muestra **capacidad fantasma**.

**Impacto:** El dashboard muestra 108 disponibles para almuerzo cuando debería mostrar 0.

---

## 1. Horarios Reales Activos

### 1.1 Timezone verificado

| Componente | Configuración | Valor confirmado |
|-----------|--------------|-----------------|
| Node.js `process.env.TZ` | `server.js:2` | `America/Bogota` |
| PostgreSQL connection | `db.js:9` | `America/Bogota` (vía `-c timezone=America/Bogota`) |
| Node.js now | `new Date()` | `2026-05-21T19:58:32.805Z` (UTC) / `14:58:32 GMT-0500` (local) |
| PostgreSQL `NOW()` | Consulta directa | `14:58:32 GMT-0500` |

**Timezones sincronizadas.** No hay drift entre Node y PostgreSQL.

### 1.2 Horarios hardcodeados (`bonos.service.js:7-32`)

| Tipo | Fase | Rango | Expiración subsidio | Cierre total |
|------|------|-------|-------------------|-------------|
| Almuerzo | Subsidio | 08:00–10:15 | **11:00 AM** | — |
| Almuerzo | Venta libre | 11:30–12:05 | — | **12:05 PM** |
| Refrigerio | Subsidio | 17:00–18:29 | **21:30** | — |
| Refrigerio | Venta libre | 18:30–22:00 | — | **22:00** |

### 1.3 getClosingTime() e isPastClosing() (`bonos.service.js:874-887`)

```javascript
const getClosingTime = (tipo) => {
  const closing = new Date();
  closing.setHours(HORARIOS[tipo].ventaLibre.expiracion.hours, ...);
  return closing;
};

const isPastClosing = (tipo) => {
  return new Date() >= getClosingTime(tipo);
};
```

**El cierre total SIEMPRE se basa en `ventaLibre.expiracion`**, no en `subsidiado.expiracion`.

### 1.4 Estado actual (21 mayo 2026, 15:05 COT)

| Tipo | Cierre total | isPastClosing |
|------|-------------|--------------|
| Almuerzo | 12:05 PM | **true** (hace ~3 horas) |
| Refrigerio | 22:00 | **false** (faltan ~7 horas) |

---

## 2. Instrumentación Agregada

### 2.1 Logs en `calcularNoUtilizada()` (`bonos.service.js:931`)

```javascript
console.info("[calcularNoUtilizada]", { tipo, isPastClosing, timestamp });
```

### 2.2 Logs en `cerrarOperacionDiariaInterna()` (`bonos.service.js:938`)

```javascript
console.info("[cerrarOperacionDiariaInterna]", {
  tipo, totalOperativo, totalRedenciones, noUtilizadaCalculada,
  valorPrevioEnDB, cambiara, timestamp
});
```

### 2.3 Logs en `getDisponibilidad()` (`bonos.service.js:214`)

```javascript
console.info("[getDisponibilidad]", {
  tipo, orden: "expireBonos() → getOrCreateBonoDiario() → calculateDisponibilidad()",
  bonoDiarioCreado, noUtilizadaEnDB, disponiblesResultado, timestamp
});
```

### 2.4 Resultado de instrumentación (DB real, almuerzo)

```
[calcularNoUtilizada]        { tipo: 'almuerzo', isPastClosing: true }
[cerrarOperacionDiariaInterna] { tipo: 'almuerzo', error: 'BONO_DIARIO_NO_ENCONTRADO',
                                  mensaje: 'No existe registro en bonos_diarios para hoy' }
[getDisponibilidad]          { orden: 'expireBonos() → getOrCreateBonoDiario() → ...',
                                noUtilizadaEnDB: 0, disponiblesResultado: 108 }
```

**La secuencia de logs confirma el bug:** `calcularNoUtilizada` se ejecuta → el `bonos_diarios` no existe → se omite el UPDATE → luego se crea con `cantidad_no_utilizada = 0` → disponibilidad muestra 108 (fantasma).

---

## 3. Simulación de Cierre Completo

### 3.1 Escenarios simulados (ver `scripts/simulacion-cierre.js`)

| Escenario | totOp | rec | exp | lib | noUtilDB | noUtilCalc | Disponibles |
|-----------|-------|-----|-----|-----|----------|-----------|-------------|
| A: Viva (subsidio) | 150 | 0 | 0 | 0 | 0 | 140 | 140 |
| B: Todo reclamado | 150 | 150 | 0 | 0 | 0 | 0 | **0** |
| C: Con expirados | 150 | 140 | 10 | 0 | 0 | 0 | **0** |
| D: +noUtil correcta | 150 | 120 | 10 | 0 | 20 | 20 | **0** |
| E: +liberados | 150 | 110 | 15 | 10 | 25 | 25 | **10** |
| F: **BUG (DB real)** | 110 | 2 | 0 | 0 | **0** | **108** | **108 ⚠️** |
| G: **F corregido** | 110 | 2 | 0 | 0 | **108** | **108** | **0 ✅** |

### 3.2 DB real — desincronización confirmada

```
ALMUERZO (id=3):
  Redenciones:  0 res | 2 rec | 0 exp = 2 total
  totOp=110   lib=0   noUtilDB=0   noUtilCalc=108
  ⚠️  DESINCRONIZACIÓN: DB=0 vs fórmula=108  (diff=108)
  disponibles real: 108    disponibles esperado: 0

REFRIGERIO (id=4):
  Redenciones:  0 res | 2 rec | 0 exp = 2 total
  totOp=30    lib=1   noUtilDB=2   noUtilCalc=28
  ⚠️  DESINCRONIZACIÓN: DB=2 vs fórmula=28  (diff=26)
  disponibles real: 26     disponibles esperado: 1
```

---

## 4. Validación Matemática de `calculateDisponibilidad()`

### 4.1 Fórmula completa

```javascript
// bonos.service.js:735-787
totalOperativo       = cantidad_base + cantidad_extra                                        // L768
reservasActivas      = COUNT(reservado) + COUNT(reclamado)                                    // L769
expiradosPendientes  = COUNT(expirado) - MIN(cantidad_liberada, COUNT(expirado))              // L764-765
noUtilizada          = cantidad_no_utilizada  (leído de bonos_diarios)                        // L766
disponibles          = totalOperativo - reservasActivas - expiradosPendientes - noUtilizada   // L770
```

### 4.2 Reducción algebraica

**Caso 1: `noUtilizada > 0`** (existen bonos nunca reservados)

```
noUtilizada = totalOperativo - COUNT(todas las redenciones)
            = totalOperativo - (reservados + reclamados + expirados)

disponibles = totalOperativo - (reservados + reclamados) - (expirados - liberados)
              - [totalOperativo - (reservados + reclamados + expirados)]

            = totalOperativo - reservados - reclamados - expirados + liberados
              - totalOperativo + reservados + reclamados + expirados

            = liberados
```

**Caso 2: `noUtilizada == 0`** (todos los bonos fueron reservados)

```
disponibles = totalOperativo - (reservados + reclamados) - (expirados - liberados) - 0
            = totalOperativo - COUNT(all) + liberados
```

### 4.3 Conclusión matemática

```
┌───────────────────────────────────────────────────────────┐
│  Si noUtilizada > 0:  disponibles = cantidad_liberada     │
│  Si noUtilizada = 0:  disponibles = max(0, totOp -        │
│                        countAll + liberados)              │
└───────────────────────────────────────────────────────────┘
```

La fórmula es **correcta** y **consistente**. No hay error en la matemática.

El bug está en que `cantidad_no_utilizada` se lee de `bonos_diarios` y ese valor está **stale** (0 en vez de 108) porque `calcularNoUtilizada()` nunca pudo ejecutar su UPDATE.

---

## 5. Análisis de Doble Retención

### 5.1 Pregunta: ¿`expiradosPendientes` y `noUtilizada` retienen la misma capacidad?

**Respuesta:** No. Aunque `expirados` aparece en AMBOS términos de la resta, el álgebra los cancela exactamente:

```
expiradosPendientes = expirados - liberados        → resta expirados
noUtilizada = totalOperativo - countAll            → countAll incluye expirados
            = totalOperativo - reservados - reclamados - expirados
            → al restar noUtilizada, se SUMA expirados (doble negativo)
```

```
disponibles = ... - (expirados - liberados) - (totalOperativo - ... - expirados)
            = ... - expirados + liberados - totalOperativo + ... + expirados
            = liberados + (... - totalOperativo + ...)
```

Los `-expirados` y `+expirados` se cancelan mutuamente. **No hay doble retención real.**

### 5.2 Pero si `noUtilizada` está desincronizada...

La cancelación algebraica depende de que `noUtilizada` sea exactamente `totalOperativo - countAll`. Si el valor en DB es incorrecto (ej: 0 en vez de 108), la cancelación falla y el resultado es erróneo.

**Por eso el dashboard muestra 108:** porque `noUtilizada = 0` en DB, cuando debería ser `108`.

---

## 6. Causa Raíz

### 6.1 Orden incorrecto en `getDisponibilidad()` y `liberarBonos()`

```javascript
// bonos.service.js:214-224 — getDisponibilidad
const getDisponibilidad = async (tipo) => {
  validateTipo(tipo);
  await expireBonos();                              // 1° Corre ANTES de que exista la fila

  const bonoDiario = await getOrCreateBonoDiario(tipo);  // 2° Crea con noUtilizada=0
  const disponibilidad = await calculateDisponibilidad(bonoDiario.id);  // 3° Lee 0
  ...
};
```

```javascript
// bonos.service.js:502 — liberarBonos
const liberarBonos = async (tipo, cantidad) => {
  ...
  await expireBonos();                              // 1° ANTES
  
  const client = await pool.connect();
  const bonoDiario = await getOrCreateBonoDiario(tipo, client);  // 2° DESPUÉS
  ...
};
```

### 6.2 Secuencia del bug

```
Primera llamada del día a getDisponibilidad('almuerzo'):

┌─────────────────────────────────────────────────────────┐
│ 1. expireBonos()                                        │
│    └→ UPDATE redenciones  (0 rows, nada que expirar)    │
│    └→ calcularNoUtilizada(client)                       │
│       └→ isPastClosing('almuerzo') = true               │
│       └→ cerrarOperacionDiariaInterna('almuerzo', client)│
│          └→ SELECT bonos_diarios WHERE fecha=CURRENT_DATE│
│             → 0 rows (no existe para hoy)               │
│             → RETURN (sin hacer UPDATE)    ◄─── BUG     │
│                                                         │
│ 2. getOrCreateBonoDiario('almuerzo')                    │
│    └→ INSERT bonos_diarios (cantidad_no_utilizada=0)    │
│       → fila creada con DEFAULT 0                       │
│                                                         │
│ 3. calculateDisponibilidad(bonoDiarioId)                │
│    └→ lee bonos_diarios.cantidad_no_utilizada = 0       │
│    └→ disponibles = 110 - 2 - 0 - 0 = 108              │
│       → ¡108 disponibles FANTASMA!                      │
└─────────────────────────────────────────────────────────┘
```

### 6.3 ¿Por qué no se corrige solo?

Porque todas las llamadas subsecuentes a `getDisponibilidad()` repiten el mismo orden:
1. `expireBonos()` → `calcularNoUtilizada()` → `cerrarOperacionDiariaInterna()` → busca bonos_diarios (YA EXISTE esta vez) → calcula noUtilizada = 108 → UPDATE ✅
2. `getOrCreateBonoDiario()` → ya existe, devuelve el existente
3. `calculateDisponibilidad()` → lee noUtilizada = 108 → disponibles = 0 ✅

**PERO**: con el hardening de throttling (30s) aplicado en la sesión anterior, la segunda llamada dentro de los 30s retorna `[]` sin ejecutar. Y si el advisory lock está tomado, también retorna vacío. Esto significa que **el hardening introdujo una ventana donde el bug es más persistente**.

Específicamente: el throttling en `expireBonos()` previene que la SEGUNDA llamada (que SÍ encontraría el bonos_diarios ya creado) ejecute `calcularNoUtilizada()`. Entonces `cantidad_no_utilizada` permanece en 0 hasta que pasen 30s o se libere el advisory lock.

---

## 7. Propuesta de Corrección

### 7.1 Cambio mínimo: invertir orden en `getDisponibilidad()`

```javascript
const getDisponibilidad = async (tipo) => {
  validateTipo(tipo);

  const bonoDiario = await getOrCreateBonoDiario(tipo);   // 1° PRIMERO crear/obtener
  await expireBonos();                                     // 2° DESPUÉS expirar
  const disponibilidad = await calculateDisponibilidad(bonoDiario.id);

  return { tipo, ...disponibilidad };
};
```

**Razonamiento:** Al crear/obtener `bonos_diarios` primero, `calcularNoUtilizada()` siempre encontrará la fila y podrá actualizar `cantidad_no_utilizada` correctamente.

### 7.2 Cambio mínimo: invertir orden en `liberarBonos()`

```javascript
const liberarBonos = async (tipo, cantidad) => {
  validateTipo(tipo);
  const cantidadNumerica = validateCantidad(cantidad);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const bonoDiario = await getOrCreateBonoDiario(tipo, client);  // 1° PRIMERO
    await expireBonos();                                            // 2° DESPUÉS
    ...
```

### 7.3 Todos los call sites afectados

| Función | Orden actual | ¿Afectado? | Acción |
|---------|-------------|-----------|--------|
| `getDisponibilidad` | expireBonos → getOrCreate | **SÍ** | Invertir |
| `liberarBonos` | expireBonos → getOrCreate | **SÍ** | Invertir |
| `getStudentBonos` | expireBonos → SELECT | No (no crea bonos_diarios) | OK |
| `getResumenDiario` | expireBonos → SELECT | No | OK |
| `getStatsDiarias` | expireBonos → SELECT | No | OK |
| `getAnalytics` | expireBonos → SELECT | No | OK |
| `requestBono` | expireBonosInTransaction → getOrCreate (dentro de TX) | No (TX lo protege) | OK |

---

## 8. Diagnósticos Disponibles

| Recurso | Archivo | Función |
|---------|---------|---------|
| Diagnóstico de timezone y cierres | `scripts/diagnostico-cierre.js` | Muestra horas, isPastClosing, estado DB |
| Simulación completa | `scripts/simulacion-cierre.js` | 7 escenarios + prueba real + álgebra |
| Logs en vivo | `bonos.service.js:931,955,224` | `[calcularNoUtilizada]`, `[cerrarOperacionDiariaInterna]`, `[getDisponibilidad]` |

---

## 9. Veredicto Final

| Pregunta | Respuesta |
|----------|-----------|
| ¿Por qué cantidad_no_utilizada no se consolida? | `expireBonos()` corre ANTES de que `getOrCreateBonoDiario()` cree la fila del día → `calcularNoUtilizada()` no encuentra la fila → omite UPDATE |
| ¿La fórmula de disponibilidad es correcta? | Sí. Matemáticamente demostrada. `disponibles = liberados` cuando `noUtilizada > 0`. |
| ¿Existe doble retención? | No. Aunque `expirados` aparece en dos términos, se cancelan algebraicamente. |
| ¿Qué causa el número fantasma? | `cantidad_no_utilizada = 0` (stale) → `disponibles = totOp - reservasActivas = 108` en vez de `0`. |
| ¿El hardening empeoró la situación? | Parcialmente. El throttling de 30s retrasa la auto-corrección que ocurría en la 2ª llamada. |
| ¿Corrección necesaria? | Invertir orden en `getDisponibilidad()` y `liberarBonos()`: crear/obtener `bonos_diarios` PRIMERO, luego `expireBonos()`. |

---

> **Próximo paso:** Aplicar corrección de orden en `getDisponibilidad()` y `liberarBonos()`, luego re-ejecutar simulación para confirmar.
