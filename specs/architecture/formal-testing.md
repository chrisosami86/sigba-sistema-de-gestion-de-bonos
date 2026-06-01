# SIGBA — Formal Testing

## Objetivo

Definir la estrategia de pruebas oficial para garantizar estabilidad operativa
durante la evolución del sistema.

---

## 1. Smoke Tests Mínimos (Pre-Merge)

Todo cambio que toque el backend debe pasar estos tests:

### Core Bonos (25 tests)
| # | Test | Validación |
|---|------|-----------|
| 1 | `requestBono` almuerzo subsidiado | Redención creada, estado='reservado', modalidad='subsidiado' |
| 2 | `requestBono` almuerzo venta libre | Redención creada, modalidad='venta_libre' |
| 3 | `requestBono` refrigerio subsidiado | Redención creada |
| 4 | `requestBono` refrigerio venta libre | Redención creada |
| 5 | `requestBono` sin disponibilidad | Error 'No hay bonos disponibles' |
| 6 | `requestBono` duplicado mismo día | Error 'ya tiene un bono activo' |
| 7 | `requestBono` día no hábil | Error día no hábil |
| 8 | `requestBono` fuera de horario | Error 'bloqueado' o 'cerrado' |
| 9 | `claimBono` con código válido | Estado → 'reclamado', hora_reclamo poblada |
| 10 | `claimBono` sin código | Error 'Debe ingresar el codigo' |
| 11 | `claimBono` código ya usado | Error (validación en frontend) |
| 12 | `claimBono` redención ya expirada | Error 'ya expiro' |
| 13 | `expireBonos` reservas vencidas | Estado → 'expirado' |
| 14 | `expireBonos` idempotente | 2ª ejecución afecta 0 filas |
| 15 | `expireBonos` calcula noUtilizada | `cantidad_no_utilizada` actualizada post-cierre |
| 16 | `getDisponibilidad` almuerzo | Datos consistentes con DB |
| 17 | `getDisponibilidad` refrigerio | Datos consistentes con DB |
| 18 | `getEstadoSistema` subsidiado activo | Estado='subsidiado' |
| 19 | `getEstadoSistema` venta libre activa | Estado='venta_libre' |
| 20 | `getEstadoSistema` fuera de horario | Estado='bloqueado' o 'cerrado' |
| 21 | `getStudentBonos` | Lista de redenciones del estudiante |
| 22 | `getResumenDiario` | Datos paginados, filtros funcionan |
| 23 | `getStatsDiarias` | Conteos por tipo/estado/modalidad |
| 24 | `getBaseAdministrativa` | expirados + noUtilizados - administrativos |
| 25 | `liberarBonos` legacy | Funciona sin romper disponibilidad |

### Timezone (8 tests)
| # | Test | Validación |
|---|------|-----------|
| 26 | Registro 9:00 AM Colombia | NO expira inmediatamente |
| 27 | Modalidad almuerzo subsidiado | Clasificación correcta por horario |
| 28 | `getBogotaDate()` post 7 PM | Fecha Colombia = fecha actual (no UTC siguiente día) |
| 29 | `CURRENT_DATE` reemplazado | Todas las queries usan `(NOW() AT TIME ZONE 'America/Bogota')::date` |
| 30 | `NOW()` operacional reemplazado | Expiraciones, reclamos, cierres usan `AT TIME ZONE` |
| 31 | Festivos: misma fecha Colombia | `holidays.fecha` comparado con `getBogotaDate()` |
| 32 | Google Sheets: fecha correcta | `toLocaleString('es-CO', { timeZone: 'America/Bogota' })` |
| 33 | Scheduler: ejecuta hora Colombia | `lastCycleAt` refleja Bogotá |

### Modalidad Operativa (6 tests)
| # | Test | Validación |
|---|------|-----------|
| 34 | Subsidiado → `modalidad_operacional='subsidiado'` | Columna poblada en INSERT |
| 35 | Venta libre → `modalidad_operacional='venta_libre'` | Columna poblada en INSERT |
| 36 | Administrativo → `modalidad_operacional='administrativo'` | Columna poblada en INSERT |
| 37 | `getModalidadExpression()` usa columna primero | Nuevas redenciones clasificadas por `modalidad_operacional` |
| 38 | `getModalidadExpression()` fallback legacy | Históricas (NULL) clasificadas por `hora_solicitud::time` |
| 39 | Frontend muestra ambas columnas | Franja + Modalidad en Resumen Diario |

### QR (8 tests)
| # | Test | Validación |
|---|------|-----------|
| 40 | Código generado único por día+tipo | Sin colisiones en rango 1-200 |
| 41 | `getActiveBonus` retorna bono del día | `bd.fecha = (NOW() AT TIME ZONE 'America/Bogota')::date` |
| 42 | `resolveByCode` encuentra bono | JOIN con fecha correcta |
| 43 | QR expirado no aparece | `expiracionAt < new Date()` → null |
| 44 | `claimByQr` reclama correctamente | Flujo completo: resolve → claim → sync |
| 45 | QR sin código asigna nuevo | `generateUniqueCode` poblado |
| 46 | Código duplicado rechazado | `generateUniqueCode` reintenta (50 intentos) |
| 47 | QR inválido → error | 'QR invalido — bono no encontrado para hoy' |

### Provider (8 tests)
| # | Test | Validación |
|---|------|-----------|
| 48 | `getResumenProveedor` almuerzo | Métricas correctas |
| 49 | `getResumenProveedor` refrigerio | Métricas correctas |
| 50 | `registrarConciliacion` CONCILIADO | diferencia=0 → estado correcto |
| 51 | `registrarConciliacion` DIFERENCIA_MENOR | diferencia≤2 → estado correcto |
| 52 | `registrarConciliacion` DIFERENCIA_CRITICA | diferencia>2 → estado correcto |
| 53 | `registrarConciliacion` UPSERT | Mismo día+tipo actualiza en vez de duplicar |
| 54 | `getConciliaciones` paginado | Filtros por fecha, tipo, estado |
| 55 | Export Excel | Archivo generado con datos correctos |

### Cierre Diario (5 tests)
| # | Test | Validación |
|---|------|-----------|
| 56 | `getResumenCierre` datos correctos | Reclamados, expirados, noUtilizados, administrativos |
| 57 | `confirmarCierre` exitoso | Estado → 'CONFIRMADO', confirmado_at poblado |
| 58 | `confirmarCierre` duplicado | Error 'ya fue confirmado' |
| 59 | `ensurePendingConfirmation` automático | Scheduler crea registro PENDIENTE_CONFIRMACION |
| 60 | `getConfirmaciones` paginado | Filtros por fecha, estado |

---

## 2. Pruebas Operacionales por Horario

| Franja | Hora | Test |
|--------|------|------|
| Almuerzo subsidiado | 08:00-10:15 | Reserva permitida solo subsidiados |
| Almuerzo reclamo | 10:15-11:00 | No nuevas reservas, sí reclamos |
| Almuerzo expiración | 11:00 | Reservas no reclamadas → expirado |
| Almuerzo venta libre | 11:30-12:05 | Cualquier estudiante |
| Almuerzo cierre | 12:05 | No utilizados calculados |
| Refrigerio subsidiado | 17:00-18:29 | Reserva permitida solo subsidiados |
| Refrigerio venta libre | 18:30-22:00 | Cualquier estudiante |
| Refrigerio cierre | 22:00 | No utilizados calculados |

---

## 3. Pruebas de Concurrencia

| Escenario | Validación |
|-----------|-----------|
| 2 reservas simultáneas mismo estudiante | Solo 1 éxito (unique_student_bono_diario) |
| 2 reservas sobre último cupo | Solo 1 éxito (FOR UPDATE serializa) |
| Scheduler concurrente | `pg_try_advisory_lock(42)` previene solapamiento |
| `expireBonos` + `requestBono` simultáneos | Sin deadlocks (orden de locks consistente) |

---

## 4. Checklist Pre-Merge

Antes de mergear cualquier cambio:

- [ ] Backend compila sin errores (`node -e "require('./backend/src/app')"`)
- [ ] Frontend compila sin errores (`npx tsc --noEmit` en `frontend/`)
- [ ] Smoke tests core (25 tests) pasan
- [ ] Timezone: `getBogotaDate()` retorna fecha Colombia correcta
- [ ] `CURRENT_DATE` no aparece en queries operacionales
- [ ] `NOW()` solo aparece en contexto de auditoría (`updated_at`, `last_login`)
- [ ] `modalidad_operacional` se persiste en nuevas redenciones
- [ ] `getModalidadExpression()` clasifica correctamente
- [ ] Dashboard legacy (`/admin`) funciona
- [ ] Dashboard V2 (`/admin/institutional`) funciona
- [ ] QR scan funciona
- [ ] No hay regresiones en expiraciones
- [ ] No hay regresiones en disponibilidad

---

## 5. Scripts de Diagnóstico

Ubicación: `backend/scripts/diagnostics/`

| Script | Propósito |
|--------|-----------|
| `smoke-tests.js` | 25 tests de regresión del core |
| `validar-scheduler.js` | Scheduler end-to-end |
| `validar-health.js` | Health endpoint + memory |
| `validar-fix.js` | Verificar corrección capacidad fantasma |
| `validar-invariantes.js` | Verificar invariantes I1-I10 |
| `validar-franja.js` | Validar modalidad para admin |
| `simulacion-cierre.js` | 7 escenarios de disponibilidad |
| `diagnostico-cierre.js` | Timezone, horarios, estado DB |
| `diagnostico-noUtil.js` | Verificar corrupción de noUtilizada |
| `debug-bono-id.js` (1,2,3) | Diagnóstico de IDs y colisiones |
| `check-base-admin.js` | Verificar fórmula base administrativa |
