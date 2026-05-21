const bonosService = require("./bonos.service");
const adminAssignmentService = require("./bonos.admin-assignment.service");
const googleSheetsService = require("../googleSheets/googleSheets.service");
const pool = require("../../config/db");

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
    const { codigoBono } = req.body;

    const bono = await bonosService.claimBono(id, codigoBono);

    let syncResult = { sincronizado: false, error: null };

    try {
      const studentData = await getStudentDataForSync(bono.student_id);
      const tipoBonoResult = await getTipoBonoFromRedencion(bono.id);

      await googleSheetsService.appendRedencion({
        fechaHora: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
        codigo: studentData.codigo,
        documento: studentData.numero_documento,
        nombre: studentData.nombre,
        email: studentData.correo || '',
        programa: `${studentData.programa_codigo} - ${studentData.programa_nombre}`,
        recibo: tipoBonoResult.tipo,
        codBono: String(bono.codigo_bono),
      });

      await pool.query(
        `UPDATE redenciones SET sincronizado_google = true, fecha_sincronizacion = NOW() WHERE id = $1`,
        [bono.id],
      );

      syncResult.sincronizado = true;
    } catch (syncError) {
      console.error('Error al enviar a Google Sheets:', syncError.message);
      syncResult.error = syncError.message;
    }

    res.json({
      message: 'Bono reclamado correctamente',
      bono,
      sync: syncResult,
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

const getBaseAdministrativa = async (req, res) => {
  try {
    const baseAdministrativa = await adminAssignmentService.getBaseAdministrativa();

    res.status(200).json(baseAdministrativa);
  } catch (error) {
    console.error(error);

    res.status(getStatusCode(error)).json({
      message: error.message,
    });
  }
};

const asignarAdministrativamente = async (req, res) => {
  try {
    const { tipo, studentId, codigoBono, motivo } = req.body;

    const result = await adminAssignmentService.asignarAdministrativamente({
      tipo,
      studentId,
      codigoBono,
      motivo,
      adminId: req.admin.id,
    });

    res.status(201).json({
      message: "Asignacion administrativa registrada correctamente",
      bono: result.redencion,
      baseAdministrativa: result.baseAdministrativa,
      tipo_asignacion: result.redencion.tipo_asignacion,
      student: result.student,
    });
  } catch (error) {
    console.error(error);

    res.status(getStatusCode(error)).json({
      message: error.message,
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
      await bonosService.getEstadoSistema(tipo);

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
    message.includes("ya tiene") ||
    message.includes("codigo") ||
    message.includes("Debe ingresar") ||
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

const getStudentDataForSync = async (studentId) => {
  const query = `
    SELECT s.codigo, s.numero_documento, s.nombre, s.correo,
           s.programa_codigo, s.programa_nombre
    FROM students s
    WHERE s.id = $1
  `;

  const result = await pool.query(query, [studentId]);

  if (result.rows.length === 0) {
    throw new Error("Estudiante no encontrado para sincronizacion");
  }

  return result.rows[0];
};

const getTipoBonoFromRedencion = async (redencionId) => {
  const query = `
    SELECT cb.tipo
    FROM redenciones r
    JOIN bonos_diarios bd ON bd.id = r.bono_diario_id
    JOIN config_bonos cb ON cb.id = bd.config_bono_id
    WHERE r.id = $1
  `;

  const result = await pool.query(query, [redencionId]);

  if (result.rows.length === 0) {
    throw new Error("Redencion no encontrada");
  }

  return result.rows[0];
};

module.exports = {
  requestBono,
  claimBono,
  getDisponibilidad,
  getStudentBonos,
  getResumenDiario,
  getStatsDiarias,
  getBaseAdministrativa,
  asignarAdministrativamente,
  liberarBonos,
  cargarBonosExtra,
  establecerCantidadBase,
  getEstadoSistema
};
