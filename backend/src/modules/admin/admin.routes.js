const express = require('express');
const router = express.Router();
const { authenticateAdmin } = require('../../middlewares/auth');
const adminController = require('./admin.controller');

// Todas las rutas requieren autenticación admin
router.post('/asignar', authenticateAdmin, adminController.asignarBono);
router.get('/base', authenticateAdmin, adminController.getBaseAdministrativa);
router.get('/asignaciones', authenticateAdmin, adminController.getAsignaciones);
router.get('/asignaciones/:id', authenticateAdmin, adminController.getAsignacionById);

module.exports = router;
