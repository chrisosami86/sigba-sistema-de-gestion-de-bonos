const pool = require("../../config/db");
const { info, error } = require("../../shared/helpers/logger.helper");
const providerService = require("../provider/provider.service");
const { getBogotaDate } = require("../../shared/helpers/timezone.helper");
const { BOGOTA } = require("../../shared/helpers/sql-timezone.helper");

const VALID_BONO_TYPES = ["almuerzo", "refrigerio"];

const ensurePendingConfirmation = async (fecha) => {
  const existing = await pool.query(
    "SELECT id, estado FROM daily_closure_confirmations WHERE fecha_operacion = $1",
    [fecha]
  );

  if (existing.rows.length > 0) {
    return existing.rows[0];
  }

  const result = await pool.query(
    `INSERT INTO daily_closure_confirmations (fecha_operacion, estado)
     VALUES ($1, 'PENDIENTE_CONFIRMACION')
     ON CONFLICT (fecha_operacion) DO NOTHING
     RETURNING *`,
    [fecha]
  );

  if (result.rows.length > 0) {
    return result.rows[0];
  }

  const retry = await pool.query(
    "SELECT id, estado FROM daily_closure_confirmations WHERE fecha_operacion = $1",
    [fecha]
  );

  return retry.rows[0];
};

const getResumenCierre = async (fecha) => {
  const targetDate = fecha || getBogotaDate();
  const resultado = {};

  for (const tipo of VALID_BONO_TYPES) {
    const bonoDiarioQuery = `
      SELECT bd.*
      FROM bonos_diarios bd
      JOIN config_bonos cb ON cb.id = bd.config_bono_id
      WHERE cb.tipo = $1 AND bd.fecha = $2
    `;
    const bonoResult = await pool.query(bonoDiarioQuery, [tipo, targetDate]);

    if (bonoResult.rows.length === 0) {
      resultado[tipo] = emptyResumen(tipo, targetDate);
      continue;
    }

    const bd = bonoResult.rows[0];

    const redencionesQuery = `
      SELECT
        COUNT(*) FILTER (WHERE estado = 'reclamado' AND tipo_asignacion != 'ADMINISTRATIVA')::int AS reclamados,
        COUNT(*) FILTER (WHERE estado = 'reclamado' AND tipo_asignacion = 'ADMINISTRATIVA')::int AS administrativos,
        COUNT(*) FILTER (WHERE estado = 'expirado')::int AS expirados
      FROM redenciones
      WHERE bono_diario_id = $1
    `;
    const redResult = await pool.query(redencionesQuery, [bd.id]);
    const red = redResult.rows[0];

    const reclamados = Number(red.reclamados);
    const administrativos = Number(red.administrativos);
    const expirados = Number(red.expirados);
    const noUtilizados = Number(bd.cantidad_no_utilizada || 0);

    const conciliacionQuery = `
      SELECT cantidad_proveedor, diferencia, estado, observaciones
      FROM conciliaciones_proveedor
      WHERE fecha = $1 AND tipo = $2
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const concResult = await pool.query(conciliacionQuery, [targetDate, tipo]);
    const conciliacion = concResult.rows[0] || null;

    resultado[tipo] = {
      tipo,
      fecha: targetDate,
      reclamados,
      administrativos,
      expirados,
      noUtilizados,
      conciliacion,
    };
  }

  const confirmacion = await pool.query(
    `SELECT id, fecha_operacion::text AS fecha_operacion, estado, confirmado_por, confirmado_at, observaciones, created_at
     FROM daily_closure_confirmations
     WHERE fecha_operacion = $1`,
    [targetDate]
  );

  return {
    fecha: targetDate,
    bonos: resultado,
    confirmacion: confirmacion.rows[0] || null,
  };
};

const confirmarCierre = async (fecha, adminId, adminNombre, observaciones) => {
  const targetDate = fecha || getBogotaDate();

  const existing = await pool.query(
    "SELECT id, estado FROM daily_closure_confirmations WHERE fecha_operacion = $1",
    [targetDate]
  );

  if (existing.rows.length > 0 && existing.rows[0].estado === "CONFIRMADO") {
    throw new Error("El cierre de este dia ya fue confirmado y no puede modificarse");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await ensurePendingConfirmation(targetDate);

    const result = await client.query(
      `UPDATE daily_closure_confirmations
       SET estado = 'CONFIRMADO',
           confirmado_por = $1,
            confirmado_at = ${BOGOTA.timestamp},
           observaciones = $2
       WHERE fecha_operacion = $3
       RETURNING *`,
      [adminId, observaciones || null, targetDate]
    );

    await client.query("COMMIT");

    const confirmacion = result.rows[0];

    info("[daily-closure.confirmar]", {
      fecha: targetDate,
      adminId,
      adminNombre,
    });

    return confirmacion;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

const getConfirmaciones = async ({ fechaDesde, fechaHasta, estado, page = 1, limit = 20 }) => {
  const pageNum = Math.max(1, Number(page));
  const limitNum = Math.min(100, Math.max(1, Number(limit)));
  const offset = (pageNum - 1) * limitNum;

  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (fechaDesde) {
    conditions.push(`dcc.fecha_operacion >= $${paramIndex}`);
    params.push(fechaDesde);
    paramIndex++;
  }
  if (fechaHasta) {
    conditions.push(`dcc.fecha_operacion <= $${paramIndex}`);
    params.push(fechaHasta);
    paramIndex++;
  }
  if (estado) {
    conditions.push(`dcc.estado = $${paramIndex}`);
    params.push(estado);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countQuery = `SELECT COUNT(*)::int AS total FROM daily_closure_confirmations dcc ${whereClause}`;
  const countResult = await pool.query(countQuery, params);
  const total = Number(countResult.rows[0].total);
  const totalPages = Math.ceil(total / limitNum);

  const dataQuery = `
    SELECT
      dcc.id,
      dcc.fecha_operacion::text AS "fechaOperacion",
      dcc.estado,
      dcc.confirmado_por AS "confirmadoPor",
      COALESCE(a.nombre, 'Sistema') AS "confirmadoPorNombre",
      dcc.confirmado_at AS "confirmadoAt",
      dcc.observaciones,
      dcc.created_at AS "createdAt"
    FROM daily_closure_confirmations dcc
    LEFT JOIN admins a ON a.id = dcc.confirmado_por
    ${whereClause}
    ORDER BY dcc.fecha_operacion DESC
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

const emptyResumen = (tipo, fecha) => ({
  tipo,
  fecha,
  reclamados: 0,
  administrativos: 0,
  expirados: 0,
  noUtilizados: 0,
  conciliacion: null,
});

module.exports = {
  ensurePendingConfirmation,
  getResumenCierre,
  confirmarCierre,
  getConfirmaciones,
};
