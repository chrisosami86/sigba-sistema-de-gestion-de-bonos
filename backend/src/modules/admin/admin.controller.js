const adminService = require("./admin.service");
const adminAssignmentService = require("../bonos/bonos.admin-assignment.service");

const asignarBono = async (req, res) => {
  try {
    const { tipo, studentId, codigoBono, motivo } = req.body;

    const result = await adminService.asignarBono({
      tipo,
      studentId,
      codigoBono,
      motivo,
      adminId: req.admin.id,
      adminNombre: req.admin.nombre,
    });

    res.status(201).json({
      message: "Asignacion administrativa registrada correctamente",
      bono: result.redencion,
      baseAdministrativa: result.baseAdministrativa,
      tipo_asignacion: result.redencion.tipo_asignacion,
      student: result.student,
    });
  } catch (error) {
    const statusCode = getStatusCode(error);
    res.status(statusCode).json({ message: error.message });
  }
};

const getBaseAdministrativa = async (_req, res) => {
  try {
    const base = await adminAssignmentService.getBaseAdministrativa();
    res.json(base);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getAsignaciones = async (req, res) => {
  try {
    const result = await adminService.getAsignaciones(req.query);
    res.json(result);
  } catch (error) {
    const statusCode = getStatusCode(error);
    res.status(statusCode).json({ message: error.message });
  }
};

const getAsignacionById = async (req, res) => {
  try {
    const { id } = req.params;
    const asignacion = await adminService.getAsignacionById(id);
    res.json(asignacion);
  } catch (error) {
    const statusCode = getStatusCode(error);
    res.status(statusCode).json({ message: error.message });
  }
};

const getStatusCode = (error) => {
  const message = error.message || "";

  if (
    message.includes("invalido") ||
    message.includes("cantidad") ||
    message.includes("codigo") ||
    message.includes("obligatorio") ||
    message.includes("ya tiene") ||
    message.includes("No hay base administrativa") ||
    message.includes("reserva o reclamo")
  ) {
    return 400;
  }

  if (message.includes("inactivo")) {
    return 403;
  }

  if (message.includes("no encontrada") || message.includes("no encontrado")) {
    return 404;
  }

  return 500;
};

module.exports = {
  asignarBono,
  getBaseAdministrativa,
  getAsignaciones,
  getAsignacionById,
};
