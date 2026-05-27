/**
 * SIGBA — Analytics V2: Servicio de Operación Administrativa
 *
 * Solo lectura. Basado en redenciones con tipo_asignacion='ADMINISTRATIVA'.
 * NO modifica operación.
 */

const pool = require("../../../config/db");
const { getBogotaDate } = require("../../../shared/helpers/timezone.helper");

const getAdministrativeAnalytics = async (fechaInicio, fechaFin) => {
  const today = getBogotaDate();
  const inicio = fechaInicio || today;
  const fin = fechaFin || today;

  const [resumen, motivos, adminsRanking, porPeriodo] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS total
       FROM redenciones r
       JOIN bonos_diarios bd ON bd.id = r.bono_diario_id
       WHERE r.tipo_asignacion = 'ADMINISTRATIVA'
         AND bd.fecha BETWEEN $1::date AND $2::date`,
      [inicio, fin]
    ),
    pool.query(
      `SELECT COALESCE(r.motivo_asignacion, 'Sin motivo') AS motivo,
              COUNT(*)::int AS total
       FROM redenciones r
       JOIN bonos_diarios bd ON bd.id = r.bono_diario_id
       WHERE r.tipo_asignacion = 'ADMINISTRATIVA'
         AND bd.fecha BETWEEN $1::date AND $2::date
       GROUP BY r.motivo_asignacion
       ORDER BY total DESC`,
      [inicio, fin]
    ),
    pool.query(
      `SELECT COALESCE(a.nombre, 'Sistema') AS admin_nombre,
              COUNT(*)::int AS total
       FROM redenciones r
       JOIN bonos_diarios bd ON bd.id = r.bono_diario_id
       LEFT JOIN admins a ON a.id = r.admin_id
       WHERE r.tipo_asignacion = 'ADMINISTRATIVA'
         AND bd.fecha BETWEEN $1::date AND $2::date
       GROUP BY a.nombre
       ORDER BY total DESC
       LIMIT 15`,
      [inicio, fin]
    ),
    pool.query(
      `SELECT bd.fecha::text AS fecha, COUNT(*)::int AS total
       FROM redenciones r
       JOIN bonos_diarios bd ON bd.id = r.bono_diario_id
       WHERE r.tipo_asignacion = 'ADMINISTRATIVA'
         AND bd.fecha BETWEEN $1::date AND $2::date
       GROUP BY bd.fecha
       ORDER BY bd.fecha`,
      [inicio, fin]
    ),
  ]);

  return {
    totalAdministrativos: Number(resumen.rows[0]?.total) || 0,
    motivosFrecuentes: motivos.rows.map(r => ({
      motivo: r.motivo,
      total: Number(r.total),
    })),
    adminsRanking: adminsRanking.rows.map(r => ({
      admin: r.admin_nombre,
      total: Number(r.total),
    })),
    porPeriodo: porPeriodo.rows.map(r => ({
      fecha: r.fecha,
      total: Number(r.total),
    })),
  };
};

module.exports = { getAdministrativeAnalytics };
