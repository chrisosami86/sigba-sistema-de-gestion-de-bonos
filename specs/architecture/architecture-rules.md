
# SIGBA — Architecture Rules

## Objetivo

Definir reglas arquitectónicas obligatorias para evolución segura de SIGBA.

---

# Filosofía Oficial

La estrategia oficial es:

## mover sin romper comportamiento

Prioridades:

* estabilidad
* claridad
* mantenibilidad
* simplicidad

---

# Restricciones Oficiales

NO implementar:

* microservicios
* CQRS complejo
* event sourcing
* sobreingeniería
* múltiples fuentes de verdad

---

# Backend como Fuente Oficial

El backend es responsable de:

* disponibilidad
* expiraciones
* horarios
* cierres
* concurrencia
* asistencia
* reglas operativas

El frontend nunca debe:

* decidir horarios
* decidir expiraciones
* decidir disponibilidad
* recalcular operación crítica

---

# Ownership Oficial

| Responsabilidad | Módulo dueño      |
| --------------- | ----------------- |
| disponibilidad  | bonos             |
| asistencia      | subsidies + bonos |
| horarios        | system            |
| históricos      | cierres           |
| integraciones   | integrations      |
| estudiantes     | students          |
| autenticación   | auth              |

---

# Restricciones Entre Contextos

## Analytics

Analytics:

* NO modifica operación viva
* NO recalcula reglas oficiales
* consume históricos consolidados

---

## Integrations

Integrations:

* NO contiene lógica institucional
* NO decide reglas de negocio
* solo sincroniza

---

## Students

Students:

* NO contiene disponibilidad
* NO contiene expiraciones
* NO contiene analytics

---

## Bonos

Bonos:

* es núcleo operativo principal
* controla disponibilidad
* controla reservas
* controla expiraciones
* controla concurrencia

---

# Controllers

Los controllers:

* NO deben contener lógica pesada
* NO deben contener queries complejas
* NO deben contener reglas operativas extensas

Los controllers coordinan:

* request
* response
* validación básica
* llamada servicios

---

# Services

Los services:

* contienen lógica operativa
* deben ser pequeños progresivamente
* deben evitar responsabilidades mezcladas

---

# Frontend

El frontend debe usar:

* Angular standalone
* Signals
* containers/components
* services pequeños

NO usar:

* NgRx complejo
* stores globales innecesarios
* lógica operativa crítica en UI

---

# Reactividad Oficial

SIGBA utilizará:

## reactividad híbrida ligera

Combinando:

* polling inteligente
* actualización optimista
* sincronización ligera
* backend como verdad oficial

---

# Filosofía de Refactor

Toda evolución debe:

1. identificar contexto afectado
2. minimizar impacto
3. mantener compatibilidad
4. preservar comportamiento operativo
5. reducir deuda técnica progresivamente

---

# Filosofía de Trabajo con IA

Toda implementación futura debe:

* partir desde specs
* respetar invariantes
* respetar ownership
* evitar lógica cruzada
* preservar reglas institucionales

La IA NO debe:

* reinterpretar reglas operativas
* mover responsabilidades arbitrariamente
* recalcular históricos
* introducir complejidad innecesaria.
