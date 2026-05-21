# SIGBA — Operational Rules

## Objetivo

Definir oficialmente las reglas operativas centrales de SIGBA para:

* estabilizar comportamiento institucional
* evitar regresiones durante refactors
* facilitar trabajo seguro con IA
* mantener trazabilidad operativa
* congelar reglas críticas del dominio

SIGBA modela:

* asistencia institucional
* subsidios reales
* disponibilidad operativa
* disciplina operativa
* cierres históricos
* obligaciones con proveedor

Las reglas institucionales tienen prioridad sobre decisiones técnicas.

---

# Filosofía Operativa

SIGBA NO es únicamente un sistema de reservas.

SIGBA representa:

* operación institucional diaria
* control operativo de bonos
* disciplina de asistencia
* trazabilidad histórica
* control de desperdicio operativo
* control contractual con proveedor

La prioridad es:

* consistencia
* auditabilidad
* simplicidad operativa
* estabilidad institucional

---

# Tipos Oficiales de Bono

SIGBA únicamente maneja:

* ALMUERZO
* REFRIGERIO

No existen otros tipos de bono.

---

# Franjas Operativas

## Almuerzo Subsidio

Horario:

08:00 AM → 10:15 AM

Durante esta franja:

* solo estudiantes subsidiados pueden reservar
* el estudiante debe tener subsidio válido para ese día
* el estudiante puede reservar únicamente un bono

---

## Reclamo Almuerzo Subsidio

Horario:

10:15 AM → 11:00 AM

Durante esta franja:

* ya no se permiten nuevas reservas subsidiadas
* los estudiantes con reserva pueden reclamar
* después de las 11:00 AM los reservados no reclamados expiran

---

## Venta Libre Almuerzo

Horario:

11:30 AM → 12:05 PM

Durante esta franja:

* cualquier estudiante puede reservar
* incluidos subsidiados
* si el estudiante subsidiado reclama aquí:

  * NO cuenta asistencia subsidiada
  * pero sí puede consumir bono

Al finalizar:

* reservas no reclamadas → EXPIRADO
* bonos nunca reservados → NO_UTILIZADO

---

## Franja Inactiva Almuerzo

12:06 PM → 05:00 PM

Durante esta franja:

* no se permiten reservas
* no se permiten reclamos
* no existe operación viva de almuerzo

---

## Refrigerio Subsidio

Horario:

05:00 PM → 06:29 PM

Reglas iguales al subsidio almuerzo.

---

## Venta Libre Refrigerio

Horario:

06:30 PM → 10:00 PM

Reglas iguales a venta libre almuerzo.

Al finalizar:

* reservas no reclamadas → EXPIRADO
* bonos nunca reservados → NO_UTILIZADO

---

# Estados Oficiales

## DISPONIBLE

Representa:

* capacidad operativa restante
* bonos aún reservables

DISPONIBLE sí existe operativamente y se mantiene en base de datos.

---

## RESERVADO

Representa:

* bono tomado por estudiante
* pendiente de reclamación

El estudiante:

* ya consumió disponibilidad
* aún no recibe bono físico

---

## RECLAMADO

Representa:

* bono entregado físicamente
* operación completada

Es estado terminal.

No puede modificarse posteriormente.

---

## EXPIRADO

Representa:

* estudiante reservó
* NO reclamó dentro del horario permitido

EXPIRADO:

* sí representa inasistencia subsidiada
* sí afecta disciplina operativa
* sí participa en base administrativa
* sí queda congelado históricamente

Es estado terminal.

---

## NO_UTILIZADO

Representa:

* bono jamás reservado
* capacidad operativa desperdiciada

NO_UTILIZADO:

* NO pertenece a estudiante
* NO representa inasistencia
* sí representa desperdicio operativo
* sí participa en base administrativa
* sí queda congelado históricamente

Es estado terminal.

---

# Asignación Administrativa

La asignación administrativa:

* NO es un tipo de bono
* NO es una franja operativa
* NO reabre disponibilidad
* NO reutiliza automáticamente

Es:

* excepcional
* manual
* presencial
* administrativa
* auditada

---

## Reglas

La asignación administrativa:

* se realiza presencialmente
* entrega bono físico inmediatamente
* queda registrada como:

  * estado = RECLAMADO
  * tipo_asignacion = ADMINISTRATIVA

No existe:

* administrativo reservado
* administrativo pendiente
* administrativo no usado

---

## Base Administrativa

La capacidad administrativa del día es:

base_administrativa = expirados + no_utilizados

Si:

base_administrativa = 0

Entonces:

NO pueden realizarse asignaciones administrativas.

---

# Reutilización

La reutilización automática queda oficialmente eliminada.

NO existe:

* liberación automática
* reapertura automática
* devolución a disponibilidad
* reciclaje automático de bonos

La reutilización ahora se reemplaza completamente por:

## asignación administrativa manual

---

# Asistencia Subsididada

## Reglas Oficiales

La asistencia subsidiada:

* SOLO aplica a estudiantes subsidiados
* SOLO cuenta cuando el estudiante reclama
* SOLO cuenta en franjas subsidiadas

---

## Casos

### Reclama subsidio almuerzo

→ cuenta asistencia

### Reclama subsidio refrigerio

→ cuenta asistencia

### Reserva pero NO reclama

→ cuenta inasistencia

### Reclama en venta libre

→ NO cuenta asistencia

### No realiza ninuna acción y es dia de subsidio

→ cuenta inasistencia

---

# Filosofía de Disciplina Operativa

SIGBA modela disciplina institucional.

Si un estudiante:

* reserva
* y NO reclama

Entonces:

* genera EXPIRADO
* genera inasistencia

Aunque posteriormente:

* reclame en venta libre
* consuma bono

La inasistencia subsidiada permanece.

---

# Disponibilidad Oficial

La disponibilidad operativa se comporta así:

Disponibles = base + carga_extra

Cuando un estudiante reserva:

Disponibles - 1

Posteriormente:

* RESERVADO → RECLAMADO
* o
* RESERVADO → EXPIRADO

Pero ambos ya consumieron disponibilidad.

---

# Carga Extra

La carga extra:

* aumenta capacidad del día actual
* NO modifica la base histórica
* NO persiste para días futuros

Al iniciar un nuevo día:

carga_extra = 0

---

# Pendientes Proveedor

## Filosofía

El proveedor tiene compromisos institucionales.

SIGBA debe permitir calcular:

* bonos efectivamente consumidos
* bonos pendientes por entregar
* diferencias operativas

---

# Fórmula Oficial

pendiente_proveedor =
(base + carga_extra)

* reclamados
* asignacion_administrativa

---

# Cierres Operativos

## Filosofía

Los cierres representan:

* verdad histórica congelada
* consolidación oficial del día
* separación entre operación viva e históricos

Una vez cerrado:

* NO recalcular
* NO reabrir
* NO modificar históricos

---

# Estrategia de Cierre

SIGBA utilizará:

## pre-cierre automático + confirmación administrativa

---

# Pre-cierre

El pre-cierre:

* congela operación viva
* calcula históricos
* consolida métricas
* bloquea nuevas reservas

---

# Confirmación Administrativa

El administrador:

* revisa resumen operativo
* valida resultados
* confirma cierre

El nuevo día puede iniciar automáticamente SIN esperar confirmación.

---

# Información Auditada

El cierre debe guardar:

* fecha
* base almuerzo
* base refrigerio
* carga extra
* reclamados
* expirados
* no utilizados
* administrativos
* pendientes proveedor
* porcentaje inasistencia
* estudiantes ausentes

---

# Concurrencia

SIGBA debe garantizar:

* no sobreasignación
* una sola reserva válida por estudiante
* consistencia transaccional
* protección race condition
* manejar concurrencia de multiples solicitudes, con colapsar

---

# Reglas de Reserva

## Una reserva diaria

Un estudiante únicamente puede consumir:

* almuerzo
* o refrigerio

Pero nunca ambos el mismo día.

---

## Doble reserva simultánea

NO debe permitirse:

* mismo estudiante
* múltiples estudiantes sobre último bono

El backend es responsable de garantizarlo.

---

# Backend como Fuente de Verdad

El backend decide oficialmente:

* horarios
* expiraciones
* disponibilidad
* asistencia
* cierres
* estados operativos

El frontend:

* NO decide reglas operativas
* NO calcula expiraciones oficiales
* NO controla disponibilidad real

---

# Timezone Oficial

Timezone institucional:

## Colombia

---

# Día Operativo

El día operativo:

* inicia automáticamente alrededor de 07:00 AM
* reinicia operación viva
* mantiene cierres anteriores pendientes de confirmación si es necesario

El día operativo termina:

* después de cierre refrigerio
* aproximadamente 10:00 PM

---

# Invariantes Oficiales

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

---
