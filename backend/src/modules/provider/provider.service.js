const pool = require("../../config/db");
const { info, error } = require("../../shared/helpers/logger.helper");
const { getBogotaDate } = require("../../shared/helpers/timezone.helper");

const VALID_BONO_TYPES = ["almuerzo", "refrigerio"];

const ESTADOS = {
  CONCILIADO: "CONCILIADO",
  DIFERENCIA_MENOR: "DIFERENCIA_MENOR",
  DIFERENCIA_CRITICA: "DIFERENCIA_CRITICA",
  PENDIENTE: "PENDIENTE",
};

const determinarEstado = (diferencia) => {
  const abs = Math.abs(diferencia);
  if (abs === 0) return ESTADOS.CONCILIADO;
  if (abs <= 2) return ESTADOS.DIFERENCIA_MENOR;
  return ESTADOS.DIFERENCIA_CRITICA;
};

// ─────────────────────────────────────
// Resumen proveedor — métricas operacionales del día por tipo
// ─────────────────────────────────────

const getResumenProveedor = async (fecha) => {
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
      resultado[tipo] = emptyResumen(tipo);
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
    const totalEntregado = reclamados + administrativos;
    const expirados = Number(red.expirados);
    const noUtilizados = Number(bd.cantidad_no_utilizada || 0);
    const reutilizables = expirados + noUtilizados - Number(bd.cantidad_liberada || 0);
    const baseAdministrativa = expirados + noUtilizados - administrativos;

    // Última conciliación registrada
    const conciliacionQuery = `
      SELECT cantidad_proveedor, diferencia, estado, observaciones, created_at
      FROM conciliaciones_proveedor
      WHERE fecha = $1 AND tipo = $2
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const concResult = await pool.query(conciliacionQuery, [targetDate, tipo]);
    const ultimaConciliacion = concResult.rows[0] || null;

    resultado[tipo] = {
      tipo,
      fecha: targetDate,
      totalOperativo: Number(bd.cantidad_base) + Number(bd.cantidad_extra),
      reclamados,
      administrativos,
      totalEntregado,
      expirados,
      noUtilizados,
      reutilizables: Math.max(reutilizables, 0),
      baseAdministrativa: Math.max(baseAdministrativa, 0),
      cantidadLiberada: Number(bd.cantidad_liberada || 0),
      ultimaConciliacion,
    };
  }

  return resultado;
};

const emptyResumen = (tipo) => ({
  tipo,
  totalOperativo: 0,
  reclamados: 0,
  administrativos: 0,
  totalEntregado: 0,
  expirados: 0,
  noUtilizados: 0,
  reutilizables: 0,
  baseAdministrativa: 0,
  cantidadLiberada: 0,
  ultimaConciliacion: null,
});

// ─────────────────────────────────────
// Registrar conciliación
// ─────────────────────────────────────

const registrarConciliacion = async ({
  fecha,
  tipo,
  cantidadProveedor,
  observaciones,
  adminId,
  adminNombre,
}) => {
  if (!VALID_BONO_TYPES.includes(tipo)) {
    throw new Error("Tipo de bono invalido");
  }

  const cantidadProv = Number(cantidadProveedor);
  if (!Number.isInteger(cantidadProv) || cantidadProv < 0) {
    throw new Error("La cantidad reportada por el proveedor debe ser un entero no negativo");
  }

  // Obtener total SIGBA del día
  const resumen = await getResumenProveedor(fecha);
  const datosTipo = resumen[tipo];
  const cantidadSigba = datosTipo.totalEntregado;
  const diferencia = cantidadSigba - cantidadProv;

  const estado = determinarEstado(diferencia);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // UPSERT: si ya existe conciliación para este día+tipo, actualizar
    const upsertQuery = `
      INSERT INTO conciliaciones_proveedor
        (fecha, tipo, cantidad_sigba, cantidad_proveedor, diferencia, estado, observaciones, admin_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (fecha, tipo)
      DO UPDATE SET
        cantidad_sigba = EXCLUDED.cantidad_sigba,
        cantidad_proveedor = EXCLUDED.cantidad_proveedor,
        diferencia = EXCLUDED.diferencia,
        estado = EXCLUDED.estado,
        observaciones = EXCLUDED.observaciones,
        admin_id = EXCLUDED.admin_id,
        updated_at = NOW()
      RETURNING *
    `;

    const result = await client.query(upsertQuery, [
      fecha,
      tipo,
      cantidadSigba,
      cantidadProv,
      diferencia,
      estado,
      observaciones || null,
      adminId || null,
    ]);

    await client.query("COMMIT");

    const conciliacion = result.rows[0];

    info("[provider.conciliacion]", {
      fecha,
      tipo,
      cantidadSigba,
      cantidadProveedor: cantidadProv,
      diferencia,
      estado,
      adminId,
      adminNombre,
    });

    return conciliacion;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────
// Historial de conciliaciones
// ─────────────────────────────────────

const getConciliaciones = async ({
  fechaDesde,
  fechaHasta,
  tipo,
  estado,
  page = 1,
  limit = 20,
}) => {
  const pageNum = Math.max(1, Number(page));
  const limitNum = Math.min(100, Math.max(1, Number(limit)));
  const offset = (pageNum - 1) * limitNum;

  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (tipo) {
    if (!VALID_BONO_TYPES.includes(tipo)) throw new Error("Tipo de bono invalido");
    conditions.push(`cp.tipo = $${paramIndex}`);
    params.push(tipo);
    paramIndex++;
  }
  if (fechaDesde) {
    conditions.push(`cp.fecha >= $${paramIndex}`);
    params.push(fechaDesde);
    paramIndex++;
  }
  if (fechaHasta) {
    conditions.push(`cp.fecha <= $${paramIndex}`);
    params.push(fechaHasta);
    paramIndex++;
  }
  if (estado) {
    const validEstados = Object.values(ESTADOS);
    if (!validEstados.includes(estado)) throw new Error("Estado de conciliacion invalido");
    conditions.push(`cp.estado = $${paramIndex}`);
    params.push(estado);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countQuery = `SELECT COUNT(*)::int AS total FROM conciliaciones_proveedor cp ${whereClause}`;
  const countResult = await pool.query(countQuery, params);
  const total = Number(countResult.rows[0].total);
  const totalPages = Math.ceil(total / limitNum);

  const dataQuery = `
    SELECT
      cp.id,
      cp.fecha,
      cp.tipo,
      cp.cantidad_sigba AS "cantidadSigba",
      cp.cantidad_proveedor AS "cantidadProveedor",
      cp.diferencia,
      cp.estado,
      cp.observaciones,
      cp.admin_id AS "adminId",
      COALESCE(a.nombre, 'Sistema') AS "adminNombre",
      cp.created_at AS "createdAt",
      cp.updated_at AS "updatedAt"
    FROM conciliaciones_proveedor cp
    LEFT JOIN admins a ON a.id = cp.admin_id
    ${whereClause}
    ORDER BY cp.fecha DESC, cp.tipo
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
// Detalle de conciliación
// ─────────────────────────────────────

const getConciliacionById = async (id) => {
  const query = `
    SELECT
      cp.id,
      cp.fecha,
      cp.tipo,
      cp.cantidad_sigba AS "cantidadSigba",
      cp.cantidad_proveedor AS "cantidadProveedor",
      cp.diferencia,
      cp.estado,
      cp.observaciones,
      cp.admin_id AS "adminId",
      COALESCE(a.nombre, 'Sistema') AS "adminNombre",
      a.correo AS "adminCorreo",
      cp.created_at AS "createdAt",
      cp.updated_at AS "updatedAt"
    FROM conciliaciones_proveedor cp
    LEFT JOIN admins a ON a.id = cp.admin_id
    WHERE cp.id = $1
  `;

  const result = await pool.query(query, [id]);

  if (result.rows.length === 0) {
    throw new Error("Conciliacion no encontrada");
  }

  return result.rows[0];
};

module.exports = {
  ESTADOS,
  getResumenProveedor,
  registrarConciliacion,
  getConciliaciones,
  getConciliacionById,
};
