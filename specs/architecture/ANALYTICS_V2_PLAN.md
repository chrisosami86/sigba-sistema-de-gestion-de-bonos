# ANALYTICS_V2_PLAN.md

# Objetivo

Diseñar la nueva arquitectura analítica institucional de SIGBA separando completamente:

- operación viva,
- subsidio estudiantil,
- conciliación proveedor,
- administrativos,
- históricos,
- dashboards institucionales.

El objetivo principal es reemplazar progresivamente el sistema analítico legacy actual por un modelo:

- auditable,
- histórico,
- desacoplado,
- estable,
- institucional.

---

# Problema Actual

El analytics legacy actual mezcla:

- operación en tiempo real,
- reutilización histórica,
- subsidio,
- venta libre,
- cálculos live,
- expiraciones,
- métricas híbridas.

Esto genera:

- métricas ambiguas,
- inconsistencias históricas,
- dependencias legacy,
- acoplamiento excesivo,
- dificultad de mantenimiento.

---

# Filosofía Oficial Analytics V2

## Principio principal

Analytics NO modifica operación.

Analytics SOLO consume información histórica.

---

# Separación Oficial de Dominios

Analytics V2 debe dividirse oficialmente en:

| Dominio | Objetivo |
|---|---|
| Subsidio | medir aprovechamiento institucional |
| Operación | medir comportamiento operativo |
| Proveedor | conciliación y diferencias |
| Administrativo | trazabilidad excepcional |
| Histórico | tendencias y auditoría |

---

# Arquitectura Objetivo

## Nuevo Servicio Central

Crear:

```text
backend/src/modules/analytics-v2
```

---

# Estructura Sugerida

```text
analytics-v2/
├── analytics-v2.controller.js
├── analytics-v2.routes.js
├── analytics-v2.service.js
├── services/
│   ├── subsidy-analytics.service.js
│   ├── operational-analytics.service.js
│   ├── provider-analytics.service.js
│   ├── administrative-analytics.service.js
│   └── historical-analytics.service.js
```

---

# Principios Técnicos Obligatorios

## 1. Solo lectura

Analytics V2 NO debe:

- ejecutar expiraciones,
- modificar estados,
- recalcular snapshots,
- alterar históricos,
- invocar lógica operacional.

---

## 2. Basado en snapshots

Toda métrica histórica debe construirse sobre:

- bonos_diarios,
- daily_closure_confirmations,
- redenciones históricas,
- snapshots congelados.

NO sobre cálculos live operacionales.

---

## 3. Separación conceptual estricta

NO mezclar:

- subsidio,
- venta libre,
- reutilización,
- administrativos,
- proveedor

en una sola métrica.

---

## 4. Compatibilidad institucional

Analytics V2 debe respetar:

- festivos,
- días no hábiles,
- periodos académicos,
- modo histórico,
- cierres diarios confirmados.

---

# Dashboard Institucional V2

## Objetivo

Reemplazar progresivamente el dashboard legacy actual.

---

# Filosofía Visual

Dashboard:

- ejecutivo,
- institucional,
- limpio,
- histórico,
- orientado a decisiones.

NO operacional improvisado.

---

# Tecnología

## Frontend

Angular actual.

## Gráficos

Chart.js

Permitido:

- line charts,
- bar charts,
- doughnut charts,
- stacked charts.

NO introducir nuevas librerías gráficas complejas.

---

# Estructura Dashboard V2

# SECCIÓN 1 — Estado Operacional Diario

## Objetivo

Mostrar estado operativo actual.

---

## Cards principales

- reclamados,
- expirados,
- no utilizados,
- administrativos,
- pendientes conciliación,
- diferencias proveedor.

---

## Fuente de datos

Snapshots y conciliación oficial.

---

# SECCIÓN 2 — Subsidio y Asistencia

## Objetivo

Medir aprovechamiento institucional del subsidio.

---

# Concepto Oficial

La asistencia NO mide operación general.

Mide:

cumplimiento del subsidio asignado.

---

# Métricas oficiales

## Base subsidiada

Cantidad total de estudiantes subsidiados activos.

---

## Asistencias esperadas

Días subsidiados válidos dentro del periodo.

---

## Reclamados válidos

Solo:

- reclamados,
- modalidad subsidiado,
- días asignados,
- días hábiles,
- no festivos.

---

## Inasistencia institucional

```text
inasistencia =
dias_esperados - reclamados_validos
```

---

## Porcentaje asistencia

```text
(reclamados_validos / dias_esperados) * 100
```

---

# Rankings

## Estudiantes críticos

Mayor inasistencia subsidiada.

---

## Mejor asistencia

Mayor aprovechamiento del subsidio.

---

## Programas críticos

Mayor desperdicio institucional.

---

# Gráficos

## Tendencia semanal

Asistencia subsidiada por semana.

---

## Tendencia mensual

Inasistencia histórica.

---

## Distribución por programa

Uso institucional del subsidio.

---

# SECCIÓN 3 — Operación Proveedor

## Objetivo

Control institucional del proveedor.

---

# Métricas

- conciliados,
- pendientes,
- diferencias,
- días críticos,
- porcentajes conciliación.

---

# Gráficos

## Tendencia diferencias proveedor

---

## Días con mayor inconsistencia

---

# SECCIÓN 4 — Operación Administrativa

## Objetivo

Trazabilidad excepcional.

---

# Métricas

- bonos administrativos,
- motivos frecuentes,
- admins con más asignaciones,
- distribución por tipo.

---

# Gráficos

## Administrativos por periodo

---

## Distribución motivos

---

# SECCIÓN 5 — Histórico Institucional

## Objetivo

Visualizar evolución histórica.

---

# Métricas

- eficiencia operacional,
- desperdicio,
- cobertura,
- tendencia asistencia,
- tendencia expiraciones.

---

# Gráficos

## Semanal

---

## Mensual

---

## Periodo académico

---

# SECCIÓN 6 — Alertas Institucionales

## Objetivo

Detectar situaciones críticas.

---

# Ejemplos

- alta inasistencia,
- conciliaciones pendientes,
- periodo próximo a finalizar,
- incremento expiraciones,
- baja cobertura.

---

# Datos que NO deben existir en V2

Analytics V2 NO debe usar:

- reutilización automática,
- reutilizables,
- liberaciones manuales,
- cantidad_liberada,
- cálculos híbridos live,
- métricas legacy ambiguas.

---

# Reglas Institucionales Obligatorias

## Administrativos

NO afectan:

- no utilizados,
- expirados históricos,
- asistencia subsidiada.

---

## QR

NO afecta analytics históricos después de reclamado.

---

## Festivos

NO cuentan:

- asistencia esperada,
- inasistencia,
- operación académica.

---

## Días no hábiles

NO generan:

- métricas operativas,
- asistencia esperada.

---

## Periodo cerrado

Sistema entra en:

modo histórico.

Analytics continúa disponible.

---

# Estrategia de Migración

# FASE 1 — Analytics Base

Crear servicios desacoplados.

---

# FASE 2 — Dashboard Institucional V2

Nueva UI institucional.

---

# FASE 3 — Validación Institucional

Comparar métricas:

legacy vs V2.

---

# FASE 4 — Migración Operacional

Dashboard V2 pasa a principal.

---

# FASE 5 — Legacy Interno

Ocultar dashboard original.

---

# FASE 6 — Limpieza Final

Eliminar:

- reutilización,
- liberaciones,
- analytics híbridos,
- métricas obsoletas.

---

# Dependencias Críticas NO TOCAR

Prohibido modificar agresivamente:

- calculateDisponibilidad
- calculateBaseAdministrativa
- requestBono
- claimBono
- expireBonos
- scheduler concurrency
- snapshots históricos
- conciliación estable

---

# Estado Esperado Final

SIGBA debe evolucionar hacia:

- plataforma institucional auditable,
- históricos estables,
- analytics desacoplados,
- métricas reales,
- dashboards ejecutivos,
- trazabilidad completa.

NO hacia:

- dashboards operacionales improvisados,
- cálculos híbridos,
- reutilización dinámica,
- métricas ambiguas.

---

# Resultado Esperado

Analytics V2 permitirá:

- toma de decisiones institucionales,
- redistribución de subsidios,
- auditoría histórica,
- control operacional,
- medición real de cobertura,
- control de desperdicio,
- estabilidad arquitectónica,
- eliminación segura del legacy.