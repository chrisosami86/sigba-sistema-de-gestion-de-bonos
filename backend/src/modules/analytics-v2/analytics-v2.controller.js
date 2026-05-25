const { getDashboard } = require("./analytics-v2.service");

const getInstitutionalDashboard = async (req, res) => {
  try {
    const data = await getDashboard(req.query);
    res.json(data);
  } catch (error) {
    console.error("[analytics-v2] error:", error.message);
    res.status(500).json({ error: "Error al generar dashboard institucional." });
  }
};

module.exports = { getInstitutionalDashboard };
