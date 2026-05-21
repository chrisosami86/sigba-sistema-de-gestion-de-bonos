# SIGBA — Corrección del Cierre Operacional: Reporte Final

> **Fecha:** 2026-05-21 15:31 COT
> **Estado:** COMPLETO — Bug corregido, validado, 25/25 smoke tests OK

---

## Resumen de Correcciones Aplicadas

Se aplicaron **3 cambios quirúrgicos** en `backend/src/modules/bonos/bonos.service.js`:

### Cambio 1: Orden en `getDisponibilidad()` (línea 214)

```diff
- await expireBonos();
- const bonoDiario = await getOrCreateBonoDiario(tipo);
+ const bonoDiario = await getOrCreateBonoDiario(tipo);
+ await expireBonos();
```

### Cambio 2: Orden en `liberarBonos()` (línea 502)

```diff
- await expireBonos();
- const client = await pool.connect();
+ await getOrCreateBonoDiario(tipo);
+ await expireBonos();
+ const client = await pool.connect();
```

### Cambio 3: `SELECT *` → `SELECT bd.*` en 2 funciones (líneas 957, 907)

```diff
- SELECT * FROM bonos_diarios bd JOIN config_bonos cb ...
+ SELECT bd.* FROM bonos_diarios bd JOIN config_bonos cb ...
```

**Funciones corregidas:** `cerrarOperacionDiariaInterna`, `cerrarOperacionDiaria`

---

## Bug Raíz: Colisión de columnas `id` en JOIN

| Query | `row.id` devuelto | ID real `bd.id` | Consecuencia |
|-------|------------------|-----------------|-------------|
| `SELECT * FROM bonos_diarios bd JOIN config_bonos cb` | `cb.id` (1 para almuerzo) | `bd.id` (3) | COUNT, UPDATE operaban sobre la fila equivocada |

El driver `pg` de Node.js colapsa columnas con el mismo nombre — `row.id` tomaba el valor de `config_bonos.id` en vez de `bonos_diarios.id`. Esto causaba que `calcularNoUtilizada`:

1. Encontraba el `bonos_diarios` correcto (por `WHERE bd.fecha = CURRENT_DATE`)
2. Pero usaba `cb.id` para el COUNT de redenciones → 0 (porque las redenciones estaban en `bd.id`)
3. Calculaba `noUtilizada = totalOperativo - 0 = totalOperativo` (110 en vez de 108)
4. Ejecutaba `UPDATE bonos_diarios WHERE id = cb.id` (actualizaba la fila equivocada)

---

## Evidencia de Corrección

### Antes del fix

```
cerrarOperacionDiariaInterna: bonoDiarioId=1  totalRedenciones=0  cambiara=true
getDisponibilidad:           disponibles=108  noUtilizada=0        ← CAPACIDAD FANTASMA
```

### Después del fix

```
cerrarOperacionDiariaInterna: bonoDiarioId=3  totalRedenciones=2  cambiara=false (ya actualizado)
getDisponibilidad:           disponibles=0    noUtilizada=108      ← CORRECTO
```

### Verificación en DB real

| Tipo | totOp | Redenciones | noUtil Antes | noUtil Ahora | Disp Antes | Disp Ahora |
|------|-------|-------------|-------------|-------------|-----------|-----------|
| Almuerzo | 110 | 2 | **0** (stale) | **108** ✅ | **108** (fantasma) | **0** ✅ |
| Refrigerio | 30 | 2 | 2 (pre-cierre) | 2 | 26 | 26 |

---

## Smoke Tests: 25/25 ✅

| Categoría | Tests | Resultado |
|-----------|-------|-----------|
| Exports | 15 funciones | ✅ Todos |
| Lectura | getDisponibilidad ×2, getEstadoSistema ×2, getStudentBonos, getResumenDiario, getStatsDiarias, getBaseAdministrativa | ✅ 8/8 |
| Escritura | expireBonos, getDisponibilidad post-expire | ✅ 2/2 |
| **Total** | | **25/25 ✅** |

Sin deadlocks, sin dobles updates, sin errores de sintaxis.

---

## Evaluación del Throttling (30s)

| Escenario | Comportamiento | Veredicto |
|-----------|---------------|-----------|
| Primera llamada del día | getOrCreateBonoDiario crea fila → expireBonos no throttled → actualiza noUtilizada | ✅ Correcto |
| Segunda llamada < 30s | expireBonos throttled → retorna [] → calculateDisponibilidad lee valor ya correcto de DB | ✅ Correcto |
| Llamada post-carga-extra < 30s | noUtilizada no se recalcula inmediatamente → se recalcula en la siguiente llamada > 30s | ⚠️ Ventana de 30s con valor stale |
| 7 endpoints simultáneos | Solo el primero ejecuta expireBonos → los otros 6 son throttled | ✅ Protección anti-stampede |

**Conclusión:** El throttling de 30s **es seguro y debe mantenerse**. La única ventana de riesgo (carga extra entre llamadas throttled) es un edge case que se auto-corrige en ≤ 30s. No requiere ajustes.

---

## Scripts de Diagnóstico Disponibles

| Script | Función |
|--------|---------|
| `scripts/diagnostico-cierre.js` | Timezone, horarios, estado DB |
| `scripts/simulacion-cierre.js` | 7 escenarios + álgebra simbólica |
| `scripts/validar-fix.js` | Validación read-only del fix |
| `scripts/smoke-tests.js` | 25 smoke tests automatizados |
| `scripts/debug-bono-id.js` | Diagnóstico de IDs (histórico) |
| `scripts/debug-bono-id3.js` | Diagnóstico de colisión de columnas |

---

## Documentación Relacionada

| Documento | Contenido |
|-----------|-----------|
| `specs/architecture/expireBonos-audit.md` | Auditoría de expireBonos + endurecimiento |
| `specs/architecture/cierre-operacional-audit.md` | Auditoría del cierre operacional (bug de orden + álgebra) |
| `specs/architecture/cierre-operacional-fix.md` | Este documento — corrección y validación |

---

## Próximos Pasos

1. ~~Corregir orden en getDisponibilidad y liberarBonos~~ ✅
2. ~~Corregir colisión de columnas SELECT * en JOIN~~ ✅
3. ~~Validar con DB real~~ ✅
4. ~~Smoke tests~~ ✅
5. **Pendiente:** Implementar scheduler automático (cada 60s) — ahora que expireBonos es estable
6. **Pendiente:** Simular post-cierre refrigerio (cuando sea horario real)
