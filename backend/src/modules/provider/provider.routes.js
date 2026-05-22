const express = require('express');
const router = express.Router();
const { authenticateAdmin } = require('../../middlewares/auth');
const providerController = require('./provider.controller');

router.get('/resumen', authenticateAdmin, providerController.getResumen);
router.post('/conciliaciones', authenticateAdmin, providerController.registrarConciliacion);
router.get('/conciliaciones', authenticateAdmin, providerController.getConciliaciones);
router.get('/conciliaciones/:id', authenticateAdmin, providerController.getConciliacionById);
router.get('/exportar/resumen', authenticateAdmin, providerController.exportarResumen);
router.get('/exportar/conciliaciones', authenticateAdmin, providerController.exportarConciliaciones);

module.exports = router;
