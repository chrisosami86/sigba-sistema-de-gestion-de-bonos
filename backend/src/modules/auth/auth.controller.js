
const authService = require("./auth.service");

const loginStudent = async (req, res) => {
  try {
    const student = await authService.loginStudent(req.body);

    res.status(200).json({
      message: "Login exitoso",
      student,
    });
  } catch (error) {
    console.error(error);

    res.status(401).json({
      message: error.message,
    });
  }
};

const loginAdmin = async (req, res) => {
  try {
    const admin = await authService.loginAdmin(req.body);

    res.status(200).json({
      message: "Login exitoso",
      admin,
    });
  } catch (error) {
    console.error(error);

    res.status(401).json({
      message: error.message,
    });
  }
};

const recoverStudentPassword = async (req, res) => {
  try {
    const result = await authService.recoverStudentPassword(req.body);

    res.status(200).json({
      message: result.sent
        ? "Correo de recuperacion enviado"
        : "Solicitud recibida, pero el correo SMTP no esta configurado",
      result,
    });
  } catch (error) {
    console.error(error);

    res.status(400).json({
      message: error.message,
    });
  }
};

const recoverAdminPassword = async (req, res) => {
  try {
    const result = await authService.recoverAdminPassword(req.body);

    res.status(200).json({
      message: result.sent
        ? "Correo de recuperacion enviado"
        : "Solicitud recibida, pero el correo SMTP no esta configurado",
      result,
    });
  } catch (error) {
    console.error(error);

    res.status(400).json({
      message: error.message,
    });
  }
};

const changeAdminPassword = async (req, res) => {
  try {
    const result = await authService.changeAdminPassword(req.body);

    res.status(200).json(result);
  } catch (error) {
    console.error(error);

    res.status(400).json({
      message: error.message,
    });
  }
};

module.exports = {
  loginStudent,
  loginAdmin,
  recoverStudentPassword,
  recoverAdminPassword,
  changeAdminPassword,
};
