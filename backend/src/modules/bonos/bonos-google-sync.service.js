const pool = require("../../config/db");
const googleSheetsService = require("../googleSheets/googleSheets.service");
const { getBogotaDateTime } = require("../../shared/helpers/timezone.helper");
const { BOGOTA } = require("../../shared/helpers/sql-timezone.helper");

const sincronizarRedencionGoogle = async (bono) => {
  const result = { sincronizado: false, error: null };

  try {
    const studentData = await getStudentDataForSync(bono.student_id);
    const tipoBonoResult = await getTipoBonoFromRedencion(bono.id);

    await googleSheetsService.appendRedencion({
      fechaHora: getBogotaDateTime().replace("T", " "),
      codigo: studentData.codigo,
      documento: studentData.numero_documento,
      nombre: studentData.nombre,
      email: studentData.correo || "",
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
    console.error("Error al enviar a Google Sheets:", syncError.message);
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
  sincronizarRedencionGoogle,
  getStudentDataForSync,
};
