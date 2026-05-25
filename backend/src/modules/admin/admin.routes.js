const express = require('express');
const router = express.Router();
const { authenticateAdmin } = require('../../middlewares/auth');
const { requireOperationalDay } = require('../system/operational-calendar.helper');
const adminController = require('./admin.controller');

// Todas las rutas requieren autenticación admin
router.post('/asignar', authenticateAdmin, requireOperationalDay, adminController.asignarBono);
router.get('/base', authenticateAdmin, adminController.getBaseAdministrativa);
router.get('/asignaciones', authenticateAdmin, adminController.getAsignaciones);
router.get('/asignaciones/:id', authenticateAdmin, adminController.getAsignacionById);

module.exports = router;
