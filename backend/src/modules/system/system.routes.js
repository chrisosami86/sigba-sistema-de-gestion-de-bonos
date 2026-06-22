const express = require('express');
const router = express.Router();
const { authenticateAdmin } = require('../../middlewares/auth');

const systemController = require('./system.controller');

// Public health endpoint
router.get('/health', systemController.getHealth);

// Public operational status endpoint
router.get('/operational-status', systemController.getOperationalStatus);

// Admin-only system endpoints
router.get('/time', systemController.getServerTime);
router.get('/settings', authenticateAdmin, systemController.getSystemSettings);
router.patch('/settings', authenticateAdmin, systemController.updateSystemSettings);
router.get('/working-days', authenticateAdmin, systemController.getWorkingDays);
router.patch('/working-days', authenticateAdmin, systemController.updateWorkingDays);
router.get('/holidays', authenticateAdmin, systemController.getHolidays);
router.post('/holidays', authenticateAdmin, systemController.createHoliday);
router.put('/holidays/:id', authenticateAdmin, systemController.updateHoliday);
router.delete('/holidays/:id', authenticateAdmin, systemController.deleteHoliday);
router.get('/academic-periods', authenticateAdmin, systemController.getAcademicPeriods);
router.post('/academic-periods', authenticateAdmin, systemController.createAcademicPeriod);
router.get('/academic-periods/:id', authenticateAdmin, systemController.getAcademicPeriodById);
router.put('/academic-periods/:id', authenticateAdmin, systemController.updateAcademicPeriod);
router.post('/academic-periods/:id/activate', authenticateAdmin, systemController.activateAcademicPeriod);

module.exports = router;
