# SIGBA — Source of Truth

## Principio

En SIGBA existe UNA sola fuente de verdad por cada dominio de datos.
Ningún componente puede contradecir la fuente oficial de su dominio.

---

## Fuentes Oficiales por Dominio

| Dominio | Fuente Oficial | Notas |
|---------|---------------|-------|
| **Estudiantes** | `students` table | Backend administra CRUD e importación |
| **Subsidios** | `subsidies` + `subsidy_days` tables | Define elegibilidad, no disponibilidad |
| **Disponibilidad** | `bonos_diarios` table + `calculateDisponibilidad()` | Backend calcula en tiempo real |
| **Reservas** | `redenciones` table (`estado='reservado'`) | Backend inserta vía `requestBono()` |
| **Reclamos** | `redenciones` table (`estado='reclamado'`) | Backend actualiza vía `claimBono()` |
| **Expiraciones** | `expireBonos()` (scheduler + transaccional) | Backend decide. Idempotente. |
| **No utilizados** | `bonos_diarios.cantidad_no_utilizada` | Consolidado por `calcularNoUtilizada()` |
| **Horarios** | `HORARIOS` constant en `bonos.service.js` | Almuerzo/refrigerio, subsidiado/ventaLibre |
| **Días hábiles** | `working_days` table + `isWorkingDay()` | Backend consulta DB + festivos |
| **Festivos** | `holidays` table | Administrable vía API |
| **Periodo académico** | `system_settings` table | Define ventana de operación |
| **Modalidad operativa** | `redenciones.modalidad_operacional` | Clasificación explícita: subsidiado/venta_libre/administrativo |
| **Snapshots históricos** | `bonos_diarios` (datos consolidados) | Inmutables post-cierre |
| **Cierres diarios** | `daily_closure_confirmations` | Admin confirma; estado terminal |
| **Conciliaciones** | `conciliaciones_proveedor` | Backend calcula diferencia |
| **Analytics V2** | Solo lectura sobre snapshots | NO modifica operación viva |
| **Zona horaria** | `America/Bogota` | `process.env.TZ` + `AT TIME ZONE` explícito en SQL |
| **Google Sheets** | Sincronización post-reclamo | No contiene lógica de negocio |
| **QR** | `qr.service.js` (códigos 1-200) | Backend genera y valida |
| **Auth / Sesiones** | JWT (`auth.service.js`) | Backend emite y valida tokens |

---

## Restricciones

### Frontend
- NO decide horarios, expiraciones, ni disponibilidad
- NO recalcula operación crítica
- Convierte timestamps a hora local del navegador (solo display)
- El Dashboard V2 usa los mismos endpoints que el legacy

### Analytics
- Analytics legacy (`analytics.service.js`): solo lectura, pero llama `expireBonos()` por acoplamiento
- Analytics V2 (`analytics-v2/`): solo lectura, completamente desacoplado, NO llama `expireBonos()`

### Provider
- Consume datos operacionales consolidados
- NO modifica disponibilidad ni redenciones

---

## Jerarquía de Verdad

```
1. Base de datos PostgreSQL (datos persistidos)
2. Backend (cálculos, validaciones, reglas de negocio)
3. Frontend (visualización, UX)
```

El frontend nunca puede ser fuente de verdad para datos operacionales.
Si hay conflicto entre frontend y backend, el backend tiene prioridad.
Si hay conflicto entre backend y DB, la DB tiene prioridad (datos persistidos).
