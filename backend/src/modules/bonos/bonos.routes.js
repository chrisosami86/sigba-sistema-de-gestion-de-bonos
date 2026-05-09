const express = require('express');
const router = express.Router();

const bonosController = require('./bonos.controller');

router.post('/solicitar', bonosController.requestBono);

router.patch('/reclamar/:id', bonosController.claimBono);

router.get('/disponibilidad/:tipo', bonosController.getDisponibilidad);

router.get('/student/:studentId', bonosController.getStudentBonos);

router.get('/admin/resumen-diario', bonosController.getResumenDiario);

router.get('/admin/stats-diarias', bonosController.getStatsDiarias);

router.patch('/liberar', bonosController.liberarBonos);

router.patch('/extra', bonosController.cargarBonosExtra);

router.patch('/base', bonosController.establecerCantidadBase);

router.get('/estado/:tipo', bonosController.getEstadoSistema);


module.exports = router;
