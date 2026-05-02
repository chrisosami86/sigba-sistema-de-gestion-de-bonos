
const systemService = require('./system.service');


const getServerTime = async (req, res) => {
  try {
    const serverTime = await systemService.getServerTime();
    res.json(serverTime);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error obteniendo hora' });
  }
};

module.exports = {
  getServerTime
};
