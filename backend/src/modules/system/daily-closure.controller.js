const dailyClosureService = require("./daily-closure.service");
const { getBogotaDate } = require("../../shared/helpers/timezone.helper");

const getResumenCierre = async (req, res) => {
  try {
    const { fecha } = req.query;
    const resumen = await dailyClosureService.getResumenCierre(fecha);
    res.json(resumen);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const confirmarCierre = async (req, res) => {
  try {
    const { fecha, observaciones } = req.body;

    const fechaValida = fecha || getBogotaDate();

    const confirmacion = await dailyClosureService.confirmarCierre(
      fechaValida,
      req.admin.id,
      req.admin.nombre,
      observaciones
    );

    res.status(200).json({
      message: "Cierre diario confirmado correctamente",
      confirmacion,
    });
  } catch (err) {
    const statusCode = err.message.includes("ya fue confirmado") ? 409 : 500;
    res.status(statusCode).json({ message: err.message });
  }
};

const getConfirmaciones = async (req, res) => {
  try {
    const result = await dailyClosureService.getConfirmaciones(req.query);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getResumenCierre,
  confirmarCierre,
  getConfirmaciones,
};
