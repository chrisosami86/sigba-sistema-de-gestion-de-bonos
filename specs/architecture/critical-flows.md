
# SIGBA — Critical Flows

## Objetivo

Definir los flujos críticos operativos de SIGBA.

Estos flujos representan:

* comportamiento oficial
* contratos operativos
* secuencia válida de operación

---

# Flujo: Reservar Bono Subsidio

## Entrada

* estudiante autenticado
* horario subsidiado activo
* subsidio válido para el día
* disponibilidad existente

---

## Validaciones

* estudiante activo
* periodo válido
* día subsidiado válido
* no tener consumo previo en el día
* disponibilidad > 0
* no duplicidad

---

## Resultado

* crear redención
* estado = RESERVADO
* modalidad_operacional = 'subsidiado'
* hora_solicitud = timestamp America/Bogota
* descontar disponibilidad
* asignar expiracion_at

---

# Flujo: Reclamar Bono

## Entrada

* reserva válida
* dentro del horario permitido

---

## Resultado

* estado → RECLAMADO
* registrar hora_reclamo
* asistencia subsidiada válida si aplica

---

# Flujo: Expiración

## Disparador

Horario oficial alcanzado.

---

## Resultado

* RESERVADO → EXPIRADO
* marcar inasistencia subsidiada
* congelar pérdida operativa

---

# Flujo: Venta Libre

## Entrada

* franja venta libre activa
* disponibilidad restante

---

## Particularidades

* subsidiados pueden participar
* NO genera asistencia subsidiada
* modalidad_operacional = 'venta_libre'
* hora_solicitud = timestamp America/Bogota

---

# Flujo: Generación NO_UTILIZADO

## Disparador

Fin de franja operativa.

---

## Resultado

* calcular bonos nunca reservados
* registrar cantidad_no_utilizada
* consolidar desperdicio operativo

---

# Flujo: Asignación Administrativa

## Entrada

* estudiante presencial
* justificación administrativa
* base_administrativa > 0

---

## Resultado

* crear redención
* estado = RECLAMADO
* tipo_asignacion = ADMINISTRATIVA
* modalidad_operacional = 'administrativo'
* hora_reclamo = timestamp America/Bogota
* consumir base administrativa

---

# Flujo: Pre-cierre

## Disparador

Fin operativo del día.

---

## Resultado

* bloquear reservas
* consolidar métricas
* calcular pendientes proveedor
* congelar operación viva

---

# Flujo: Confirmación de Cierre

## Entrada

* administrador revisa resumen

---

## Resultado

* confirmar históricos
* marcar cierre definitivo
* mantener auditoría

---