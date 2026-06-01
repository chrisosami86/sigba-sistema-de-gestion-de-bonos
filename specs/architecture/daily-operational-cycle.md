# SIGBA — Ciclo Operacional Diario

> Documenta la secuencia completa de operaciones de un día hábil en SIGBA.
> Todas las horas están en America/Bogota (UTC-5).

---

## Resumen Visual

```
07:00 ─────────────────────────────────────────────────────────── 22:00
│                                                                   │
├─ 08:00 → 10:15  ALMUERZO SUBSIDIADO                               │
│   (reservas solo para estudiantes subsidiados)                     │
│                                                                   │
├─ 10:15 → 11:00  RECLAMO ALMUERZO SUBSIDIADO                       │
│   (solo reclamar, no nuevas reservas)                              │
│                                                                   │
├─ 11:00           EXPIRACIÓN RESERVAS SUBSIDIO ALMUERZO             │
│   (reservado → expirado)                                           │
│                                                                   │
├─ 11:30 → 12:05  VENTA LIBRE ALMUERZO                              │
│   (cualquier estudiante, incluyendo subsidiados)                   │
│                                                                   │
├─ 12:05           CIERRE ALMUERZO                                   │
│   (expiración venta libre + cálculo no_utilizada)                  │
│                                                                   │
├─ 12:06 → 17:00  FRANJA INACTIVA ALMUERZO                           │
│                                                                   │
├─ 17:00 → 18:29  REFRIGERIO SUBSIDIADO                             │
│                                                                   │
├─ 18:29           EXPIRACIÓN RESERVAS SUBSIDIO REFRIGERIO           │
│                                                                   │
├─ 18:30 → 22:00  VENTA LIBRE REFRIGERIO                            │
│                                                                   │
├─ 22:00           CIERRE REFRIGERIO                                 │
│   (expiración venta libre + cálculo no_utilizada)                  │
│                                                                   │
└─ 22:01 → 07:00  SIN OPERACIÓN                                     │
```

---

## 1. Inicio del Día

**Disparador:** Automático. La primera operación del día crea el registro `bonos_diarios`.

**Proceso:**
1. `getOrCreateBonoDiario(tipo)` verifica si existe fila para hoy
2. Si no existe: `INSERT INTO bonos_diarios (config_bono_id, fecha, cantidad_base)`
3. `fecha` se calcula con `(NOW() AT TIME ZONE 'America/Bogota')::date`
4. `cantidad_base` se toma de `config_bonos` (almuerzo=110, refrigerio=30)

**Garantías:**
- `ON CONFLICT (config_bono_id, fecha) DO NOTHING` previene duplicados
- `FOR UPDATE` serializa el acceso concurrente

---

## 2. Subsidio (Reserva)

**Horario almuerzo:** 08:00 → 10:15
**Horario refrigerio:** 17:00 → 18:29

**Proceso `requestBono()`:**
1. Validar día hábil (`isWorkingDay`)
2. Validar estado del sistema (`getEstadoSistema`)
3. BEGIN TRANSACTION
4. `expireBonosInTransaction(client)` — expirar reservas vencidas
5. `getOrCreateBonoDiario(tipo, client)` — FOR UPDATE
6. Si estado === 'subsidiado': `validateSubsidio(client, studentId)`
7. `studentAlreadyHasBono(client, studentId)` — no duplicados
8. `calculateDisponibilidad(bonoDiario.id, client)` — hay cupo?
9. INSERT redenciones: `estado='reservado'`, `modalidad_operacional='subsidiado'`, `hora_solicitud` = Bogotá timestamp
10. COMMIT

**Resultado:**
- Redención creada con `estado = 'reservado'`
- `modalidad_operacional = 'subsidiado'`
- `expiracion_at` calculado según horario
- Disponibilidad descontada

---

## 3. Reclamo

**Proceso `claimBono()`:**
1. Validar código de bono (entero positivo)
2. BEGIN TRANSACTION
3. `SELECT ... FOR UPDATE` sobre la redención
4. Si `estado != 'reservado'` → error
5. Si `expiracion_at < NOW() AT TIME ZONE 'America/Bogota'` → expirar, error
6. UPDATE: `estado='reclamado'`, `hora_reclamo` = Bogotá timestamp
7. COMMIT
8. Sincronizar Google Sheets (post-commit)

**Asistencia subsidiada:**
- Cuenta si el reclamo ocurrió en franja subsidiada
- NO cuenta si ocurrió en venta libre

---

## 4. Venta Libre

**Horario almuerzo:** 11:30 → 12:05
**Horario refrigerio:** 18:30 → 22:00

**Proceso:** Igual que el subsidio, pero:
- `validateSubsidio` NO se ejecuta
- `modalidad_operacional = 'venta_libre'`
- NO genera asistencia subsidiada (incluso para estudiantes subsidiados)

---

## 5. Expiración

**Disparador:** Scheduler (cada 60s) o llamado desde endpoints de lectura (throttle 30s)

**Proceso `expireBonos()`:**
1. Throttle check: < 30s desde última ejecución → skip
2. `pg_try_advisory_lock(42)` — previene ejecución concurrente
3. BEGIN TRANSACTION
4. `UPDATE redenciones SET estado='expirado' WHERE estado='reservado' AND expiracion_at < (NOW() AT TIME ZONE 'America/Bogota')`
5. `calcularNoUtilizada(client)` — si `isPastClosing(tipo)`, consolida
6. COMMIT

**Efecto:**
- `reservado` → `expirado` (terminal)
- Inasistencia subsidiada registrada
- Base administrativa se incrementa (expirados disponibles para asignación)

---

## 6. No Utilizados

**Disparador:** `calcularNoUtilizada()` dentro de `expireBonos()`, cuando `isPastClosing(tipo) = true`

**Fórmula:**
```
noUtilizada = MAX(0, totalOperativo - totalRedenciones)
donde:
  totalOperativo = cantidad_base + cantidad_extra
  totalRedenciones = COUNT(redenciones WHERE tipo_asignacion != 'ADMINISTRATIVA')
```

**Horas de cierre:**
- Almuerzo: ≥ 12:05
- Refrigerio: ≥ 22:00

**Escritura condicional:** Solo UPDATE si `valorPrevio !== noUtilizada`

---

## 7. Asignación Administrativa

**Disparador:** Admin manual (no automático)

**Proceso `asignarAdministrativamente()`:**
1. Validar día hábil
2. BEGIN TRANSACTION
3. `getLockedBonoDiario(tipo)` — FOR UPDATE
4. `getActiveStudentForAssignment(studentId)` — FOR UPDATE
5. `studentAlreadyConsumedToday` — no duplicados
6. `calculateBaseAdministrativa`:
   ```
   base = expirados + noUtilizados - administrativos_ya_realizados
   ```
7. Si `disponible <= 0` → error
8. INSERT redenciones: `estado='reclamado'`, `tipo_asignacion='ADMINISTRATIVA'`, `modalidad_operacional='administrativo'`
9. COMMIT

**Reglas:**
- NO crea nuevos bonos — consume del pool expirados + no utilizados
- NO afecta disponibilidad operativa
- NO depende de horarios de franja
- `modalidad_operacional = 'administrativo'`

---

## 8. Conciliación Proveedor

**Proceso `registrarConciliacion()`:**
1. Obtener `totalEntregado` = reclamados + administrativos del día
2. `diferencia = totalEntregado - cantidadProveedor`
3. Determinar estado: CONCILIADO (0), DIFERENCIA_MENOR (≤2), DIFERENCIA_CRITICA (>2)
4. UPSERT en `conciliaciones_proveedor`

---

## 9. Cierre Operacional

**Pre-cierre (automático):**
- `calcularNoUtilizada()` dentro de `expireBonos()`
- Consolida `cantidad_no_utilizada` en `bonos_diarios`
- Se ejecuta cuando `isPastClosing(tipo)` = true

**Confirmación (manual):**
- `POST /api/system/daily-closure/confirmar`
- Admin revisa resumen y confirma
- `daily_closure_confirmations.estado = 'CONFIRMADO'`
- `confirmado_at` = timestamp Bogotá

---

## 10. Inicio Siguiente Día

**Disparador:** Automático con la primera operación del nuevo día.

**Proceso:**
1. `getOrCreateBonoDiario()` detecta que no existe fila para la nueva fecha
2. Crea nuevo `bonos_diarios` con `cantidad_base` fresca
3. `cantidad_extra = 0` (no persiste entre días)
4. El scheduler continúa ejecutándose normalmente

---

## Invariantes del Ciclo

1. Un estudiante no puede consumir almuerzo y refrigerio el mismo día
2. `reclamado`, `expirado`, `no_utilizado` son estados terminales
3. `modalidad_operacional` clasifica cada redención como: `subsidiado`, `venta_libre`, o `administrativo`
4. Backend es la única fuente de verdad para horarios y disponibilidad
5. Analytics NO modifica operación viva
6. Zona horaria: `America/Bogota` en Node.js y PostgreSQL
