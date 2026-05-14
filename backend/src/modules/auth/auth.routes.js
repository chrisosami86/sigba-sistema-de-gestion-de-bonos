const express = require("express");
const router = express.Router();
const { authenticateStudent, authenticateAdmin } = require("../../middlewares/auth");

const authController = require("./auth.controller");

// Publicas
router.post("/students/login", authController.loginStudent);
router.post("/admins/login", authController.loginAdmin);
router.post("/students/recover-password", authController.recoverStudentPassword);
router.post("/admins/recover-password", authController.recoverAdminPassword);

// Protegidas
router.patch("/students/change-password", authenticateStudent, authController.changeStudentPassword);
router.patch("/admins/change-password", authenticateAdmin, authController.changeAdminPassword);

module.exports = router;
