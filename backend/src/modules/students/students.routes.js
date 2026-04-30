
const express = require('express');
const router = express.Router();

const studentController = require('./students.controller');

router.post('/', studentController.createStudent);

module.exports = router;