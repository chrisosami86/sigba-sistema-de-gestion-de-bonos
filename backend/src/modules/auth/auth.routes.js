
const express = require("express");
const router = express.Router();

const authController = require("./auth.controller");

router.post("/students/login", authController.loginStudent);

router.post("/admins/login", authController.loginAdmin);

router.post("/students/recover-password", authController.recoverStudentPassword);

router.post("/admins/recover-password", authController.recoverAdminPassword);

module.exports = router;
