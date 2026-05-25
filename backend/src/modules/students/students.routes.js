const express = require('express');
const multer = require('multer');
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const { authenticateAdmin } = require('../../middlewares/auth');
const { requireActivePeriod } = require('../system/operational-calendar.helper');

const studentController = require('./students.controller');

// Admin-only endpoints
router.get('/', authenticateAdmin, studentController.getStudents);
router.post('/import/students', authenticateAdmin, requireActivePeriod, upload.single('file'), studentController.importStudents);
router.post('/import/subsidies', authenticateAdmin, requireActivePeriod, upload.single('file'), studentController.importSubsidies);
router.get('/:id', authenticateAdmin, studentController.getStudentById);
router.get('/code/:codigo', authenticateAdmin, studentController.getStudentByCodigo);
router.post('/', authenticateAdmin, requireActivePeriod, studentController.createStudent);
router.patch('/:id', authenticateAdmin, requireActivePeriod, studentController.updateStudent);
router.patch('/:id/toggle-activo', authenticateAdmin, requireActivePeriod, studentController.toggleStudentActivo);
router.delete('/:id', authenticateAdmin, requireActivePeriod, studentController.deleteStudent);

module.exports = router;
