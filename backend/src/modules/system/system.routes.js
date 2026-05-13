const express = require("express");
const router = express.Router();

const systemController = require("./system.controller");

router.get("/", systemController.getServerTime);

// ── System Settings ──
router.get("/settings", systemController.getSystemSettings);
router.patch("/settings", systemController.updateSystemSettings);

// ── Working Days ──
router.get("/working-days", systemController.getWorkingDays);
router.patch("/working-days", systemController.updateWorkingDays);

// ── Holidays ──
router.get("/holidays", systemController.getHolidays);
router.post("/holidays", systemController.createHoliday);
router.delete("/holidays/:id", systemController.deleteHoliday);

module.exports = router;
