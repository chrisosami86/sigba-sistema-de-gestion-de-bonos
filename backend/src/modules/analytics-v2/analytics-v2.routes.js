const express = require("express");
const router = express.Router();
const controller = require("./analytics-v2.controller");
const { authenticateAdmin } = require("../../middlewares/auth");

router.get("/dashboard", authenticateAdmin, controller.getInstitutionalDashboard);

module.exports = router;
