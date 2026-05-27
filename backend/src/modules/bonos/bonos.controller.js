const bonosService = require("./bonos.service");
const adminAssignmentService = require("./bonos.admin-assignment.service");
const qrService = require("./qr.service");
const googleSheetsService = require("../googleSheets/googleSheets.service");
const pool = require("../../config/db");
const { getBogotaDateTime } = require("../../shared/helpers/timezone.helper");
const { BOGOTA } = require("../../shared/helpers/sql-timezone.helper");

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
    const syncResult = await sincronizarRedencionGoogle(bono);

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

// ─────────────────────────────────────
// QR — Bono activo del estudiante
// ─────────────────────────────────────

const getActiveStudentBonus = async (req, res) => {
  try {
    const studentId = req.student?.id || req.user?.id;

    if (!studentId) {
      return res.status(403).json({ message: "Autenticacion requerida" });
    }

    const active = await qrService.getActiveBonus(studentId);

    if (!active) {
      return res.json({ hasActive: false, bono: null });
    }

    res.json({ hasActive: true, bono: active, qrContent: `SIGBA|${active.tipo.toUpperCase()}|${active.codigoBono}` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

// ─────────────────────────────────────
// QR — Reclamar bono por código (admin)
// ─────────────────────────────────────

const claimByQr = async (req, res) => {
  try {
    const { codigoBono, tipo } = req.body;
    const adminId = req.admin?.id || null;

    // 1. Resolver redencion desde el QR
    const resolved = await qrService.resolveByCode(codigoBono, tipo);

    // 2. Reclamar usando el flujo oficial (claimBono)
    const bono = await bonosService.claimBono(resolved.id, codigoBono);

    // 3. Sincronizar Google Sheets
    const syncResult = await sincronizarRedencionGoogle(bono);

    // 4. Datos del estudiante para la respuesta
    const studentData = await getStudentDataForSync(bono.student_id);

    res.json({
      message: "BONO RECLAMADO",
      bono,
      student: {
        id: bono.student_id,
        codigo: studentData.codigo,
        nombre: studentData.nombre,
      },
      sync: syncResult,
    });
  } catch (error) {
    const statusCode = getQrStatusCode(error);
    res.status(statusCode).json({ message: error.message });
  }
};

const getQrStatusCode = (error) => {
  const message = error.message || "";
  if (message.includes("no puede reclamarse") || message.includes("YA RECLAMADO")) return 409;
  if (message.includes("ya expiro") || message.includes("BONO EXPIRADO")) return 410;
  if (message.includes("invalido") || message.includes("no encontrado")) return 400;
  return 500;
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

  if (message.includes("no puede reclamarse")) {
    return 409;
  }

  if (message.includes("ya expiro")) {
    return 410;
  }

  if (message.includes("inactivo")) {
    return 403;
  }

  if (message.includes("no encontrada") || message.includes("no encontrado")) {
    return 404;
  }

  return 500;
};

// ─────────────────────────────────────
// Google Sheets — sincronización compartida (manual + QR)
// ─────────────────────────────────────

const sincronizarRedencionGoogle = async (bono) => {
  const result = { sincronizado: false, error: null };

  try {
    const studentData = await getStudentDataForSync(bono.student_id);
    const tipoBonoResult = await getTipoBonoFromRedencion(bono.id);

    await googleSheetsService.appendRedencion({
      fechaHora: getBogotaDateTime().replace('T', ' '),
      codigo: studentData.codigo,
      documento: studentData.numero_documento,
      nombre: studentData.nombre,
      email: studentData.correo || '',
      programa: `${studentData.programa_codigo} - ${studentData.programa_nombre}`,
      recibo: tipoBonoResult.tipo,
      codBono: String(bono.codigo_bono),
    });

    await pool.query(
      `UPDATE redenciones SET sincronizado_google = true, fecha_sincronizacion = ${BOGOTA.timestamp} WHERE id = $1`,
      [bono.id],
    );

    result.sincronizado = true;
  } catch (syncError) {
    console.error('Error al enviar a Google Sheets:', syncError.message);
    result.error = syncError.message;
  }

  return result;
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
  getEstadoSistema,
  getActiveStudentBonus,
  claimByQr,
};
