const express = require('express');
const router = express.Router();

const bonosController = require('./bonos.controller');

router.post('/solicitar', bonosController.requestBono);


module.exports = router;