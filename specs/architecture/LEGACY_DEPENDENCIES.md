# LEGACY_DEPENDENCIES.md
## Objetivo

Documentar oficialmente las dependencias legacy activas de SIGBA para:

1. evitar regresiones durante refactors,
2. identificar componentes transitorios,
3. separar operación institucional de comportamiento histórico,
4. facilitar migración hacia Analytics Institucionales V2,
5. permitir trabajo seguro con IA/agentes.

**Este documento NO representa errores.**

## Representa:
deuda controlada y transición arquitectónica.

Estado Arquitectónico Actual

# SIGBA actualmente opera en un estado híbrido:

## Núcleo Institucional Nuevo

Ya estabilizado:

1. snapshots históricos,
2. scheduler,
3. expiraciones automáticas,
4. no utilizados automáticos,
5. asignación administrativa,
6. conciliación proveedor,
7. QR,
8. periodos académicos,
9. festivos,
10. días hábiles,
11. modo histórico,
12. confirmación de cierre diario.

# Núcleo Legacy Activo

Aún presente:

1. analytics live,
2. reutilización histórica,
3. liberación manual,
4. dashboard original,
5. cálculos híbridos operacionales.

La transición oficial será:

**LEGACY → ANALYTICS INSTITUCIONALES V2**

# Principio Oficial
**NO eliminar legacy abruptamente.**

Toda dependencia legacy debe:

1. identificarse,
2. desacoplarse,
3. reemplazarse progresivamente,
4. validarse institucionalmente,
5. retirarse únicamente cuando exista reemplazo estable.

# Dependencias Legacy Oficiales
# 1. **Dashboard Original**
**Estado:**
LEGACY TRANSITORIO

**Ubicación**

**Frontend:**
admin-dashboard-page

**Problema**

El dashboard original mezcla:

1. asistencia subsidiada,
2. operación viva,
3. reutilización,
4. liberaciones,
5. venta libre,
6. métricas híbridas,
7. cálculos live.

Esto genera:

1. contaminación conceptual,
2. métricas ambiguas,
3. dependencia de lógica histórica vieja.

## Ejemplo

Actualmente muestra:

1. reutilizables,
2. liberados,
3. reutilización,
4. analytics live.

Conceptos que ya NO representan el modelo institucional oficial.

# Riesgo

**ALTO**

Cambios incorrectos pueden afectar:

1. inasistencia,
2. analytics,
3. dashboards,
4. reportes históricos.
5. Plan Oficial

Será reemplazado por:

**Dashboard Institucional V2**

Luego:

1. ocultado,
2. desacoplado,
3. eliminado completamente.

## Estado futuro
ELIMINAR

# 2. **Reutilización Automática**
## Estado
LEGACY OBSOLETO

## Filosofía Antigua

La reutilización automática intentaba:

1. reaprovechar expirados,
2. liberar disponibilidad,
3. reciclar bonos.

## Filosofía Oficial Nueva

La reutilización automática queda oficialmente eliminada.

Ahora existe:

Asignación Administrativa Manual

## Problema

Aún existen:

1. métricas,
2. columnas,
3. analytics,
4. cálculos,
5. conceptos visuales

que siguen usando:

1. reutilización,
2. liberados,
3. reutilizables.

## Riesgo
MEDIO-ALTO

Porque:
muchas métricas históricas todavía dependen indirectamente de estos campos.

## Dependencias detectadas

analytics.service.js
dashboard legacy
resumenes legacy

## Estado futuro
ELIMINAR COMPLETAMENTE

# 3. **liberarBonos()**
## Estado
LEGACY CONTROLADO

## Situación
El método todavía existe para compatibilidad histórica.

Pero:
NO representa la operación institucional oficial actual.

## Problema
Parte del analytics viejo aún interpreta:

cantidad_liberada

como métrica válida operacional.

## Riesgo
ALTO

No eliminar hasta migrar completamente Analytics V2.

## Estado futuro

DEPRECATED → REMOVE

# 4. **Analytics Legacy**
## Estado
PARCIALMENTE LEGACY

## Ubicación

backend/src/modules/analytics

## Problema Conceptual

El analytics actual mezcla:

1. snapshots históricos,
2. cálculos live,
3. operación activa,
4. reutilización,
5. liberaciones,
6. subsidio,
7. venta libre.

Además:

analytics.service.js ejecuta expireBonos() directamente.

Esto rompe separación conceptual entre:

operación
vs
analytics

## Problemas Técnicos
### **A. Analytics modifica operación**

Analytics NO debería:

1. expirar,
2. cerrar,
3. modificar estados.

Debe ser:
solo lectura histórica.

### **B. Dependencia de lógica live**

Se calculan métricas directamente desde:

redenciones activas

en vez de snapshots congelados.

### **C. Dependencia reutilización**

Aún calcula:

1. totalLiberados,
2. reutilizados,
3. reutilizables.

Conceptos oficialmente obsoletos.

### **D. Mezcla conceptual**

Analytics actual mezcla:

1. subsidio,
2. venta libre,
3. desconocida,
4. reutilización,
5. expirados.

En una sola respuesta.

### **Riesgo**

MUY ALTO

NO refactorizar agresivamente todavía.

# Plan Oficial

Crear:

institutional-analytics.service.js

Separando:

1. subsidio,
2. operación,
3. proveedor,
4. históricos,
5. administrativos.

Luego:

retirar analytics legacy progresivamente.

# 5. **Métricas “Reutilizables”**
**Estado**

LEGACY VISUAL

**Problema**

El sistema aún muestra:

reutilizables

como métrica visible.

Pero institucionalmente:

NO existe reutilización automática.

## Concepto correcto actual

La capacidad posterior ahora representa:

base administrativa manual.

NO reutilización operativa.

## Estado futuro

ELIMINAR

# 6. **cantidad_liberada**
**Estado**

LEGACY DE DATOS

## Situación

La columna aún existe en:

bonos_diarios

## Problema

Ya NO representa:

operación institucional oficial.

Solo existe por:

compatibilidad histórica.

## Restricción

NO eliminar todavía.

Porque:

analytics legacy aún la consulta.

## Estado futuro

DEPRECATED

# 7. **admin-dashboard-page Monolítico**
**Estado**
DEUDA TÉCNICA CONTROLADA

## Problema

El componente actualmente mezcla:

1. dashboard,
2. resumen diario,
3. estudiantes,
4. configuración,
5. QR,
6. analytics,
7. exportaciones,
8. conciliación,
9. cierres.

## Riesgo

MUY ALTO

Porque:
un cambio pequeño puede romper múltiples módulos.

## Restricción

NO rehacer completo abruptamente.

## Estrategia Oficial

Migración progresiva:

1. dashboard institucional separado,
2. módulos independientes,
3. componentes por dominio.


# 8. **Analytics Live**
**Estado**

LEGACY CONCEPTUAL

## Problema

Parte de las métricas actuales dependen de:

estado operativo en tiempo real

en vez de:

snapshots congelados históricos.

## Ejemplo

Cálculos derivados directamente de:

redenciones actuales

durante operación viva.

## Riesgo

MEDIO-ALTO

Puede generar:

desfase histórico,
inconsistencias,
métricas variables.

## Estrategia

Migrar progresivamente a:

analytics basados en snapshots.

# 9. **Modalidad “desconocida”**
**Estado**

LEGACY TRANSITORIO

## Problema

analytics.service.js aún maneja:

modalidad = desconocida

Esto existe por:

compatibilidad histórica
y registros antiguos.

## Estado futuro

Reducir progresivamente.

NO usar en nuevos módulos institucionales.

# 10. **Dependencia Operacional Histórica**
**Estado**

LEGACY SENSIBLE

Componentes críticos

NO tocar agresivamente:

1. calculateDisponibilidad
2. calculateBaseAdministrativa
3. requestBono
4. claimBono
5. expireBonos
6. scheduler concurrency
7. snapshots históricos

## Razón

Estos componentes sostienen:

1. operación viva,
2. concurrencia,
3. consistencia histórica.

## Estrategia

Primero:

crear reemplazos analíticos desacoplados.

Después:

limpieza controlada.

# **Dependencias que YA NO deben crecer**

A partir de ahora:

NO agregar nueva lógica sobre:

1. reutilización,
2. liberaciones,
3. reutilizables,
4. analytics híbridos,
5. cálculos live antiguos.

Toda nueva funcionalidad debe construirse sobre:

1. snapshots,
2. cierres,
3. históricos,
4. analytics institucionales.

# **Estrategia Oficial de Migración**

## **Fase 1**
Crear:
Analytics Institucionales V2

## **Fase 2**
Crear:
Dashboard Institucional V2

## **Fase 3**
Validar métricas institucionales reales.

## **Fase 4**
Migrar frontend principal al nuevo dashboard.

## **Fase 5**
Ocultar dashboard legacy.

## **Fase 6**
Eliminar:

1. reutilización,
2. liberaciones,
3. reutilizables,
4. analytics híbridos,
5. dependencias legacy.

# **Regla Oficial**

SIGBA ahora debe orientarse a:

1. snapshots históricos,
2. trazabilidad,
3. auditoría,
4. subsidio institucional,
5. conciliación,
6. cierres oficiales,
7. analytics históricos.

NO a:

1. reutilización dinámica,
2. cálculos híbridos,
3. dashboards operacionales improvisados.


# LIMPIEZA LEGACY BONOS DEL DÍA

- Revisar reservados
- Revisar pendientes
- Revisar reutilizables
- Revisar liberados
- Verificar uso en analytics
- Verificar uso en cierres
- Verificar uso en provider
- Verificar uso en modalidad_operacional