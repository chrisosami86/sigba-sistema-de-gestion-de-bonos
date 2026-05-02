
const express = require('express');
const router = express.Router();

const studentController = require('./students.controller');

router.get('/', studentController.getStudents);

router.get('/:id', studentController.getStudentById);

router.post('/', studentController.createStudent);

router.patch('/:id', studentController.updateStudent);

router.delete('/:id', studentController.deleteStudent);

module.exports = router;