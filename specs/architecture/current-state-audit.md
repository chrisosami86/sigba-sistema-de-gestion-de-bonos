**Auditoría SIGBA**
No modifiqué código ni creé archivos. Hice lectura arquitectónica del repo completo y el sistema se ve operativo, pero con deuda acumulada por crecimiento rápido, especialmente en administración, bonos, analytics y dashboard.

**1. Backend Actual**
El backend es Express + PostgreSQL con módulos por carpeta: `auth`, `students`, `bonos`, `analytics`, `system`, `googleSheets`, `admin`, `records`. El punto de entrada registra rutas en [app.js](<C:\Users\CHRISTIAN\Desktop\Cursos Fernando\SIGBA\backend\src\app.js:20>). La arquitectura modular existe, pero todavía es una modularidad “por archivo”, no por dominio interno.

El núcleo operativo está en [bonos.service.js](<C:\Users\CHRISTIAN\Desktop\Cursos Fernando\SIGBA\backend\src\modules\bonos\bonos.service.js:48>), que concentra solicitud, reclamo, disponibilidad, resumen diario, estadísticas, carga extra, liberación, cierre y expiraciones. Es estable conceptualmente, pero demasiado grande: 805 líneas.

**2. Frontend Actual**
Angular 21 con signals, guards, interceptor, servicios por área y páginas standalone. La mayor deuda está en [admin-dashboard-page.ts](<C:\Users\CHRISTIAN\Desktop\Cursos Fernando\SIGBA\frontend\src\app\admin\pages\admin-dashboard-page\admin-dashboard-page.ts:69>) y su HTML: 1076 líneas TS y 956 líneas HTML. Ahí conviven dashboard, bonos, resumen diario, estudiantes, importaciones, configuración, analytics, exportación Excel/PDF y manejo de modales.

**3. Problemas Detectados**
El problema principal no es que falten módulos, sino que los dominios reales quedaron mezclados. `admin` existe pero está vacío, mientras la lógica administrativa está repartida entre `students`, `bonos`, `system`, `analytics` y frontend admin.

Hay queries SQL embebidas en servicios grandes, helpers privados dentro de servicios que ya deberían ser submódulos, validación repetida, decisiones operativas dentro de controladores y acoplamiento entre analytics y bonos: [analytics.service.js](<C:\Users\CHRISTIAN\Desktop\Cursos Fernando\SIGBA\backend\src\modules\analytics\analytics.service.js:19>) llama directamente a `expireBonos()`.

**4. Riesgos Técnicos**
Riesgo alto: cambios en bonos pueden romper disponibilidad, cierre diario, reutilización, resumen administrativo o analytics porque todo comparte el mismo archivo.

Riesgo medio-alto: el interceptor frontend usa `studentToken || adminToken` en [auth.interceptor.ts](<C:\Users\CHRISTIAN\Desktop\Cursos Fernando\SIGBA\frontend\src\app\interceptors\auth.interceptor.ts:4>). Si ambos tokens existen, prioriza estudiante y puede mandar credenciales equivocadas a endpoints admin.

Riesgo concreto: en [students.routes.js](<C:\Users\CHRISTIAN\Desktop\Cursos Fernando\SIGBA\backend\src\modules\students\students.routes.js:13>) `/:id` está antes de `/code/:codigo`, por lo que `/code/:codigo` puede quedar capturado como `id = "code"`.

Riesgo de build: el frontend importa `chart.js` en [admin-dashboard-page.ts](<C:\Users\CHRISTIAN\Desktop\Cursos Fernando\SIGBA\frontend\src\app\admin\pages\admin-dashboard-page\admin-dashboard-page.ts:20>), pero `chart.js` no aparece en [package.json](<C:\Users\CHRISTIAN\Desktop\Cursos Fernando\SIGBA\frontend\package.json:32>).

**5. Deuda Priorizada**
P0: separar credenciales/token por contexto en frontend; corregir orden de rutas students; confirmar dependencia `chart.js`.

P1: dividir `admin-dashboard-page` en containers/componentes; dividir `bonos.service.js` en subservicios internos sin cambiar API pública.

P2: extraer importación Excel de `students.service.js`; separar analytics SQL/reporting; mover sincronización Google Sheets fuera del controller.

P3: ordenar módulos vacíos `admin` y `records`; mejorar convenciones de error/status; crear pruebas críticas de concurrencia y cierre operativo.

**6. Módulos Más Críticos**
`bonos`: corazón operativo. No tocar agresivamente.

`admin-dashboard-page`: cuello de botella frontend.

`students`: mezcla CRUD, subsidios, importación Excel, passwords iniciales y activación.

`analytics`: reportes con dependencia directa de bonos y SQL pesado.

`auth`: funcional, pero mezcla auth estudiante/admin/recuperación/default admin en un solo servicio.

**7. Archivos Grandes**
[admin-dashboard-page.ts](<C:\Users\CHRISTIAN\Desktop\Cursos Fernando\SIGBA\frontend\src\app\admin\pages\admin-dashboard-page\admin-dashboard-page.ts:69>) 1076 líneas.

[admin-dashboard-page.html](<C:\Users\CHRISTIAN\Desktop\Cursos Fernando\SIGBA\frontend\src\app\admin\pages\admin-dashboard-page\admin-dashboard-page.html>) 956 líneas.

[bonos.service.js](<C:\Users\CHRISTIAN\Desktop\Cursos Fernando\SIGBA\backend\src\modules\bonos\bonos.service.js:48>) 805 líneas.

[students.service.js](<C:\Users\CHRISTIAN\Desktop\Cursos Fernando\SIGBA\backend\src\modules\students\students.service.js:13>) 624 líneas.

[analytics.service.js](<C:\Users\CHRISTIAN\Desktop\Cursos Fernando\SIGBA\backend\src\modules\analytics\analytics.service.js:18>) 351 líneas.

**8. Responsabilidades Mezcladas**
`bonos.controller` reclama bono y además consulta estudiante, consulta tipo de bono, sincroniza Google Sheets y actualiza estado de sincronización: [bonos.controller.js](<C:\Users\CHRISTIAN\Desktop\Cursos Fernando\SIGBA\backend\src\modules\bonos\bonos.controller.js:40>).

`students.service` hace CRUD, subsidios, importación Excel, normalización de columnas, hashing y desactivación masiva: [students.service.js](<C:\Users\CHRISTIAN\Desktop\Cursos Fernando\SIGBA\backend\src\modules\students\students.service.js:437>).

`admin-dashboard-page` contiene lógica de UI, estado, formularios, Chart.js, Excel, PDF, modales y navegación de módulos.

**9. Dominios Reales Detectados**
Autenticación y sesiones.

Estudiantes y matrícula activa.

Subsidios y días autorizados.

Bonos diarios: disponibilidad, solicitud, reclamo, expiración, reutilización.

Operación diaria: horarios, días hábiles, festivos, cierre.

Administración institucional: tablero, gestión, importaciones, configuración.

Analytics/reporting.

Integraciones externas: Google Sheets, correo.

**10. Partes Estables**
El modelo de datos es razonable: `students`, `subsidies`, `subsidy_days`, `config_bonos`, `bonos_diarios`, `redenciones`, `admins`, `system_settings`, `working_days`, `holidays`.

La concurrencia en bonos ya tiene buenas señales: transacciones, `FOR UPDATE`, `ON CONFLICT` y constraints en migración.

Los guards y servicios Angular son simples y comprensibles.

**11. No Tocar Todavía**
No reescribir `requestBono`, `claimBono`, expiraciones ni cálculo de disponibilidad hasta tener pruebas de regresión.

No partir todo el backend en una gran reorganización.

No cambiar tablas principales salvo ajustes muy controlados.

No migrar a NgRx ni microservicios.

**12. Estabilización Urgente**
Corregir rutas y token interceptor.

Verificar dependencia `chart.js`.

Cubrir con pruebas/manual checklist: solicitar bono, reclamar bono, expiración, liberar, cierre diario, importación estudiantes, analytics.

Extraer Google Sheets a un caso de uso post-reclamo para que el controller no tenga lógica de integración.

**13. Refactor Progresivo**
Mantener rutas/API actuales y extraer por dentro. Primero subservicios privados dentro del mismo módulo; luego carpetas por dominio cuando ya esté claro. La regla: mover sin cambiar comportamiento.

**14. Angular**
Separar `AdminDashboardPage` en containers por pestaña: `dashboard`, `bonos-dia`, `resumen-diario`, `gestion-estudiantes`, `base-datos`, `configuracion`.

Extraer componentes presentacionales para tablas, filtros, cards de bonos, modales crear/editar estudiante y panel analytics.

Crear servicios de estado pequeños si hace falta, pero no NgRx.

Separar exportadores Excel/PDF en helpers o servicios dedicados.

**15. Backend Modular**
Dentro de `bonos`, separar: `bonos-request.service`, `bonos-availability.service`, `bonos-admin.service`, `bonos-expiration.service`, `bonos-report.service`.

Dentro de `students`, separar: `students-crud.service`, `students-import.service`, `subsidies.service`, `student-row-normalizer`.

Crear `integrations/googleSheets` o `sync` para la sincronización.

`admin` puede convertirse en agregador de rutas administrativas, no necesariamente en dueño de toda la lógica.

**16. Plan Por Fases**
Fase 1: estabilización sin refactor grande: rutas, tokens, dependencia, pruebas/checklist operativo.

Fase 2: frontend admin por componentes, sin cambiar endpoints.

Fase 3: backend bonos por subservicios internos.

Fase 4: students/import/subsidies separados.

Fase 5: analytics/reporting aislado y con queries más mantenibles.

Fase 6: documentación arquitectónica y convenciones.

**17. Separar Primero**
Primero `admin-dashboard-page`, porque es el mayor riesgo de mantenibilidad.

Luego `bonos.service.js`, porque es crítico y concentra demasiadas reglas.

Después `students.service.js`, especialmente importaciones Excel y subsidios.

**18. Puede Esperar**
`googleSheets.service.js` es pequeño y puede esperar, aunque su uso debería salir del controller.

`system.service.js` está aceptable por ahora.

`auth.service.js` puede esperar después de corregir tokens/interceptor y separar recuperación más adelante.

`admin` y `records` vacíos pueden esperar hasta que exista una decisión clara de organización.

Conclusión: SIGBA no necesita una reescritura. Necesita estabilización quirúrgica, pruebas alrededor de bonos y una modularización progresiva que respete el sistema operativo actual. La arquitectura base es rescatable; el trabajo inteligente es bajar concentración de responsabilidades sin moverle el piso al funcionamiento diario.

---

**19. FASE 2-4: Analytics V2 + Dashboard Institucional (2026-05-25)**

### Nuevos módulos backend: `analytics-v2/`

Módulo completamente desacoplado del core operacional. NO importa `expireBonos()`, `calculateDisponibilidad`, `liberarBonos`, ni `calculateBaseAdministrativa`. Todo basado en snapshots y solo lectura.

**Estructura:**
```
backend/src/modules/analytics-v2/
├── analytics-v2.controller.js   — getInstitutionalDashboard
├── analytics-v2.routes.js       — GET /api/analytics-v2/dashboard (authenticateAdmin)
├── analytics-v2.service.js      — Orquestador + cómputo de alertas institucionales
└── services/
    ├── subsidy-analytics.service.js      — Asistencia subsidiada, rankings, programas críticos
    ├── operational-analytics.service.js  — Estado operacional diario (snapshot del día)
    ├── provider-analytics.service.js     — Conciliación proveedor, tendencias, días críticos
    ├── administrative-analytics.service.js — Motivos, admins ranking, distribución por periodo
    └── historical-analytics.service.js   — Tendencias semanales/mensuales, KPIs históricos
```

**Endpoint:** `GET /api/analytics-v2/dashboard?fechaInicio=&fechaFin=&fechaSnapshot=`
Respuesta unificada con 6 secciones: operational, subsidy, provider, administrative, historical, alertas.

**Servicios de dominio:**
- `subsidy-analytics.service.js`: Calcula `inasistencia = dias_esperados - reclamados_validos`, excluye festivos y días no hábiles. Rankings de estudiantes críticos, mejor asistencia, programas críticos.
- `operational-analytics.service.js`: 6 métricas del día (reclamados, expirados, noUtilizados, administrativos, conciliacionesPendientes, diferenciasProveedor).
- `provider-analytics.service.js`: Resumen de conciliaciones, tendencia de diferencias, días críticos.
- `administrative-analytics.service.js`: Total administrativos, motivos frecuentes, ranking de admins.
- `historical-analytics.service.js`: KPIs globales (eficiencia, desperdicio, cobertura), agregación semanal y mensual.
- `analytics-v2.service.js` (orquestador): Paraleliza los 5 servicios vía `Promise.all`, computa alertas institucionales (PERIODO_POR_FINALIZAR, ALTA_INASISTENCIA, ESTUDIANTES_CRITICOS, CONCILIACIONES_PENDIENTES).

**Compatibilidad institucional:** Respeta festivos, días hábiles, periodos académicos, modo histórico, confirmaciones de cierre diario. Excluye festivos de conteos de asistencia esperada.

### Nuevo módulo frontend: Dashboard Institucional V2

**Ruta:** `/admin/institutional` (standalone, protegido por `adminAuthGuard`).

**Componente:** `InstitutionalDashboardPage` (standalone).
- `frontend/src/app/admin/pages/institutional-dashboard-page/institutional-dashboard-page.ts`
- `frontend/src/app/admin/pages/institutional-dashboard-page/institutional-dashboard-page.html`
- `frontend/src/app/admin/services/institutional-analytics.service.ts`

**6 secciones del dashboard:**
1. Estado Operacional Diario — 6 cards + gráfico de barras con datos del snapshot del día
2. Subsidio y Asistencia — Selector por día, KPIs (base subsidiada, esperadas, % asistencia, % inasistencia), tendencia (línea), programas críticos (barras horizontales), rankings (estudiantes críticos y mejor asistencia)
3. Operación Proveedor — 5 cards (conciliados, pendientes, dif. menor, dif. crítica, % conciliación), tendencia de diferencias (barras), tabla de días críticos
4. Operación Administrativa — Total asignaciones, gráfico doughnut de motivos frecuentes, ranking de admins
5. Histórico Institucional — 4 KPIs (eficiencia, desperdicio, cobertura, días con op.), tendencia semanal (línea), tendencia mensual (barras stacked)
6. Alertas Institucionales — Cards de alerta codificadas por severidad (ALTA/MEDIA/BAJA)

**Tecnología:** Angular 21 signals + Chart.js (bar, line, doughnut). Sin nuevas librerías. Charts se destruyen y recrean en cada refresh. Selector de día subsidiado re-renderiza solo los gráficos relevantes.

### Coexistencia con Legacy

- El Dashboard Legacy (`/admin`) permanece intacto y funcional.
- Se agregó navegación dual: botón "Dashboard Institucional" (estilo outline) en el sidebar del dashboard legacy.
- El Dashboard Institucional V2 tiene link "Dashboard Legacy" en su header para volver.
- Ambos dashboards comparten el mismo `adminAuthGuard` y funcionan en pestañas/ventanas paralelas.

### Desacople Verificado

El nuevo módulo NO referencia:
- `expireBonos()`, `calculateDisponibilidad`, `calculateBaseAdministrativa`, `liberarBonos`
- `reutilizacion`, `cantidad_liberada`, `reutilizables`, `liberados`
- `ventaLibre`, `desconocida`, métricas híbridas
- Analytics legacy (`analytics.service.js`)

Todas las consultas son solo lectura sobre `bonos_diarios`, `redenciones`, `conciliaciones_proveedor`, `daily_closure_confirmations`, `system_settings`, `working_days`, `holidays`, `students`, `subsidies`, `subsidy_days`.

### Archivos Modificados Existentes

| Archivo | Cambio |
|---------|--------|
| `backend/src/app.js` | +2 líneas (import + mount analyticsV2Routes) |
| `frontend/src/app/app.routes.ts` | +1 import + ruta `/admin/institutional` |
| `frontend/src/app/admin/pages/admin-dashboard-page/admin-dashboard-page.ts` | +1 import RouterModule, +RouterModule en imports |
| `frontend/src/app/admin/pages/admin-dashboard-page/admin-dashboard-page.html` | + botón "Dashboard Institucional" con routerLink en sidebar |
| `specs/architecture/current-state-audit.md` | Este documento — extendido con sección 19 |

### Archivos Nuevos (8 archivos)

| Backend | Frontend |
|---------|----------|
| `analytics-v2/analytics-v2.service.js` | `services/institutional-analytics.service.ts` |
| `analytics-v2/analytics-v2.controller.js` | `pages/institutional-dashboard-page/institutional-dashboard-page.ts` |
| `analytics-v2/analytics-v2.routes.js` | `pages/institutional-dashboard-page/institutional-dashboard-page.html` |
| `analytics-v2/services/subsidy-analytics.service.js` | |
| `analytics-v2/services/operational-analytics.service.js` | |
| `analytics-v2/services/provider-analytics.service.js` | |
| `analytics-v2/services/administrative-analytics.service.js` | |
| `analytics-v2/services/historical-analytics.service.js` | |

### Próximos Pasos

1. Verificar build frontend (corregir cualquier error de compilación Angular)
2. Ejecutar smoke tests: endpoint `/api/analytics-v2/dashboard` responde con datos
3. Validar métricas de subsidio contra datos reales de estudiantes
4. Verificar que dashboard legacy sigue funcionando idéntico
5. Ejecutar migración `003_daily_closure_confirmations.sql` si no se ha ejecutado
6. Fase 5 futura: ocultar dashboard legacy cuando V2 esté validado institucionalmente
7. Fase 6 futura: eliminar reutilización, liberaciones, analytics híbridos, métricas obsoletas