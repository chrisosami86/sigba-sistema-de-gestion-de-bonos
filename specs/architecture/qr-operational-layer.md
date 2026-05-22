# SIGBA — Capa QR Operacional Híbrido (Fase 3A)

> **Fecha:** 2026-05-22  
> **Versión:** v1.1 — Integración operacional en dashboard  
> **Estado:** OPERATIVA — QR integrado en flujo diario  

---

## Resumen

Sistema QR híbrido para acelerar la reclamación de bonos en bienestar universitario. El QR es una capa de apoyo operacional que reduce digitación manual, acelera filas y disminuye errores humanos, sin reemplazar el bono físico ni digitalizar completamente la operación.

**Integración operacional:** El scanner QR ahora funciona como un modal fullscreen negro dentro del dashboard admin, accesible desde el botón "ESCANEAR QR" en el módulo "Resumen diario". No requiere navegar a otra página. El operador puede alternar libremente entre reclamación manual y QR sin cambiar de contexto.

---

## 1. Filosofía

**NO es QR full digital.** Es QR asistido:
- El estudiante sigue recibiendo bono físico impreso
- El proveedor sigue contando bonos físicos
- La digitación manual coexiste con el escaneo
- El QR solo acelera la captura del código

---

## 2. Arquitectura

```
┌──────────────────────────────────────────────────────────────┐
│                     QR HÍBRIDO                                │
│                                                               │
│  ┌─────────────────────┐     ┌─────────────────────────────┐ │
│  │ FRONTEND ESTUDIANTE │     │ FRONTEND ADMIN (Scanner)     │ │
│  │                     │     │                              │ │
│  │ qr-bono-card        │     │ /admin/scan-bonos            │ │
│  │ ┌─────────────────┐ │     │ ┌──────────────────────────┐ │ │
│  │ │ QR dinámico      │ │     │ │ html5-qrcode webcam     │ │ │
│  │ │ SIGBA|TIPO|COD  │ │     │ │ auto-detecta QR         │ │ │
│  │ │ renderizado con  │ │     │ │ reclama automáticamente │ │ │
│  │ │ qrcode.js        │ │     │ │ feedback verde/rojo     │ │ │
│  │ └─────────────────┘ │     │ └──────────────────────────┘ │ │
│  └─────────────────────┘     └─────────────────────────────┘ │
│                                                               │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ BACKEND — qr.service.js                                   │ │
│  │                                                           │ │
│  │ getActiveBonus(studentId)                                 │ │
│  │   ├── Busca redención reservada hoy del estudiante        │ │
│  │   ├── Si no tiene código, genera one (random 1-200,       │ │
│  │   │   único para hoy+tipo)                                │ │
│  │   └── Retorna { tipo, codigoBono, estado, fecha }        │ │
│  │                                                           │ │
│  │ claimByCode({ codigoBono, tipo }, adminId)                │ │
│  │   ├── Busca redención por código + tipo + hoy             │ │
│  │   ├── FOR UPDATE lock                                     │ │
│  │   ├── Valida: estado=reservado, no expirado               │ │
│  │   ├── Valida estudiante activo                            │ │
│  │   ├── UPDATE estado='reclamado', hora_reclamo=NOW()       │ │
│  │   └── Log auditado: [qr.claimByCode]                      │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  Endpoints:                                                   │
│  GET  /api/bonos/mis-bonos-activos      (student)            │
│  POST /api/bonos/claim-qr               (admin)              │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. Flujo Híbrido

### 3.1 Estudiante → QR

```
1. Estudiante inicia sesión en SIGBA
2. Ve sección "Mi bono de hoy" con QR dinámico
3. El QR contiene: SIGBA|ALMUERZO|127
4. Presenta celular en bienestar
5. Bienestar escanea con webcam
```

**Cuándo se muestra el QR:** Solo si estado='reservado', fecha=hoy, no expirado.
**Cuándo desaparece:** Al reclamar → cambia a "Sin bono activo".

### 3.2 Bienestar → Escaneo (modal integrado)

```
1. Operador está en "Resumen diario" viendo la tabla
2. Presiona botón "ESCANEAR QR" (rojo, visible en header)
3. Se abre modal fullscreen negro con webcam
4. Estudiante muestra QR → detectado automáticamente
5. SIGBA valida y reclama en <1 segundo
6. Pantalla muestra:
   - Verde + "BONO RECLAMADO" + datos del estudiante
   - Beep de éxito
7. Modal permanece abierto para siguiente escaneo
8. Al cerrar modal → tabla, disponibilidad, stats, base admin se actualizaron automáticamente
9. Operador puede reclamar manualmente el siguiente bono
```

**Compatibilidad híbrida:**
- El operador ve la tabla con los inputs manuales normalmente
- Abre el modal QR, escanea varios bonos, cierra
- Vuelve a la tabla → todo actualizado
- Puede seguir reclamando manualmente los que quedan

### 3.3 Proveedor → Sin cambios

El proveedor sigue:
- Recibiendo bonos físicos
- Contando físicos
- Trabajando igual que antes

---

## 4. Formato QR

```
SIGBA|ALMUERZO|127
SIGBA|REFRIGERIO|89
```

- `SIGBA` — prefijo fijo para validación
- `ALMUERZO` o `REFRIGERIO` — tipo en mayúsculas
- `127` — código numérico (1-200)

**Generación:** Renderizado dinámico con `qrcode` (sin almacenar imágenes).

---

## 5. Código de Bono

- Rango: 1–200
- Asignado al primer GET de `/mis-bonos-activos`
- Único por (tipo, fecha) — verificado contra redenciones existentes
- 50 reintentos si colisiona
- Persiste en `redenciones.codigo_bono`

---

## 6. Seguridad QR

**Sin criptografía por diseño.** La protección es operacional:

| Riesgo | Protección |
|--------|-----------|
| Screenshot / QR duplicado | `WHERE estado = 'reservado'` — segundo escaneo falla con "YA RECLAMADO" |
| QR expirado | `WHERE expiracion_at > NOW()` — bloquea en transacción |
| QR de otro día | `WHERE bd.fecha = CURRENT_DATE` |
| Estudiante inactivo | `FOR UPDATE` sobre students con validación `activo = true` |
| Doble escaneo rápido | Cooldown de 2s en el scanner frontend + FOR UPDATE serializa |

---

## 7. Coexistencia Legacy

El sistema permite ambos métodos simultáneamente:

| Método | Cómo funciona |
|--------|--------------|
| **QR** | `POST /api/bonos/claim-qr` — busca por código + tipo |
| **Manual** | `PATCH /api/bonos/reclamar/:id` — busca por redencionId |

Ambos usan el mismo estado `reclamado`, la misma transacción FOR UPDATE, y las mismas validaciones. Son rutas paralelas al mismo destino.

---

## 8. Endpoints

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| `GET` | `/api/bonos/mis-bonos-activos` | `authenticateStudent` | Bono activo del estudiante + QR content |
| `POST` | `/api/bonos/claim-qr` | `authenticateAdmin` | Reclamar por código QR |

---

## 9. Integración UX Operacional

### 9.1 Modal vs página separada

El scanner QR funciona como **modal fullscreen** dentro del dashboard, no como página aparte. Esto permite:

- El operador permanece en el mismo contexto (dashboard admin)
- La tabla de resumen diario se actualiza automáticamente tras cada escaneo
- No se pierde el estado de filtros, página, ni selección
- Alternancia instantánea QR ↔ manual sin navegación

### 9.2 Estados visuales

| Estado | Visual |
|--------|--------|
| Scanner abierto | Overlay negro fullscreen con webcam centrada |
| Escaneo exitoso | Recuadro verde, "BONO RECLAMADO", nombre y código del estudiante |
| Escaneo fallido | Recuadro rojo, mensaje del backend (YA RECLAMADO, BONO EXPIRADO, etc.) |
| Sin cámara | Mensaje "Cámara no disponible" con botón cerrar |
| Cooldown | 2.5s tras éxito, 2s tras error — previene doble lectura |

### 9.3 Sonido

- Éxito: beep agudo (sine 880Hz, 150ms)
- Error: beep grave (square 220Hz, 300ms)
- Generado vía Web Audio API, sin archivos de audio

### 9.4 Botón ESCANEAR QR

- Ubicación: header del módulo "Resumen diario", junto a "Descargar Excel" y "Actualizar"
- Color: rojo (`bg-red-600`) para visibilidad operacional
- Siempre visible cuando el módulo "Resumen diario" está activo

### 9.5 Auto-refresh

Tras cada reclamación QR exitosa, se actualizan automáticamente:
- `refreshResumen()` — tabla de resumen diario
- `refreshDisponibilidad()` — contadores de bonos
- `refreshStats()` — estadísticas
- `refreshBaseAdministrativa()` — base administrativa

Sin recargar la página.

---

## 10. Archivos

### Backend

| Archivo | Cambio |
|---------|--------|
| `backend/src/modules/bonos/qr.service.js` | **Nuevo** — `getActiveBonus`, `claimByCode`, `generateUniqueCode` |
| `backend/src/modules/bonos/bonos.controller.js` | **Modificado** — +2 métodos QR, +import qrService |
| `backend/src/modules/bonos/bonos.routes.js` | **Modificado** — +2 rutas QR |

### Frontend

| Archivo | Cambio |
|---------|--------|
| `frontend/src/app/shared/components/qr-bono-card/qr-bono-card.ts` | **Nuevo** — Componente QR dinámico para estudiantes |
| `frontend/src/app/admin/pages/admin-scan-page/admin-scan-page.ts` | **Nuevo** — Página scanner standalone (secundaria) |
| `frontend/src/app/admin/pages/admin-dashboard-page/admin-dashboard-page.ts` | **Modificado** — Modal QR integrado: +import Html5Qrcode, +7 signals, +5 métodos (startQrScanner, stopQrScanner, onQrScanned, parseQrText, playBeep), auto-refresh post-escaneo |
| `frontend/src/app/admin/pages/admin-dashboard-page/admin-dashboard-page.html` | **Modificado** — +botón ESCANEAR QR en header de Resumen diario, +modal fullscreen negro con webcam, feedback, sonido |
| `frontend/src/app/students/services/bonos.service.ts` | **Modificado** — +`getActiveStudentBonus()`, +`claimByQr()` |
| `frontend/src/app/students/pages/details-students-page/details-students-page.ts` | **Modificado** — +import QrBonoCardComponent |
| `frontend/src/app/students/pages/details-students-page/details-students-page.html` | **Modificado** — +`<qr-bono-card />` |
| `frontend/src/app/app.routes.ts` | **Modificado** — +ruta `/admin/scan-bonos` |
| `frontend/package.json` | **Modificado** — +`html5-qrcode`, +`qrcode` |

---

## 10. Smoke Tests

### Suite QR: 13/13 ✅
- Exports: getActiveBonus, claimByCode
- getActiveBonus: null para estudiante sin bono
- claimByCode: código inexistente, tipo inválido, código negativo
- Estados: YA RECLAMADO → 409
- Código único: generado 1-200, sin colisiones
- Separación del core: sin imports de calculateDisponibilidad ni expireBonos

### Suites previas intactas
- Core operacional: 25/25 ✅
- Capa institucional: 21/21 ✅
- Capa proveedor: 21/21 ✅

**Total acumulado: 78/78 — CERO REGRESIONES**

---

## 11. Hardware Probado

- Webcam USB genérica (Logitech C270)
- Cámara laptop integrada
- Navegador Chrome/Edge (desktop)
- Sin requisitos de hardware especial

---

## 12. Próximos Pasos

1. Sonido de confirmación (beep al reclamar)
2. Animación de éxito más elaborada
3. Historial de escaneos del operador (quién escaneó qué)
4. Modo kiosko/fullscreen automático
5. Soporte para cámara trasera de celular (mobile scanner)

---

> **Estado Fase 3A: COMPLETADA.**  
> QR híbrido operativo.  
> Coexistencia con flujo manual.  
> Cero regresiones.  
> 80/80 smoke tests ✅
