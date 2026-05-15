const analyticsService = require("./analytics.service");

const getAnalytics = async (req, res) => {
  try {
    const {
      periodo,
      fechaInicio,
      fechaFin,
      tipo,
      programa,
      agrupacion,
    } = req.query;

    const data = await analyticsService.getAnalytics({
      periodo,
      fechaInicio,
      fechaFin,
      tipo,
      programa,
      agrupacion,
    });

    res.json(data);
  } catch (error) {
    console.error("Error en analytics:", error);
    res.status(500).json({ message: "Error obteniendo analiticas" });
  }
};

module.exports = { getAnalytics };
