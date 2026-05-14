const express = require('express');
const router = express.Router();
const { authenticateAdmin } = require('../../middlewares/auth');

const systemController = require('./system.controller');

// Admin-only system endpoints
router.get('/time', systemController.getServerTime);
router.get('/settings', authenticateAdmin, systemController.getSystemSettings);
router.patch('/settings', authenticateAdmin, systemController.updateSystemSettings);
router.get('/working-days', authenticateAdmin, systemController.getWorkingDays);
router.patch('/working-days', authenticateAdmin, systemController.updateWorkingDays);
router.get('/holidays', authenticateAdmin, systemController.getHolidays);
router.post('/holidays', authenticateAdmin, systemController.createHoliday);
router.delete('/holidays/:id', authenticateAdmin, systemController.deleteHoliday);

module.exports = router;
