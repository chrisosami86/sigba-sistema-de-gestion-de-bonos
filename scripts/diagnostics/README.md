# SIGBA — Scripts de Diagnóstico

## Uso

Ejecutar desde la raíz del proyecto:

```bash
node scripts/diagnostics/<script>.js
```

Requerimientos: DB PostgreSQL corriendo (via docker-compose o local).

## Índice de scripts

| Script | Cuándo usar | Qué valida |
|--------|------------|------------|
| `diagnostico-cierre.js` | Verificar timezone, horarios, estado DB | Sincronización Node↔PG, isPastClosing, bonos_diarios |
| `simulacion-cierre.js` | Validar fórmulas sin tocar DB | 7 escenarios de calculateDisponibilidad, álgebra de doble retención |
| `validar-fix.js` | Verificar corrección de orden getDisponibilidad | noUtilizada consolidada, disponibles=0 |
| `smoke-tests.js` | Regresión general | 25 tests: exports, lectura, escritura, expireBonos |
| `debug-bono-id.js` | Diagnosticar colisión de IDs en JOIN | Muestra IDs reales de bonos_diarios y redenciones |
| `debug-bono-id2.js` | Verificar todas las filas de un config_bono_id | Duplicados, fechas, updated_at |
| `debug-bono-id3.js` | Comparar consultas dentro/fuera de transacción | CURRENT_DATE, COUNT consistencia |
| `diagnostico-noUtil.js` | Verificar corrupción de noUtilizada por admin | COUNT con/sin admin, snapshot inmutable |
| `validar-franja.js` | Validar fix de modalidad para admin | Franja en DB real + 5 simulaciones |
| `validar-invariantes.js` | Post-fix de invariantes | noUtilizada inmutable, base administrativa |
| `validar-scheduler.js` | Validar scheduler end-to-end | 4 ciclos, concurrencia, smoke tests |
| `check-base-admin.js` | Verificar fórmula base administrativa | expirados + noUtilizados - administrativos |
| `validar-health.js` | Validar health endpoint | scheduler status, DB, uptime, memory |

## Modo DEBUG

Para ver logs detallados durante diagnóstico:

```bash
# Windows PowerShell
$env:BONOS_DEBUG="true"; node scripts/diagnostics/smoke-tests.js

# Linux/Mac
BONOS_DEBUG=true node scripts/diagnostics/smoke-tests.js
```

## NO modificar

Estos scripts son de solo lectura. No modifican la base de datos.
La excepción es `validar-fix.js` que llama a `getDisponibilidad()` — esto
puede disparar `expireBonos()` y `calcularNoUtilizada()` (efectos colaterales esperados).
