const express = require('express');
const router = express.Router();
const { authenticateStudent, authenticateAdmin, authenticate } = require('../../middlewares/auth');

const bonosController = require('./bonos.controller');

// Shared endpoints (any valid JWT)
router.get('/disponibilidad/:tipo', authenticate, bonosController.getDisponibilidad);
router.get('/estado/:tipo', authenticate, bonosController.getEstadoSistema);

// Student-only endpoints
router.post('/solicitar', authenticateStudent, bonosController.requestBono);
router.get('/student/:studentId', authenticateStudent, bonosController.getStudentBonos);

// Admin-only endpoints
router.get('/admin/resumen-diario', authenticateAdmin, bonosController.getResumenDiario);
router.get('/admin/stats-diarias', authenticateAdmin, bonosController.getStatsDiarias);
router.get('/admin/asignaciones/base', authenticateAdmin, bonosController.getBaseAdministrativa);
router.post('/admin/asignaciones', authenticateAdmin, bonosController.asignarAdministrativamente);
router.patch('/liberar', authenticateAdmin, bonosController.liberarBonos);
router.patch('/extra', authenticateAdmin, bonosController.cargarBonosExtra);
router.patch('/base', authenticateAdmin, bonosController.establecerCantidadBase);
router.patch('/reclamar/:id', authenticateAdmin, bonosController.claimBono);

module.exports = router;
