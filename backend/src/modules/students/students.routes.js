const express = require('express');
const multer = require('multer');
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const studentController = require('./students.controller');

router.get('/', studentController.getStudents);

router.post('/import/students', upload.single('file'), studentController.importStudents);

router.post('/import/subsidies', upload.single('file'), studentController.importSubsidies);

router.get('/:id', studentController.getStudentById);

router.post('/', studentController.createStudent);

router.patch('/:id', studentController.updateStudent);

router.delete('/:id', studentController.deleteStudent);


module.exports = router;
