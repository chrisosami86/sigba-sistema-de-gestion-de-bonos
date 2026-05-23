const authService = require("./auth.service");

const loginStudent = async (req, res) => {
  try {
    const result = await authService.loginStudent(req.body);

    res.status(200).json({
      message: "Login exitoso",
      token: result.token,
      student: result.student,
    });
  } catch (error) {
    console.error(error);

    const status = error.message.includes("inactiva") ? 403 : 401;
    res.status(status).json({
      message: error.message,
    });
  }
};

const changeStudentPassword = async (req, res) => {
  try {
    const result = await authService.changeStudentPassword(
      req.student.id,
      req.body,
    );

    res.status(200).json(result);
  } catch (error) {
    console.error(error);

    res.status(400).json({
      message: error.message,
    });
  }
};

const loginAdmin = async (req, res) => {
  try {
    const result = await authService.loginAdmin(req.body);

    res.status(200).json({
      message: "Login exitoso",
      token: result.token,
      admin: result.admin,
    });
  } catch (error) {
    console.error(error);

    res.status(401).json({
      message: error.message,
    });
  }
};

const changeAdminPassword = async (req, res) => {
  try {
    const result = await authService.changeAdminPassword(
      req.admin.id,
      req.body,
    );

    res.status(200).json(result);
  } catch (error) {
    console.error(error);

    res.status(400).json({
      message: error.message,
    });
  }
};

const recoverStudentPassword = async (req, res) => {
  try {
    const result = await authService.recoverStudentPassword(req.body);

    res.status(200).json({
      message: result.message,
    });
  } catch (error) {
    console.error(error);

    const status = error.message.includes("inactiva") ? 403 : 400;
    res.status(status).json({
      message: error.message,
    });
  }
};

const recoverAdminPassword = async (req, res) => {
  try {
    const result = await authService.recoverAdminPassword(req.body);

    res.status(200).json({
      message: result.message,
    });
  } catch (error) {
    console.error(error);

    res.status(400).json({
      message: error.message,
    });
  }
};

module.exports = {
  loginStudent,
  changeStudentPassword,
  loginAdmin,
  changeAdminPassword,
  recoverStudentPassword,
  recoverAdminPassword,
};
