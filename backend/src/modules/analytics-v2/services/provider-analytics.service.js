/**
 * SIGBA — Analytics V2: Servicio de Operación Proveedor
 *
 * Solo lectura. Basado en conciliaciones_proveedor.
 * NO modifica operación.
 */

const pool = require("../../../config/db");
const { getBogotaDate } = require("../../../shared/helpers/timezone.helper");

const getProviderAnalytics = async (fechaInicio, fechaFin) => {
  const today = getBogotaDate();
  const inicio = fechaInicio || today;
  const fin = fechaFin || today;

  const [resumen, tendencia, criticos] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE estado = 'CONCILIADO')::int AS conciliados,
         COUNT(*) FILTER (WHERE estado = 'PENDIENTE')::int AS pendientes,
         COUNT(*) FILTER (WHERE estado = 'DIFERENCIA_MENOR')::int AS dif_menor,
         COUNT(*) FILTER (WHERE estado = 'DIFERENCIA_CRITICA')::int AS dif_critica,
         COALESCE(SUM(ABS(diferencia)), 0)::int AS diferencia_acumulada
       FROM conciliaciones_proveedor
       WHERE fecha BETWEEN $1::date AND $2::date`,
      [inicio, fin]
    ),
    pool.query(
      `SELECT fecha, tipo, diferencia, estado
       FROM conciliaciones_proveedor
       WHERE fecha BETWEEN $1::date AND $2::date
       ORDER BY fecha`,
      [inicio, fin]
    ),
    pool.query(
      `SELECT fecha, tipo, diferencia, estado, observaciones
       FROM conciliaciones_proveedor
       WHERE fecha BETWEEN $1::date AND $2::date
         AND estado = 'DIFERENCIA_CRITICA'
       ORDER BY ABS(diferencia) DESC
       LIMIT 20`,
      [inicio, fin]
    ),
  ]);

  const r = resumen.rows[0] || {};

  const chartData = [];
  const byDate = {};
  for (const row of tendencia.rows) {
    const fecha = row.fecha instanceof Date ? row.fecha.toISOString().slice(0, 10) : String(row.fecha).slice(0, 10);
    if (!byDate[fecha]) byDate[fecha] = { fecha, diferencias: 0, criticas: 0 };
    byDate[fecha].diferencias += Number(row.diferencia) || 0;
    if (row.estado === 'DIFERENCIA_CRITICA') byDate[fecha].criticas++;
  }
  for (const key of Object.keys(byDate).sort()) {
    chartData.push(byDate[key]);
  }

  return {
    total: Number(r.total) || 0,
    conciliados: Number(r.conciliados) || 0,
    pendientes: Number(r.pendientes) || 0,
    diferenciaMenor: Number(r.dif_menor) || 0,
    diferenciaCritica: Number(r.dif_critica) || 0,
    diferenciaAcumulada: Number(r.diferencia_acumulada) || 0,
    porcentajeConciliacion: Number(r.total) > 0
      ? Number(((Number(r.conciliados) / Number(r.total)) * 100).toFixed(1))
      : 0,
    chartData,
    diasCriticos: criticos.rows.map(r => ({
      fecha: r.fecha instanceof Date ? r.fecha.toISOString().slice(0, 10) : String(r.fecha).slice(0, 10),
      tipo: r.tipo,
      diferencia: Number(r.diferencia),
      estado: r.estado,
      observaciones: r.observaciones || '',
    })),
  };
};

module.exports = { getProviderAnalytics };
