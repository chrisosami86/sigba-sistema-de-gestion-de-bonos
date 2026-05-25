const express = require('express');
const router = express.Router();
const { authenticateStudent, authenticateAdmin, authenticate } = require('../../middlewares/auth');
const { requireOperationalDay } = require('../system/operational-calendar.helper');

const bonosController = require('./bonos.controller');

// Shared endpoints (any valid JWT)
router.get('/disponibilidad/:tipo', authenticate, bonosController.getDisponibilidad);
router.get('/estado/:tipo', authenticate, bonosController.getEstadoSistema);

// Student-only endpoints
router.post('/solicitar', authenticateStudent, requireOperationalDay, bonosController.requestBono);
router.get('/student/:studentId', authenticateStudent, bonosController.getStudentBonos);
router.get('/mis-bonos-activos', authenticateStudent, bonosController.getActiveStudentBonus);

// Admin-only endpoints
router.get('/admin/resumen-diario', authenticateAdmin, bonosController.getResumenDiario);
router.get('/admin/stats-diarias', authenticateAdmin, bonosController.getStatsDiarias);
router.get('/admin/asignaciones/base', authenticateAdmin, bonosController.getBaseAdministrativa);
router.post('/admin/asignaciones', authenticateAdmin, requireOperationalDay, bonosController.asignarAdministrativamente);
router.patch('/liberar', authenticateAdmin, requireOperationalDay, bonosController.liberarBonos);
router.patch('/extra', authenticateAdmin, requireOperationalDay, bonosController.cargarBonosExtra);
router.patch('/base', authenticateAdmin, requireOperationalDay, bonosController.establecerCantidadBase);
router.patch('/reclamar/:id', authenticateAdmin, requireOperationalDay, bonosController.claimBono);

// QR endpoints
router.post('/claim-qr', authenticateAdmin, requireOperationalDay, bonosController.claimByQr);

module.exports = router;
