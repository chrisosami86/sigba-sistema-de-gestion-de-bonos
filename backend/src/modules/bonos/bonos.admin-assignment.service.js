const pool = require("../../config/db");
const { isWorkingDay } = require("../../shared/helpers/workingDay.helper");
const { log } = require("../../shared/helpers/logger.helper");
const { BOGOTA } = require("../../shared/helpers/sql-timezone.helper");

const TIPO_ASIGNACION_ADMINISTRATIVA = "ADMINISTRATIVA";
const VALID_BONO_TYPES = ["almuerzo", "refrigerio"];
let redencionesAssignmentColumnsReady = null;

const logAdminAssignment = (event, data = {}) => {
  log("[bonos.admin-assignment]", { event, ...data });
};

/**
 * Servicio preparado para asignacion administrativa.
 *
 * Este flujo aun no esta conectado a rutas ni frontend. Su proposito es dejar
 * aislada la capacidad futura sin alterar disponibilidad, liberacion, analytics
 * ni el lifecycle operativo actual.
 *
 * Base administrativa:
 *   expirados + no utilizados - asignaciones administrativas ya realizadas.
 *
 * Queries y locks:
 *   - getLockedBonoDiario bloquea la fila de bonos_diarios con FOR UPDATE.
 *   - getActiveStudentForAssignment valida estudiante existente/activo.
 *   - studentAlreadyConsumedToday impide asignar a quien tenga reserva o
 *     reclamo vigente del dia.
 *   - calculateBaseAdministrativa usa la fila bloqueada y conteos de redenciones
 *     del mismo bono_diario.
 *   - createAdminRedencion inserta una redencion terminal en estado reclamado.
 *
 * Riesgos de concurrencia conocidos:
 *   - La proteccion principal es el lock sobre bonos_diarios del dia/tipo.
 *   - La constraint legacy unique_student_bono_diario puede impedir una
 *     asignacion administrativa si el mismo estudiante ya tuvo redencion para
 *     ese bono_diario. No se cambia aqui para preservar compatibilidad.
 *   - Este servicio no modifica calculateDisponibilidad; por ahora solo prepara
 *     el flujo futuro de consumo de base administrativa.
 */
const asignarAdministrativamente = async ({
  tipo,
  studentId,
  codigoBono,
  adminId = null,
  motivo = null,
}) => {
  const normalizedTipo = validateTipo(tipo);
  validateStudentId(studentId);
  const codigoNumerico = validateCodigoBono(codigoBono);

  logAdminAssignment("entrada", {
    tipo: normalizedTipo,
    studentId,
    adminId,
    hasMotivo: Boolean(String(motivo || "").trim()),
  });

  const workingDayCheck = await isWorkingDay();
  if (!workingDayCheck.isWorking) {
    logAdminAssignment("validacion_fallida", {
      step: "dia_habil",
      reason: workingDayCheck.reason,
    });
    throw new Error(workingDayCheck.reason);
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await assertAssignmentSchemaReady(client);
    logAdminAssignment("validacion_ok", { step: "schema" });

    const bonoDiario = await getLockedBonoDiario(client, normalizedTipo);
    logAdminAssignment("lock_obtenido", {
      bonoDiarioId: bonoDiario.id,
      tipo: normalizedTipo,
    });

    const student = await getActiveStudentForAssignment(client, studentId);
    logAdminAssignment("validacion_ok", {
      step: "estudiante_activo",
      studentId: student.id,
      codigo: student.codigo,
    });

    const consumedToday = await studentAlreadyConsumedToday(client, studentId);

    if (consumedToday) {
      logAdminAssignment("validacion_fallida", {
        step: "consumo_previo",
        studentId,
      });
      throw new Error("El estudiante ya tiene una reserva o reclamo activo hoy");
    }

    const baseAdministrativa = await calculateBaseAdministrativa(client, bonoDiario.id);
    logAdminAssignment("base_calculada", {
      bonoDiarioId: bonoDiario.id,
      ...baseAdministrativa,
    });

    if (baseAdministrativa.disponible <= 0) {
      logAdminAssignment("validacion_fallida", {
        step: "base_administrativa",
        disponible: baseAdministrativa.disponible,
      });
      throw new Error("No hay base administrativa disponible para asignar bonos");
    }

    const redencion = await createAdminRedencion(client, {
      studentId,
      bonoDiarioId: bonoDiario.id,
      codigoBono: codigoNumerico,
      adminId,
      motivo,
    });
    logAdminAssignment("persistencia_ok", {
      redencionId: redencion.id,
      estado: redencion.estado,
      tipoAsignacion: redencion.tipo_asignacion,
      adminId: redencion.admin_id,
    });

    await client.query("COMMIT");
    logAdminAssignment("respuesta_final", {
      redencionId: redencion.id,
      baseRestante: baseAdministrativa.disponible - 1,
    });

    return {
      redencion,
      student,
      baseAdministrativa: {
        ...baseAdministrativa,
        disponible: baseAdministrativa.disponible - 1,
      },
    };
  } catch (error) {
    await client.query("ROLLBACK");
    logAdminAssignment("rollback", { message: error.message });
    throw error;
  } finally {
    client.release();
  }
};

const getBaseAdministrativaPorTipo = async (tipo) => {
  const normalizedTipo = validateTipo(tipo);

  const bonoDiario = await getBonoDiarioByTipo(normalizedTipo);

  if (!bonoDiario) {
    return emptyBaseAdministrativa(normalizedTipo);
  }

  const baseAdministrativa = await calculateBaseAdministrativa(pool, bonoDiario.id);

  return {
    tipo: normalizedTipo,
    ...baseAdministrativa,
  };
};

const getBaseAdministrativa = async () => {
  const result = {};

  for (const tipo of VALID_BONO_TYPES) {
    result[tipo] = await getBaseAdministrativaPorTipo(tipo);
  }

  return result;
};

const getLockedBonoDiario = async (client, tipo) => {
  const query = `
    SELECT bd.*
    FROM bonos_diarios bd
    JOIN config_bonos cb
      ON cb.id = bd.config_bono_id
    WHERE cb.tipo = $1
      AND bd.fecha = ${BOGOTA.date}
    FOR UPDATE
  `;

  const result = await client.query(query, [tipo]);

  if (result.rows.length === 0) {
    throw new Error("Bono diario no encontrado para asignacion administrativa");
  }

  return result.rows[0];
};

const getBonoDiarioByTipo = async (tipo) => {
  const query = `
    SELECT bd.*
    FROM bonos_diarios bd
    JOIN config_bonos cb
      ON cb.id = bd.config_bono_id
    WHERE cb.tipo = $1
      AND bd.fecha = ${BOGOTA.date}
  `;

  const result = await pool.query(query, [tipo]);
  return result.rows[0] || null;
};

const getActiveStudentForAssignment = async (client, studentId) => {
  const query = `
    SELECT
      id,
      codigo,
      nombre,
      programa_codigo,
      programa_nombre,
      activo
    FROM students
    WHERE id = $1
    FOR UPDATE
  `;

  const result = await client.query(query, [studentId]);

  if (result.rows.length === 0) {
    throw new Error("Estudiante no encontrado");
  }

  const student = result.rows[0];

  if (!student.activo) {
    throw new Error("El estudiante se encuentra inactivo");
  }

  return student;
};

const studentAlreadyConsumedToday = async (client, studentId) => {
  const query = `
    SELECT r.id
    FROM redenciones r
    JOIN bonos_diarios bd
      ON bd.id = r.bono_diario_id
    WHERE r.student_id = $1
      AND bd.fecha = ${BOGOTA.date}
      AND r.estado IN ('reservado', 'reclamado')
    LIMIT 1
    FOR UPDATE
  `;

  const result = await client.query(query, [studentId]);
  return result.rows.length > 0;
};

const calculateBaseAdministrativa = async (client, bonoDiarioId) => {
  const hasAssignmentColumns = await hasRedencionesAssignmentColumns(client);
  const redencionesQuery = hasAssignmentColumns
    ? `
      SELECT
        COUNT(*) FILTER (WHERE estado = 'expirado')::int AS expirados,
        COUNT(*) FILTER (
          WHERE estado = 'reclamado'
            AND tipo_asignacion = $2
        )::int AS administrativos
      FROM redenciones
      WHERE bono_diario_id = $1
    `
    : `
      SELECT
        COUNT(*) FILTER (WHERE estado = 'expirado')::int AS expirados,
        0::int AS administrativos
      FROM redenciones
      WHERE bono_diario_id = $1
    `;

  const bonoResult = await client.query(
    "SELECT cantidad_no_utilizada FROM bonos_diarios WHERE id = $1",
    [bonoDiarioId],
  );
  const redencionesValues = hasAssignmentColumns
    ? [bonoDiarioId, TIPO_ASIGNACION_ADMINISTRATIVA]
    : [bonoDiarioId];
  const redencionesResult = await client.query(redencionesQuery, redencionesValues);

  const bonoDiario = bonoResult.rows[0];

  if (!bonoDiario) {
    throw new Error("Bono diario no encontrado para calcular base administrativa");
  }

  const redenciones = redencionesResult.rows[0];
  const expirados = Number(redenciones.expirados || 0);
  const noUtilizados = Number(bonoDiario.cantidad_no_utilizada || 0);
  const administrativos = Number(redenciones.administrativos || 0);
  const total = expirados + noUtilizados;

  return {
    expirados,
    noUtilizados,
    administrativos,
    total,
    disponible: Math.max(total - administrativos, 0),
  };
};

const createAdminRedencion = async (client, data) => {
  const query = `
    INSERT INTO redenciones (
      student_id,
      bono_diario_id,
      estado,
      hora_reclamo,
      codigo_bono,
      tipo_asignacion,
      admin_id,
      motivo_asignacion,
      modalidad_operacional
    )
    VALUES ($1, $2, 'reclamado', ${BOGOTA.timestamp}, $3, $4, $5, $6, 'administrativo')
    RETURNING *
  `;

  const result = await client.query(query, [
    data.studentId,
    data.bonoDiarioId,
    data.codigoBono,
    TIPO_ASIGNACION_ADMINISTRATIVA,
    data.adminId,
    data.motivo,
  ]);

  return result.rows[0];
};

const assertAssignmentSchemaReady = async (client) => {
  const isReady = await hasRedencionesAssignmentColumns(client);

  if (!isReady) {
    throw new Error("La migracion de asignacion administrativa no ha sido aplicada");
  }
};

const hasRedencionesAssignmentColumns = async (client) => {
  if (redencionesAssignmentColumnsReady !== null) {
    return redencionesAssignmentColumnsReady;
  }

  const query = `
    SELECT COUNT(*)::int AS total
    FROM information_schema.columns
    WHERE table_name = 'redenciones'
      AND column_name IN ('tipo_asignacion', 'admin_id', 'motivo_asignacion')
  `;

  const result = await client.query(query);
  const isReady = Number(result.rows[0]?.total || 0) === 3;

  if (isReady) {
    redencionesAssignmentColumnsReady = true;
  }

  return isReady;
};

const emptyBaseAdministrativa = (tipo) => ({
  tipo,
  expirados: 0,
  noUtilizados: 0,
  administrativos: 0,
  total: 0,
  disponible: 0,
});

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

module.exports = {
  TIPO_ASIGNACION_ADMINISTRATIVA,
  asignarAdministrativamente,
  getBaseAdministrativa,
  getBaseAdministrativaPorTipo,
};
