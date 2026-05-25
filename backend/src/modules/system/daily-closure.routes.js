const express = require('express');
const router = express.Router();
const { authenticateAdmin } = require('../../middlewares/auth');
const dailyClosureController = require('./daily-closure.controller');

router.get('/resumen', authenticateAdmin, dailyClosureController.getResumenCierre);
router.post('/confirmar', authenticateAdmin, dailyClosureController.confirmarCierre);
router.get('/historial', authenticateAdmin, dailyClosureController.getConfirmaciones);

module.exports = router;
