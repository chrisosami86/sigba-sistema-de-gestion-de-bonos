const bonosService = require("./bonos.service");

const requestBono = async (req, res) => {
  try {

    const { studentId, tipo } = req.body;

    const bono = await bonosService.requestBono(studentId, tipo);

    res.json({
      message: "Solicitud recibida",
      bono
    });

  } catch (error) {

    console.error(error);

    res.status(getStatusCode(error)).json({
      message: error.message,
    });

  }
};

const claimBono = async (req, res) => {

  try {

    const { id } = req.params;

    const bono = await bonosService.claimBono(id);

    res.json({
      message: 'Bono reclamado correctamente',
      bono
    });

  } catch (error) {

    console.error(error);

    res.status(getStatusCode(error)).json({
      message: error.message
    });

  }

};

const getDisponibilidad = async (req, res) => {

  try {

    const { tipo } = req.params;

    const disponibilidad =
      await bonosService.getDisponibilidad(tipo);

    res.json(disponibilidad);

  } catch (error) {

    console.error(error);

    res.status(getStatusCode(error)).json({
      message: error.message
    });

  }

};

const getStudentBonos = async (req, res) => {
  try {

    const { studentId } = req.params;

    const bonos = await bonosService.getStudentBonos(studentId);

    res.status(200).json(bonos);

  } catch (error) {

    console.error(error);

    res.status(getStatusCode(error)).json({
      message: error.message
    });

  }
};

const liberarBonos = async (req, res) => {
  try {

    const { tipo, cantidad } = req.body;

    const bono = await bonosService.liberarBonos(
      tipo,
      cantidad
    );

    res.status(200).json({
      message: 'Bonos liberados correctamente',
      bono
    });

  } catch (error) {

    console.error(error);

    res.status(getStatusCode(error)).json({
      message: error.message
    });

  }
};

const getResumenDiario = async (req, res) => {
  try {

    const resumen = await bonosService.getResumenDiario(req.query);

    res.status(200).json(resumen);

  } catch (error) {

    console.error(error);

    res.status(getStatusCode(error)).json({
      message: error.message
    });

  }
};

const getStatsDiarias = async (req, res) => {
  try {

    const stats = await bonosService.getStatsDiarias();

    res.status(200).json(stats);

  } catch (error) {

    console.error(error);

    res.status(getStatusCode(error)).json({
      message: error.message
    });

  }
};

const cargarBonosExtra = async (req, res) => {
  try {

    const { tipo, cantidad } = req.body;

    const bono = await bonosService.cargarBonosExtra(
      tipo,
      cantidad
    );

    res.status(200).json({
      message: 'Carga extra registrada correctamente',
      bono
    });

  } catch (error) {

    console.error(error);

    res.status(getStatusCode(error)).json({
      message: error.message
    });

  }
};

const establecerCantidadBase = async (req, res) => {
  try {

    const { tipo, cantidad } = req.body;

    const bono = await bonosService.establecerCantidadBase(
      tipo,
      cantidad
    );

    res.status(200).json({
      message: 'Cantidad base actualizada correctamente',
      bono
    });

  } catch (error) {

    console.error(error);

    res.status(getStatusCode(error)).json({
      message: error.message
    });

  }
};

const getEstadoSistema = async (req, res) => {
  try {

    const { tipo } = req.params;

    const estado =
      bonosService.getEstadoSistema(tipo);

    res.status(200).json(estado);

  } catch (error) {

    console.error(error);

    res.status(getStatusCode(error)).json({
      message: error.message
    });

  }
};

const getStatusCode = (error) => {
  const message = error.message || "";

  if (
    message.includes("invalido") ||
    message.includes("cantidad") ||
    message.includes("fuera de horario") ||
    message.includes("bloqueado") ||
    message.includes("subsidio") ||
    message.includes("No hay bonos") ||
    message.includes("Solo hay") ||
    message.includes("pendientes") ||
    message.includes("ya tiene")
  ) {
    return 400;
  }

  if (message.includes("no encontrada") || message.includes("no encontrado")) {
    return 404;
  }

  return 500;
};

module.exports = {
  requestBono,
  claimBono,
  getDisponibilidad,
  getStudentBonos,
  getResumenDiario,
  getStatsDiarias,
  liberarBonos,
  cargarBonosExtra,
  establecerCantidadBase,
  getEstadoSistema
};
