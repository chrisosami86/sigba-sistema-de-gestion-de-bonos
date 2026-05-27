/**
 * SIGBA — Analytics V2: Servicio de Estado Operacional Diario
 *
 * Solo lectura. Basado en snapshots.
 * NO llama expireBonos(). NO modifica operación.
 */

const pool = require("../../../config/db");
const { getBogotaDate } = require("../../../shared/helpers/timezone.helper");

const getOperationalSnapshot = async (fecha) => {
  const dateStr = fecha || getBogotaDate();

  const [reclamados, expirados, noUtilizados, administrativos, conciliaciones] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS total FROM redenciones r
       JOIN bonos_diarios bd ON bd.id = r.bono_diario_id
       WHERE bd.fecha = $1 AND r.estado = 'reclamado' AND r.tipo_asignacion != 'ADMINISTRATIVA'`,
      [dateStr]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total FROM redenciones r
       JOIN bonos_diarios bd ON bd.id = r.bono_diario_id
       WHERE bd.fecha = $1 AND r.estado = 'expirado'`,
      [dateStr]
    ),
    pool.query(
      `SELECT COALESCE(SUM(cantidad_no_utilizada), 0)::int AS total
       FROM bonos_diarios WHERE fecha = $1`,
      [dateStr]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total FROM redenciones r
       JOIN bonos_diarios bd ON bd.id = r.bono_diario_id
       WHERE bd.fecha = $1 AND r.tipo_asignacion = 'ADMINISTRATIVA'`,
      [dateStr]
    ),
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE estado = 'PENDIENTE')::int AS pendientes,
         COUNT(*) FILTER (WHERE estado IN ('DIFERENCIA_CRITICA'))::int AS criticas,
         COALESCE(SUM(diferencia), 0)::int AS diferencia_total
       FROM conciliaciones_proveedor WHERE fecha = $1`,
      [dateStr]
    ),
  ]);

  return {
    fecha: dateStr,
    reclamados: reclamados.rows[0]?.total || 0,
    expirados: expirados.rows[0]?.total || 0,
    noUtilizados: noUtilizados.rows[0]?.total || 0,
    administrativos: administrativos.rows[0]?.total || 0,
    conciliacionesPendientes: conciliaciones.rows[0]?.pendientes || 0,
    diferenciasProveedor: conciliaciones.rows[0]?.diferencia_total || 0,
    conciliacionesCriticas: conciliaciones.rows[0]?.criticas || 0,
  };
};

module.exports = { getOperationalSnapshot };
