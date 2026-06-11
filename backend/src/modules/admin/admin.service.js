const pool = require("../../config/db");
const { isWorkingDay } = require("../../shared/helpers/workingDay.helper");
const adminAssignmentService = require("../bonos/bonos.admin-assignment.service");
const { sincronizarRedencionGoogle } = require("../bonos/bonos-google-sync.service");
const { info, error } = require("../../shared/helpers/logger.helper");

const VALID_BONO_TYPES = ["almuerzo", "refrigerio"];

const validateTipo = (tipo) => {
  const normalizedTipo = String(tipo || "").toLowerCase();
  if (!VALID_BONO_TYPES.includes(normalizedTipo)) {
    throw new Error("Tipo de bono invalido");
  }
  return normalizedTipo;
};

const validateStudentId = (studentId) => {
  if (!studentId || Number.isNaN(Number(studentId))) {
    throw new Error("Estudiante invalido");
  }
};

const validateCodigoBono = (codigoBono) => {
  const codigoNumerico = Number(codigoBono);
  if (!Number.isInteger(codigoNumerico) || codigoNumerico <= 0) {
    throw new Error("El codigo del bono debe ser un numero entero positivo");
  }
  return codigoNumerico;
};

// ─────────────────────────────────────
// Asignar bono administrativo (wrapper institucional)
// ─────────────────────────────────────

const asignarBono = async ({ tipo, studentId, codigoBono, motivo, adminId, adminNombre }) => {
  validateTipo(tipo);
  validateStudentId(studentId);
  const codigoNumerico = validateCodigoBono(codigoBono);

  if (!motivo || String(motivo).trim() === "") {
    throw new Error("El motivo de la asignacion es obligatorio");
  }

  const workingDayCheck = await isWorkingDay();
  if (!workingDayCheck.isWorking) {
    throw new Error(workingDayCheck.reason);
  }

  const result = await adminAssignmentService.asignarAdministrativamente({
    tipo,
    studentId,
    codigoBono: codigoNumerico,
    motivo,
    adminId,
  });

  await sincronizarRedencionGoogle(result.redencion);

  info("[admin.asignarBono]", {
    adminId,
    adminNombre,
    tipo,
    studentId,
    codigoBono: codigoNumerico,
    redencionId: result.redencion.id,
    baseRestante: result.baseAdministrativa.disponible - 1,
  });

  return result;
};

// ─────────────────────────────────────
// Historial administrativo filtrable
// ─────────────────────────────────────

const getAsignaciones = async ({
  fechaDesde,
  fechaHasta,
  tipo,
  studentId,
  adminId,
  codigoBono,
  page = 1,
  limit = 20,
}) => {
  const pageNum = Math.max(1, Number(page));
  const limitNum = Math.min(100, Math.max(1, Number(limit)));
  const offset = (pageNum - 1) * limitNum;

  const conditions = ["r.tipo_asignacion = 'ADMINISTRATIVA'"];
  const params = [];
  let paramIndex = 1;

  if (fechaDesde) {
    conditions.push(`bd.fecha >= $${paramIndex}`);
    params.push(fechaDesde);
    paramIndex++;
  }
  if (fechaHasta) {
    conditions.push(`bd.fecha <= $${paramIndex}`);
    params.push(fechaHasta);
    paramIndex++;
  }
  if (tipo) {
    const normalizedTipo = validateTipo(tipo);
    conditions.push(`cb.tipo = $${paramIndex}`);
    params.push(normalizedTipo);
    paramIndex++;
  }
  if (studentId) {
    validateStudentId(studentId);
    conditions.push(`r.student_id = $${paramIndex}`);
    params.push(Number(studentId));
    paramIndex++;
  }
  if (adminId) {
    conditions.push(`r.admin_id = $${paramIndex}`);
    params.push(Number(adminId));
    paramIndex++;
  }
  if (codigoBono) {
    conditions.push(`r.codigo_bono = $${paramIndex}`);
    params.push(Number(codigoBono));
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countQuery = `
    SELECT COUNT(*)::int AS total
    FROM redenciones r
    JOIN bonos_diarios bd ON bd.id = r.bono_diario_id
    JOIN config_bonos cb ON cb.id = bd.config_bono_id
    ${whereClause}
  `;
  const countResult = await pool.query(countQuery, params);
  const total = Number(countResult.rows[0].total);
  const totalPages = Math.ceil(total / limitNum);

  const dataQuery = `
    SELECT
      r.id,
      r.student_id AS "studentId",
      s.codigo AS "studentCodigo",
      s.nombre AS "studentNombre",
      s.programa_codigo AS "studentProgramaCodigo",
      s.programa_nombre AS "studentProgramaNombre",
      cb.tipo,
      bd.fecha::text AS fecha,
      r.estado,
      r.tipo_asignacion AS "tipoAsignacion",
      r.codigo_bono AS "codigoBono",
      r.hora_reclamo AS "horaReclamo",
      r.admin_id AS "adminId",
      COALESCE(a.nombre, 'Sistema') AS "adminNombre",
      r.motivo_asignacion AS "motivo",
      r.modalidad_operacional AS "modalidadOperacional",
      r.created_at AS "createdAt"
    FROM redenciones r
    JOIN bonos_diarios bd ON bd.id = r.bono_diario_id
    JOIN config_bonos cb ON cb.id = bd.config_bono_id
    JOIN students s ON s.id = r.student_id
    LEFT JOIN admins a ON a.id = r.admin_id
    ${whereClause}
    ORDER BY r.created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  const dataResult = await pool.query(dataQuery, [...params, limitNum, offset]);

  return {
    page: pageNum,
    limit: limitNum,
    total,
    totalPages,
    rows: dataResult.rows,
  };
};

// ─────────────────────────────────────
// Detalle de una asignación
// ─────────────────────────────────────

const getAsignacionById = async (id) => {
  const query = `
    SELECT
      r.id,
      r.student_id AS "studentId",
      s.codigo AS "studentCodigo",
      s.nombre AS "studentNombre",
      s.programa_codigo AS "studentProgramaCodigo",
      s.programa_nombre AS "studentProgramaNombre",
      s.activo AS "studentActivo",
      cb.tipo,
      bd.fecha::text AS fecha,
      r.estado,
      r.tipo_asignacion AS "tipoAsignacion",
      r.codigo_bono AS "codigoBono",
      r.hora_solicitud AS "horaSolicitud",
      r.hora_reclamo AS "horaReclamo",
      r.expiracion_at AS "expiracionAt",
      r.admin_id AS "adminId",
      COALESCE(a.nombre, 'Sistema') AS "adminNombre",
      a.correo AS "adminCorreo",
      r.motivo_asignacion AS "motivo",
      r.modalidad_operacional AS "modalidadOperacional",
      r.created_at AS "createdAt",
      r.updated_at AS "updatedAt",
      bd.cantidad_base AS "cantidadBase",
      bd.cantidad_extra AS "cantidadExtra"
    FROM redenciones r
    JOIN bonos_diarios bd ON bd.id = r.bono_diario_id
    JOIN config_bonos cb ON cb.id = bd.config_bono_id
    JOIN students s ON s.id = r.student_id
    LEFT JOIN admins a ON a.id = r.admin_id
    WHERE r.id = $1 AND r.tipo_asignacion = 'ADMINISTRATIVA'
  `;

  const result = await pool.query(query, [id]);

  if (result.rows.length === 0) {
    throw new Error("Asignacion administrativa no encontrada");
  }

  return result.rows[0];
};

module.exports = {
  asignarBono,
  getAsignaciones,
  getAsignacionById,
};
