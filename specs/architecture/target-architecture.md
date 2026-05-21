# SIGBA — Arquitectura Objetivo

## Objetivo

Definir la arquitectura objetivo de SIGBA para permitir:

* crecimiento progresivo
* mantenibilidad
* estabilidad operativa
* modularización gradual
* incorporación segura de nuevas funcionalidades

SIN reescribir completamente el sistema actual.

La prioridad NO es:

* microservicios
* clean architecture extrema
* sobreingeniería
* abstracciones innecesarias

La prioridad es:

* claridad
* separación progresiva de responsabilidades
* estabilidad institucional
* evolución controlada

---

# Filosofía Arquitectónica

SIGBA es un sistema institucional operativo.

La arquitectura debe:

* priorizar estabilidad sobre perfección teórica
* permitir evolución incremental
* evitar refactors masivos
* respetar reglas operativas ya estabilizadas
* mantener compatibilidad funcional

La estrategia será:

* modularización progresiva
* bounded contexts reales
* extracción gradual de responsabilidades
* refactor guiado por dominio

---

# Arquitectura Backend Objetivo

## Principios

El backend continuará siendo:

* monolito modular
* Express + PostgreSQL
* organizado por dominios funcionales

NO migrar a:

* microservicios
* arquitecturas distribuidas
* CQRS complejo
* event sourcing
* ORMs pesados

---

## Estructura Objetivo

```txt
src/
  config/
  middlewares/
  shared/

  modules/
    auth/
    students/
    subsidies/
    bonos/
    analytics/
    reutilizacion/
    cierres/
    system/
    integrations/
```

---

# Filosofía de Módulos

Cada módulo debe contener únicamente:

* lógica de su dominio
* rutas
* controllers
* services
* validaciones
* queries relacionadas

Evitar:

* lógica cruzada
* dependencias circulares
* servicios gigantes
* helpers ocultos dentro de archivos enormes

---

# Arquitectura Frontend Objetivo

## Principios

El frontend continuará usando:

* Angular standalone
* Signals
* Services simples
* Guards
* Interceptors

NO usar:

* NgRx complejo
* stores globales innecesarios
* clean frontend extrema
* sobre abstracción

---

# Filosofía Frontend

Separar:

* containers
* componentes presentacionales
* lógica de negocio
* servicios HTTP
* estado local

Las páginas NO deben contener:

* lógica operativa compleja
* queries transformadas
* exportaciones
* cálculos pesados
* múltiples responsabilidades

---

# Estructura Objetivo Frontend

```txt
app/
  shared/
  core/

  auth/
  dashboard/
  bonos/
  analytics/
  students/
  reutilizacion/
  system/
```

---

# Separación Deseada

## Containers

Responsables de:

* signals
* llamadas a servicios
* coordinación de estado
* eventos
* composición

---

## Components

Responsables de:

* render UI
* inputs/outputs
* tablas
* cards
* formularios
* modales

SIN lógica de negocio compleja.

---

# Dominios Funcionales Oficiales

SIGBA se organizará alrededor de estos dominios:

## Auth

* login
* JWT
* recuperación contraseña
* sesiones

## Students

* estudiantes
* matrícula activa
* periodos
* importaciones
* subsidios

## Subsidies

* días subsidiados
* control de asistencia subsidiada
* reglas de elegibilidad

## Bonos

* disponibilidad
* solicitud
* reclamación
* expiraciones
* carga extra
* resumen diario

## Reutilización

* asignación administrativa
* reutilización manual
* trazabilidad administrativa

## Analytics

* asistencia
* inasistencias
* métricas operativas
* reportes institucionales

## System

* configuración institucional
* días hábiles
* festivos
* horarios

## Cierres

* cierres operativos
* pendientes proveedor
* consolidación diaria
* históricos congelados

## Integrations

* Google Sheets
* correo
* futuras integraciones externas

---

# Estrategia de Refactor

La estrategia oficial será:

## “Mover sin cambiar comportamiento”

Prioridad:

* estabilidad
* reducción de deuda técnica
* claridad

NO:

* reescritura masiva
* cambios agresivos de lógica
* migraciones enormes

---

# Estrategia de Evolución

## Fase 1

Estabilización:

* bugs críticos
* concurrencia
* expiraciones
* rutas
* tokens
* configuraciones

## Fase 2

Frontend admin:

* separación de containers/components
* extracción por dominios

## Fase 3

Backend bonos:

* subservicios internos
* reducción de tamaño
* separación de responsabilidades

## Fase 4

Students/Subsidies:

* importaciones
* activación
* subsidios
* periodos

## Fase 5

Analytics/Cierres:

* reportes consolidados
* históricos
* pendientes operativos

---

# Restricciones Arquitectónicas

NO implementar:

* microservicios
* eventos distribuidos
* colas complejas
* overengineering
* múltiples fuentes de verdad

La prioridad es:

* consistencia operativa
* mantenibilidad
* claridad
* trazabilidad

---

# Filosofía Operativa

Las reglas institucionales SIEMPRE tienen prioridad sobre decisiones técnicas.

SIGBA modela:

* horarios reales
* subsidios reales
* asistencia real
* operación institucional real

Las decisiones arquitectónicas deben respetar:

* trazabilidad histórica
* estabilidad operativa
* auditoría
* claridad administrativa

---

# Objetivo Final

Construir un sistema:

* mantenible
* modular
* estable
* auditable
* entendible
* sostenible en el tiempo

SIN perder la simplicidad operativa actual.



# Sincronización Reactiva Operativa

## Contexto

SIGBA es un sistema altamente dependiente de:

* horarios institucionales
* disponibilidad en tiempo real
* expiraciones automáticas
* cambios operativos concurrentes
* reservas simultáneas

Durante las pruebas operativas se detectó que actualmente:

* algunas vistas no reaccionan inmediatamente
* los cambios entre sesiones no se sincronizan instantáneamente
* las aperturas de franjas dependen de polling lento
* algunos estados solo se actualizan después de interacción manual
* la disponibilidad puede quedar visualmente desactualizada

Esto genera:

* inconsistencias visuales
* retrasos operativos
* experiencia poco reactiva
* posibles confusiones para estudiantes

---

# Objetivo

Garantizar que la interfaz refleje de manera suficientemente reactiva:

* disponibilidad de bonos
* apertura/cierre de horarios
* estado de reserva
* expiraciones
* cambios administrativos relevantes

SIN introducir complejidad innecesaria.

---

# Filosofía Técnica

SIGBA NO requiere actualmente:

* realtime extremo
* sincronización distribuida compleja
* event sourcing
* WebSockets globales para toda la aplicación

La estrategia oficial será:

## Reactividad híbrida ligera

Combinando:

* polling inteligente
* sincronización local
* actualizaciones optimistas
* backend como fuente de verdad

---

# Backend como Fuente de Verdad

Las reglas críticas NO deben depender exclusivamente del frontend.

Especialmente:

* horarios
* apertura/cierre de franjas
* disponibilidad real
* expiraciones
* permisos operativos

El backend será siempre la fuente oficial del estado operativo.

---

# Polling Inteligente

El frontend podrá utilizar polling ligero para:

* disponibilidad de bonos
* estado de reserva
* estado de franjas
* actualizaciones operativas

La frecuencia debe ser:

* baja en estado normal
* más rápida cerca de aperturas/cierres críticos

Ejemplo:

* normal: cada 10 segundos
* cerca de apertura de franja: cada 1 segundo

---

# Reactividad de Horarios

Las aperturas de franjas horarias deben sentirse inmediatas.

El sistema NO debe depender de:

* refresh manual
* interacción del usuario
* timers largos
* re-render accidental

Los botones operativos deben reaccionar automáticamente al cambio de estado horario.

---

# Actualización Optimista

Cuando un estudiante:

* solicita
* reclama
* cancela

La interfaz actual debe actualizar inmediatamente SIN esperar el siguiente polling.

Posteriormente:

* validar contra backend
* sincronizar estado real

---

# Sincronización entre Pestañas

SIGBA debe soportar múltiples pestañas/sesiones abiertas.

Cuando sea posible:

* sincronizar cambios locales
* evitar estados visuales inconsistentes

Se podrán usar mecanismos ligeros como:

* BroadcastChannel API
* storage events

SIN introducir infraestructura compleja.

---

# Estrategia Futura

Actualmente la prioridad es:

* polling inteligente
* sincronización ligera
* consistencia operativa

NO implementar todavía:

* WebSockets globales
* infraestructura realtime compleja
* sistemas distribuidos de eventos

Estas tecnologías solo deberán evaluarse si:

* aumenta significativamente la concurrencia
* aparecen necesidades reales de realtime avanzado
* la operación institucional lo requiere

---

# Restricciones

La sincronización reactiva NO debe:

* sobrecargar el backend
* generar polling agresivo innecesario
* duplicar fuentes de verdad
* mover lógica crítica al frontend

La prioridad sigue siendo:

* estabilidad operativa
* simplicidad
* mantenibilidad
* claridad institucional
