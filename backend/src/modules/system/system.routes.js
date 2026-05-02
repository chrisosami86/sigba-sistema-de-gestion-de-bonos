
const express = require('express');
const router = express.Router();

const systemController = require('./system.controller');


router.get('/', systemController.getServerTime);

module.exports = router;