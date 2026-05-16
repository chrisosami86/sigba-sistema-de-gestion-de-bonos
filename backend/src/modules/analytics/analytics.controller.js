const analyticsService = require("./analytics.service");

const getAnalytics = async (req, res) => {
  try {
    const {
      fechaInicio,
      fechaFin,
      tipo,
      dia,
    } = req.query;

    const data = await analyticsService.getAnalytics({
      fechaInicio,
      fechaFin,
      tipo,
      dia,
    });

    res.json(data);
  } catch (error) {
    console.error("Error en analytics:", error);
    res.status(500).json({ message: "Error obteniendo analiticas" });
  }
};

module.exports = { getAnalytics };
