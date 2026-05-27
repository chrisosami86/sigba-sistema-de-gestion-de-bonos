const pool = require("../../config/db");
const { info, error } = require("../../shared/helpers/logger.helper");
const { BOGOTA } = require("../../shared/helpers/sql-timezone.helper");

const VALID_BONO_TYPES = ["almuerzo", "refrigerio"];
const CODIGO_MIN = 1;
const CODIGO_MAX = 200;

// ─────────────────────────────────────
// Asignar código al bono reservado (QR)
// ─────────────────────────────────────

const getActiveBonus = async (studentId) => {
  const query = `
    SELECT
      r.id,
      r.estado,
      r.expiracion_at AS "expiracionAt",
      r.expiracion_at < ${BOGOTA.timestamp} AS "isExpired",
      r.codigo_bono AS "codigoBono",
      cb.tipo,
      bd.fecha
    FROM redenciones r
    JOIN bonos_diarios bd ON bd.id = r.bono_diario_id
    JOIN config_bonos cb ON cb.id = bd.config_bono_id
    WHERE r.student_id = $1
      AND bd.fecha = ${BOGOTA.date}
      AND r.estado = 'reservado'
    ORDER BY r.id DESC
    LIMIT 1
  `;

  const result = await pool.query(query, [studentId]);

  if (result.rows.length === 0) return null;

  const bono = result.rows[0];

  // Verificar que no esté expirado
  if (bono.isExpired) {
    return null;
  }

  // Si no tiene código asignado, generar uno único para hoy+tipo
  if (!bono.codigoBono) {
    const codigo = await generateUniqueCode(bono.tipo);
    await pool.query(
      `UPDATE redenciones SET codigo_bono = $1, updated_at = ${BOGOTA.timestamp} WHERE id = $2`,
      [codigo, bono.id],
    );
    bono.codigoBono = codigo;
  }

  return {
    id: bono.id,
    tipo: bono.tipo,
    estado: bono.estado,
    codigoBono: bono.codigoBono,
    fecha: bono.fecha,
    expiracionAt: bono.expiracionAt,
  };
};

const generateUniqueCode = async (tipo) => {
  // Encontrar un código no usado hoy para este tipo
  const attempts = 50;
  for (let i = 0; i < attempts; i++) {
    const code = Math.floor(Math.random() * (CODIGO_MAX - CODIGO_MIN + 1)) + CODIGO_MIN;
    const exists = await pool.query(
      `SELECT 1 FROM redenciones r
       JOIN bonos_diarios bd ON bd.id = r.bono_diario_id
       JOIN config_bonos cb ON cb.id = bd.config_bono_id
       WHERE cb.tipo = $1 AND bd.fecha = ${BOGOTA.date} AND r.codigo_bono = $2
       LIMIT 1`,
      [tipo, code],
    );
    if (exists.rows.length === 0) return code;
  }
  throw new Error("No se pudo generar un codigo de bono unico");
};

// ─────────────────────────────────────
// Resolver bono por código QR (solo lookup)
// ─────────────────────────────────────

const resolveByCode = async (codigoBono, tipo) => {
  if (!VALID_BONO_TYPES.includes(tipo)) {
    throw new Error("Tipo de bono invalido");
  }

  const codigoNumerico = Number(codigoBono);
  if (!Number.isInteger(codigoNumerico) || codigoNumerico <= 0) {
    throw new Error("Codigo de bono invalido");
  }

  const query = `
    SELECT r.id, r.student_id AS "studentId"
    FROM redenciones r
    JOIN bonos_diarios bd ON bd.id = r.bono_diario_id
    JOIN config_bonos cb ON cb.id = bd.config_bono_id
    WHERE cb.tipo = $1
      AND bd.fecha = ${BOGOTA.date}
      AND r.codigo_bono = $2
    LIMIT 1
  `;

  const result = await pool.query(query, [tipo, codigoNumerico]);

  if (result.rows.length === 0) {
    throw new Error("QR invalido — bono no encontrado para hoy");
  }

  return result.rows[0];
};

module.exports = { getActiveBonus, resolveByCode };
