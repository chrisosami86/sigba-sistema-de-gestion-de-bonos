# SIGBA — Bounded Contexts

## Objetivo

Definir oficialmente los bounded contexts funcionales de SIGBA para:

* separar responsabilidades
* reducir lógica cruzada
* mejorar mantenibilidad
* estabilizar arquitectura
* facilitar trabajo futuro con IA
* permitir evolución progresiva del sistema

Los bounded contexts representan:

* dominios funcionales reales
* límites de responsabilidad
* separación operativa
* agrupaciones lógicas del negocio

NO representan:

* microservicios
* procesos separados
* despliegues independientes
* arquitecturas distribuidas

SIGBA continuará siendo:

## un monolito modular.

---

# Filosofía de los Bounded Contexts

Cada contexto debe:

* tener responsabilidades claras
* evitar lógica mezclada
* evitar dependencias innecesarias
* exponer interfaces simples
* mantener trazabilidad del dominio

Las reglas institucionales tienen prioridad sobre la perfección arquitectónica.

---

# Bounded Context: Auth

## Responsabilidad

Gestionar autenticación y sesiones.

---

## Incluye

* login
* JWT
* guards
* recuperación contraseña
* cambio contraseña
* expiración token
* validación sesión
* middleware auth
* roles
* refresh estado sesión

---

## NO debe contener

* lógica de bonos
* analytics
* estudiantes
* subsidios
* reglas operativas

---

## Backend esperado

```txt
modules/auth/
```

---

## Frontend esperado

```txt
app/auth/
```

---

# Bounded Context: Students

## Responsabilidad

Gestionar estudiantes institucionales.

---

## Incluye

* CRUD estudiantes
* importaciones Excel
* periodos académicos
* activación/inactivación
* programas académicos
* datos básicos estudiante
* estado matrícula

---

## Relación con otros contextos

Usado por:

* Subsidies
* Bonos
* Analytics
* Reutilización

---

## Restricción importante

Students NO debe contener:

* lógica de reclamación
* expiraciones
* analytics
* dashboards

---

# Bounded Context: Subsidies

## Responsabilidad

Gestionar reglas de subsidio institucional.

---

## Incluye

* días subsidiados
* beca
* elegibilidad
* validación subsidio
* asistencia subsidiada
* reglas disciplinarias futuras

---

## Importante

Este contexto representa:

## reglas institucionales de beneficio.

NO representa:

* disponibilidad operativa
* reclamación
* inventario de bonos

---

## Relación crítica

Subsidies define:

* cuándo un estudiante tiene derecho
* qué días aplican
* qué horarios son válidos

Pero:
Bonos decide:

* si existe disponibilidad real
* si puede reservar
* si puede reclamar

---

# Bounded Context: Bonos

## Responsabilidad

Gestionar toda la operación diaria de bonos.

---

## Este es el núcleo operativo principal de SIGBA.

---

## Incluye

* disponibilidad
* reservas
* reclamaciones
* expiraciones
* no utilizados
* carga extra
* validaciones operativas
* horarios
* concurrencia
* cupos diarios
* resumen diario
* estados operativos

---

## Restricciones importantes

Bonos NO debe contener:

* autenticación
* lógica de estudiantes
* analytics pesados
* reportes históricos complejos

---

## Responsabilidad crítica

Bonos es:

## la fuente oficial de operación diaria.

---

## Consideraciones futuras

Este contexto probablemente será el más complejo del sistema.

Toda nueva funcionalidad operativa debe evaluarse primero aquí.

---

# Bounded Context: Analytics

## Responsabilidad

Generar métricas y visualizaciones institucionales.

---

## Incluye

* dashboards
* métricas operativas
* asistencia subsidiada
* tendencias
* consumo
* desperdicio
* reportes visuales
* comparativas

---

## Restricción importante

Analytics:

## NO debe recalcular reglas operativas.

Debe consumir:

* datos históricos
* cierres
* estados ya consolidados

---

## Problema actual detectado

Actualmente parte de la lógica operativa y analytics está mezclada.

Esto debe reducirse progresivamente.

---

# Bounded Context: Reutilización

## Responsabilidad

Gestionar reutilización administrativa manual.

---

## Incluye

* bolsa reutilizable
* asignación administrativa
* trazabilidad manual
* motivos administrativos
* auditoría reutilización
* control excepcional

---

## Filosofía operativa

La reutilización:

## NO es operación normal.

Es:

* excepcional
* administrativa
* manual

---

## Restricción importante

NO reutilizar automáticamente:

* expirados
* no utilizados

La reutilización será:

## exclusivamente manual.

---

# Bounded Context: System

## Responsabilidad

Gestionar configuración institucional global.

---

## Incluye

* días hábiles
* festivos
* horarios
* periodos
* configuraciones generales
* timezone institucional
* configuración operativa

---

## Importante

System:

## NO contiene operación.

Solo:

* configuración
* parámetros institucionales

---

# Bounded Context: Cierres

## Responsabilidad

Congelar históricos operativos.

---

## Incluye

* cierres diarios
* consolidación operativa
* pendientes proveedor
* históricos congelados
* snapshots operativos

---

## Filosofía

Los cierres representan:

## verdad histórica congelada.

Una vez cerrado:

* NO recalcular
* NO modificar métricas históricas
* NO reabrir automáticamente

---

# Bounded Context: Integrations

## Responsabilidad

Gestionar integraciones externas.

---

## Incluye

* Google Sheets
* correo
* SMTP
* Brevo
* APIs externas futuras

---

## Restricción importante

Las integraciones:

## NO deben contener lógica institucional crítica.

La lógica de negocio debe permanecer dentro de SIGBA.

---

# Relaciones Oficiales Entre Contextos

## Auth

Puede validar acceso a todos.

---

## Students

Es consumido por:

* Subsidies
* Bonos
* Analytics
* Reutilización

---

## Subsidies

Es consumido por:

* Bonos
* Analytics

---

## Bonos

Es consumido por:

* Analytics
* Reutilización
* Cierres

---

## Cierres

Consume:

* Bonos
* Reutilización

---

## Analytics

Consume:

* Bonos
* Subsidies
* Cierres

---

# Restricciones Arquitectónicas Oficiales

NO mezclar:

* analytics con operación viva
* auth con reglas operativas
* estudiantes con disponibilidad
* reutilización con expiraciones automáticas
* cierres con operación activa

---

# Filosofía de Trabajo con IA

Toda implementación futura debe:

1. identificar bounded context principal
2. identificar contextos afectados
3. minimizar lógica cruzada
4. respetar límites funcionales
5. evitar mover responsabilidades incorrectamente

---

# Estrategia de Refactor Oficial

La modularización será:

## progresiva.

NO se hará:

* migración masiva
* reescritura completa
* separación extrema inmediata

La estrategia será:

## “extraer responsabilidades sin romper comportamiento”.

---

# Objetivo Final

Construir un sistema:

* modular
* mantenible
* entendible
* estable
* auditable
* preparado para crecimiento institucional

SIN perder:

* simplicidad operativa
* claridad funcional
* estabilidad actual
* velocidad de desarrollo.
