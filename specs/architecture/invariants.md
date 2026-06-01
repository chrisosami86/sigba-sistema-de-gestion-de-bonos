# Invariants

## Invariantes de Dominio

* un estudiante no puede consumir almuerzo y refrigerio el mismo día
* un bono reclamado es terminal
* un bono expirado es terminal
* un bono no utilizado es terminal
* analytics NO modifica operación viva
* cierres congelan históricos
* backend es fuente oficial
* reutilización automática está prohibida
* administrativos NO crean nuevos bonos
* administrativos consumen expirados + no utilizados

## Invariantes de Modalidad Operativa

* toda redención nueva debe persistir `modalidad_operacional` explícito
* `modalidad_operacional` solo acepta: `subsidiado`, `venta_libre`, `administrativo`
* `getModalidadExpression()` prioriza `modalidad_operacional` sobre inferencia por horario
* históricos sin `modalidad_operacional` (NULL) usan fallback legacy por `hora_solicitud::time`
* `administrativo` se reporta temporalmente como `venta_libre` en dashboards legacy

## Invariantes de Zona Horaria

* toda fecha operacional usa `America/Bogota`
* Node.js: `process.env.TZ = 'America/Bogota'` + helper `getBogotaDate()`
* PostgreSQL: `AT TIME ZONE 'America/Bogota'` explícito en queries operacionales
* `toISOString()` solo se usa en logs, debugging y auditoría
* `CURRENT_DATE` no se usa en queries operacionales
* `NOW()` solo se usa en contexto de auditoría (`updated_at`, `last_login`)

## Invariantes de Datos

* snapshots históricos inmutables
* separación operacional/admin: redenciones administrativas excluidas del COUNT operacional
* disponibilidad derivada: `disponibles = totalOperativo - reservasActivas - expiradosPendientes - noUtilizada`
* idempotencia de `expireBonos`: `WHERE estado = 'reservado'` garantiza que la 2ª ejecución afecta 0 filas
* escritura condicional: `calcularNoUtilizada` solo UPDATE si el valor cambió
