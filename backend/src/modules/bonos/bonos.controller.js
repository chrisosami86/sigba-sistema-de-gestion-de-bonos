const bonosService = require("./bonos.service");

const requestBono = async (req, res) => {
  try {

    console.log('BODY RECIBIDO:', req.body);

    const { studentId, tipo } = req.body;

    console.log('TIPO RECIBIDO:', tipo);

    await bonosService.requestBono(studentId, tipo);

    res.json({
      message: "Solicitud recibida",
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Error solicitando bono",
    });

  }
};




module.exports = {
  requestBono,
};
