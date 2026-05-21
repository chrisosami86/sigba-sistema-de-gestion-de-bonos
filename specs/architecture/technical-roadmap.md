# SIGBA — Technical Roadmap

## Objetivo

Definir la estrategia técnica progresiva para evolucionar SIGBA hacia una arquitectura:

* mantenible
* modular
* estable
* auditable
* escalable operativamente

SIN detener la operación actual del sistema.

El roadmap NO representa:

* una reescritura completa
* migraciones agresivas
* cambios masivos inmediatos

Representa:

* evolución controlada
* estabilización progresiva
* reducción de deuda técnica
* consolidación de dominios funcionales

---

# Principios del Roadmap

Toda evolución técnica deberá priorizar:

1. Estabilidad operativa
2. Trazabilidad institucional
3. Compatibilidad funcional
4. Modularización progresiva
5. Claridad arquitectónica
6. Simplicidad operativa

---

# Restricciones Oficiales

NO implementar:

* microservicios
* clean architecture extrema
* sobreingeniería
* refactors masivos sin dominio claro
* múltiples fuentes de verdad
* sistemas distribuidos innecesarios

La prioridad es:

* operación institucional real
* mantenibilidad gradual
* claridad del sistema
* estabilidad a largo plazo

---

# Estado Actual

SIGBA ya cuenta con:

* autenticación JWT
* recuperación de contraseña
* estudiantes
* subsidios
* reservas
* reclamaciones
* expiraciones
* analytics
* dashboard
* concurrencia básica
* integración Google Sheets
* configuración institucional
* Docker + PostgreSQL

El sistema ya se considera:

## operativo institucionalmente

La prioridad ahora es:

* estabilizar
* modularizar
* consolidar arquitectura

---

# Estrategia General

La evolución de SIGBA seguirá esta filosofía:

## “Mover sin romper comportamiento”

Los refactors deben:

* separar responsabilidades
* reducir deuda técnica
* mejorar mantenibilidad

SIN:

* alterar reglas operativas
* cambiar flujos funcionales ya estabilizados
* introducir reescrituras innecesarias

---

# FASE 1 — Estabilización Operativa

## Prioridad: CRÍTICA

Objetivo:
Garantizar consistencia operativa del sistema actual.

---

## Incluye

### Concurrencia y race conditions

* bloqueo correcto de cupos
* transacciones seguras
* validaciones concurrentes
* prevención de sobreasignación

### Sincronización reactiva

* polling inteligente
* actualización automática de franjas
* sincronización entre pestañas
* actualización inmediata de disponibilidad

### Horarios y expiraciones

* validación correcta de días hábiles
* expiraciones automáticas
* cierre correcto de franjas
* consistencia de estados

### Configuración persistente

* cantidades diarias
* horarios
* festivos
* periodos

### Docker e infraestructura

* init.sql estable
* migraciones consistentes
* bootstrap reproducible
* timezone unificado

---

## Resultado esperado

SIGBA debe:

* comportarse consistentemente
* reaccionar correctamente
* soportar concurrencia real
* mantener sincronización operativa estable

---

# FASE 2 — Modularización Frontend

## Prioridad: ALTA

Objetivo:
Reducir deuda técnica del frontend SIN cambiar comportamiento.

---

## Dominios prioritarios

### Dashboard

Separar:

* analytics
* cards
* gráficos
* filtros
* métricas

### Admin

Extraer:

* operaciones diarias
* configuración
* resumen diario
* reutilización

### Auth

Separar:

* login
* recuperación
* guards
* sesiones
* estado auth

---

## Estrategia

Aplicar:

* container/component
* services pequeños
* signals localizados
* componentes reutilizables

---

## Restricciones

NO:

* migrar a ngrx complejo
* crear stores globales innecesarios
* rehacer UI completa

---

## Resultado esperado

Frontend:

* más mantenible
* más modular
* más entendible
* con menos lógica por página

---

# FASE 3 — Consolidación Backend

## Prioridad: ALTA

Objetivo:
Reducir lógica cruzada y consolidar dominios backend.

---

## Prioridades

### Bonos

Separar:

* disponibilidad
* reservas
* expiraciones
* reclamaciones
* cierres

### Students/Subsidies

Consolidar:

* periodos
* subsidios
* activación
* importaciones

### Integrations

Separar:

* Google Sheets
* correo
* futuros conectores

---

## Resultado esperado

Backend:

* modular
* con servicios más pequeños
* menos dependencias cruzadas
* más fácil de mantener

---

# FASE 4 — Reutilización Administrativa

## Prioridad: MEDIA

Objetivo:
Implementar reutilización manual institucional.

---

## Incluye

### Bolsa reutilizable

* trazabilidad
* conteo histórico
* cierre diario

### Asignación administrativa

* búsqueda estudiante
* tipo bono
* motivo administrativo
* auditoría

### Franja administrativa

* separada de subsidio
* separada de venta libre

---

## Resultado esperado

La reutilización:

* NO dependerá de reaperturas automáticas
* NO romperá horarios actuales
* mantendrá trazabilidad completa

---

# FASE 5 — Cierres Operativos

## Prioridad: MEDIA

Objetivo:
Congelar históricos operativos diarios.

---

## Incluye

### Cierres automáticos

* almuerzo
* refrigerio
* reutilización

### Consolidación histórica

* reclamados
* expirados
* no utilizados
* pendientes proveedor

### Reportes históricos

* consumo
* desperdicio
* pendientes acumulados

---

## Resultado esperado

SIGBA podrá:

* generar reportes reales
* congelar históricos
* soportar auditoría institucional

---

# FASE 6 — Analytics Institucionales

## Prioridad: MEDIA

Objetivo:
Construir analytics alineados con operación real.

---

## Prioridades

### Subsidios

* asistencia real
* inasistencia real
* horarios válidos
* disciplina operativa

### Reportes operativos

* uso por día
* tendencias
* pendientes
* aprovechamiento

### Dashboard institucional

* métricas simples
* información accionable
* visualización clara

---

## Restricciones

NO construir:

* dashboards saturados
* métricas irrelevantes
* visualizaciones innecesarias

---

# FASE 7 — Estabilización Final

## Prioridad: BAJA

Objetivo:
Preparar SIGBA para crecimiento futuro estable.

---

## Incluye

### Observabilidad

* logging estructurado
* errores centralizados
* monitoreo básico

### Performance

* queries críticas
* índices
* polling optimizado

### Seguridad

* hardening JWT
* sesiones
* auditoría administrativa

### Documentación

* specs
* onboarding
* despliegue
* mantenimiento

---

# Estrategia de Trabajo con IA

Toda nueva funcionalidad deberá:

* partir desde specs
* respetar bounded contexts
* respetar arquitectura actual
* evitar lógica cruzada

---

## Filosofía Oficial

Primero:

1. analizar
2. entender dominio
3. detectar impacto
4. proponer estrategia

Después:
5. implementar

---

# Objetivo Final

Construir un sistema:

* mantenible
* modular
* estable
* auditable
* institucionalmente sólido

SIN perder:

* simplicidad operativa
* claridad funcional
* estabilidad del negocio
