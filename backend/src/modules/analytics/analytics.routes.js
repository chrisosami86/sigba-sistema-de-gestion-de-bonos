const express = require("express");
const router = express.Router();

const { authenticateAdmin } = require("../../middlewares/auth");
const analyticsController = require("./analytics.controller");

router.get("/", authenticateAdmin, analyticsController.getAnalytics);

module.exports = router;
