/**
 * SIGBA — Analytics V2: Servicio de Histórico Institucional
 *
 * Solo lectura. Basado en bonos_diarios snapshots y daily_closure_confirmations.
 * NO modifica operación.
 */

const pool = require("../../../config/db");
const { getBogotaDate } = require("../../../shared/helpers/timezone.helper");

const getHistoricalAnalytics = async (fechaInicio, fechaFin) => {
  const today = getBogotaDate();
  const inicio = fechaInicio || today;
  const fin = fechaFin || today;

  const dailyData = await pool.query(
    `SELECT
       bd.fecha,
       SUM(bd.cantidad_base + bd.cantidad_extra)::int AS total_operativo,
       COALESCE(SUM(bd.cantidad_no_utilizada), 0)::int AS no_utilizados,
       COALESCE(r.reclamados, 0)::int AS reclamados,
       COALESCE(r.expirados, 0)::int AS expirados,
       COALESCE(r.administrativos, 0)::int AS administrativos
     FROM bonos_diarios bd
     LEFT JOIN LATERAL (
       SELECT
         COUNT(*) FILTER (WHERE red.estado = 'reclamado' AND red.tipo_asignacion != 'ADMINISTRATIVA')::int AS reclamados,
         COUNT(*) FILTER (WHERE red.estado = 'expirado')::int AS expirados,
         COUNT(*) FILTER (WHERE red.tipo_asignacion = 'ADMINISTRATIVA')::int AS administrativos
       FROM redenciones red WHERE red.bono_diario_id = bd.id
     ) r ON true
     WHERE bd.fecha BETWEEN $1::date AND $2::date
     GROUP BY bd.fecha, r.reclamados, r.expirados, r.administrativos
     ORDER BY bd.fecha`,
    [inicio, fin]
  );

  const rows = dailyData.rows;

  let totalOperativo = 0;
  let totalReclamados = 0;
  let totalExpirados = 0;
  let totalNoUtilizados = 0;
  let totalAdministrativos = 0;
  let diasConOperacion = 0;

  const daily = rows.map(r => {
    const tot = Number(r.total_operativo);
    const rec = Number(r.reclamados);
    const exp = Number(r.expirados);
    const noUt = Number(r.no_utilizados);
    const adm = Number(r.administrativos);

    totalOperativo += tot;
    totalReclamados += rec;
    totalExpirados += exp;
    totalNoUtilizados += noUt;
    totalAdministrativos += adm;
    if (tot > 0) diasConOperacion++;

    const efficiency = tot > 0 ? Number(((rec / tot) * 100).toFixed(1)) : 0;
    const waste = tot > 0 ? Number(((noUt / tot) * 100).toFixed(1)) : 0;
    const denominator = rec + exp + noUt;
    const coverage = denominator > 0 ? Number(((rec / denominator) * 100).toFixed(1)) : 0;

    return {
      fecha: r.fecha instanceof Date ? r.fecha.toISOString().slice(0, 10) : String(r.fecha).slice(0, 10),
      totalOperativo: tot,
      reclamados: rec,
      expirados: exp,
      noUtilizados: noUt,
      administrativos: adm,
      eficiencia: efficiency,
      desperdicio: waste,
      cobertura: coverage,
    };
  });

  const totalBaja = totalOperativo - totalReclamados - totalExpirados - totalNoUtilizados;
  const eficienciaGlobal = totalOperativo > 0 ? Number(((totalReclamados / totalOperativo) * 100).toFixed(1)) : 0;
  const desperdicioGlobal = totalOperativo > 0 ? Number(((totalNoUtilizados / totalOperativo) * 100).toFixed(1)) : 0;
  const denomGlobal = totalReclamados + totalExpirados + totalNoUtilizados;
  const coberturaGlobal = denomGlobal > 0 ? Number(((totalReclamados / denomGlobal) * 100).toFixed(1)) : 0;

  const weekly = aggregateByWeek(daily);
  const monthly = aggregateByMonth(daily);

  return {
    kpis: {
      totalOperativo,
      totalReclamados,
      totalExpirados,
      totalNoUtilizados,
      totalAdministrativos,
      totalBaja,
      diasConOperacion,
      eficiencia: eficienciaGlobal,
      desperdicio: desperdicioGlobal,
      cobertura: coberturaGlobal,
    },
    daily,
    weekly,
    monthly,
  };
};

const aggregateByWeek = (daily) => {
  const weeks = {};
  for (const d of daily) {
    const date = new Date(d.fecha + "T00:00:00");
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay() + 1);
    const key = weekStart.toISOString().slice(0, 10);
    if (!weeks[key]) weeks[key] = { semana: key, totalOp: 0, recl: 0, exp: 0, noUt: 0, adm: 0, days: 0 };
    weeks[key].totalOp += d.totalOperativo;
    weeks[key].recl += d.reclamados;
    weeks[key].exp += d.expirados;
    weeks[key].noUt += d.noUtilizados;
    weeks[key].adm += d.administrativos;
    weeks[key].days++;
  }
  return Object.values(weeks).sort((a, b) => a.semana.localeCompare(b.semana)).map(w => ({
    ...w,
    eficiencia: w.totalOp > 0 ? Number(((w.recl / w.totalOp) * 100).toFixed(1)) : 0,
    desperdicio: w.totalOp > 0 ? Number(((w.noUt / w.totalOp) * 100).toFixed(1)) : 0,
  }));
};

const aggregateByMonth = (daily) => {
  const months = {};
  for (const d of daily) {
    const key = d.fecha.slice(0, 7);
    if (!months[key]) months[key] = { mes: key, totalOp: 0, recl: 0, exp: 0, noUt: 0, adm: 0, days: 0 };
    months[key].totalOp += d.totalOperativo;
    months[key].recl += d.reclamados;
    months[key].exp += d.expirados;
    months[key].noUt += d.noUtilizados;
    months[key].adm += d.administrativos;
    months[key].days++;
  }
  return Object.values(months).sort((a, b) => a.mes.localeCompare(b.mes)).map(m => ({
    ...m,
    eficiencia: m.totalOp > 0 ? Number(((m.recl / m.totalOp) * 100).toFixed(1)) : 0,
    desperdicio: m.totalOp > 0 ? Number(((m.noUt / m.totalOp) * 100).toFixed(1)) : 0,
  }));
};

module.exports = { getHistoricalAnalytics };
