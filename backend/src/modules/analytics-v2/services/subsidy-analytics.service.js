/**
 * SIGBA — Analytics V2: Servicio de Subsidio y Asistencia
 *
 * Solo lectura. Basado en snapshots.
 * NO llama expireBonos(). NO modifica operación.
 */

const pool = require("../../../config/db");
const {
  addDaysToDateString,
  getBogotaDate,
  getDayNameFromDateString,
} = require("../../../shared/helpers/timezone.helper");

const VALID_DIAS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
const WEEKDAY_TO_DOW = { lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, domingo: 0 };

const getValidDates = async (fechaInicio, fechaFin) => {
  const holidayResult = await pool.query(
    "SELECT fecha::text AS fecha FROM holidays WHERE fecha BETWEEN $1::date AND $2::date",
    [fechaInicio, fechaFin]
  );
  const holidaySet = new Set(holidayResult.rows.map(r => r.fecha));

  const workingDaysResult = await pool.query("SELECT dia FROM working_days WHERE activo = true");
  const activeDays = new Set(workingDaysResult.rows.map(r => r.dia));

  const validDatesByDay = {};
  for (const dia of VALID_DIAS) {
    validDatesByDay[dia] = [];
  }

  for (let dateStr = fechaInicio; dateStr <= fechaFin; dateStr = addDaysToDateString(dateStr, 1)) {
    if (holidaySet.has(dateStr)) continue;
    const dayName = getDayNameFromDateString(dateStr);
    if (activeDays.has(dayName)) {
      validDatesByDay[dayName].push(dateStr);
    }
  }

  return validDatesByDay;
};

const getBaseSubsidiada = async (dia) => {
  if (!VALID_DIAS.includes(dia)) return 0;
  const result = await pool.query(
    `SELECT COUNT(DISTINCT s.id)::int AS total
     FROM students s
     JOIN subsidies sub ON sub.student_id = s.id
     JOIN subsidy_days sd ON sd.subsidy_id = sub.id
     WHERE s.tipo_estudiante = 'subsidiado'
       AND s.activo = true
       AND sd.dia = $1`,
    [dia]
  );
  return Number(result.rows[0]?.total || 0);
};

const getSubsidyAnalytics = async (fechaInicio, fechaFin) => {
  const today = getBogotaDate();
  const inicio = fechaInicio || today;
  const fin = fechaFin || today;

  const validDatesByDay = await getValidDates(inicio, fin);

  let baseSubsidiadaTotal = 0;
  const byDay = {};

  for (const dia of VALID_DIAS) {
    const base = await getBaseSubsidiada(dia);
    byDay[dia] = { base, dates: validDatesByDay[dia], count: validDatesByDay[dia].length };
    baseSubsidiadaTotal = Math.max(baseSubsidiadaTotal, base);
  }

  const studentResults = [];
  for (const dia of VALID_DIAS) {
    if (byDay[dia].count === 0 || byDay[dia].base === 0) continue;

    const validDates = byDay[dia].dates;
    const base = byDay[dia].base;
    const asistenciasEsperadas = base * validDates.length;

    const chartResult = await pool.query(
      `WITH subsidized_ids AS (
         SELECT DISTINCT s.id FROM students s
         JOIN subsidies sub ON sub.student_id = s.id
         JOIN subsidy_days sd ON sd.subsidy_id = sub.id
         WHERE s.tipo_estudiante = 'subsidiado' AND s.activo = true AND sd.dia = $1
       ),
       claims AS (
         SELECT bd.fecha, COUNT(DISTINCT r.student_id)::int AS reclamados
         FROM redenciones r
         JOIN bonos_diarios bd ON bd.id = r.bono_diario_id
         JOIN config_bonos cb ON cb.id = bd.config_bono_id
         WHERE r.student_id IN (SELECT id FROM subsidized_ids)
           AND bd.fecha = ANY($2::date[])
           AND r.estado = 'reclamado'
         GROUP BY bd.fecha
       )
       SELECT to_char(d::date, 'YYYY-MM-DD') AS fecha, COALESCE(c.reclamados, 0)::int AS reclamados,
              GREATEST(${base} - COALESCE(c.reclamados, 0), 0)::int AS inasistencias
       FROM unnest($2::date[]) AS d
       LEFT JOIN claims c ON c.fecha = d::date
       ORDER BY d::date`,
      [dia, validDates]
    );

    const chartData = chartResult.rows.map(r => ({
      fecha: r.fecha,
      reclamados: Number(r.reclamados),
      inasistencias: Number(r.inasistencias),
    }));

    let reclamadosReales = 0;
    let inasistencias = 0;
    for (const row of chartData) {
      reclamadosReales += row.reclamados;
      inasistencias += row.inasistencias;
    }

    const pctAsistencia = asistenciasEsperadas > 0
      ? Number(((reclamadosReales / asistenciasEsperadas) * 100).toFixed(1)) : 0;
    const pctInasistencia = asistenciasEsperadas > 0
      ? Number(((inasistencias / asistenciasEsperadas) * 100).toFixed(1)) : 0;

    const studentsResult = await pool.query(
      `WITH ss AS (
         SELECT DISTINCT s.id, s.codigo, s.nombre, s.programa_nombre AS programa
         FROM students s JOIN subsidies sub ON sub.student_id = s.id
         JOIN subsidy_days sd ON sd.subsidy_id = sub.id
         WHERE s.tipo_estudiante = 'subsidiado' AND s.activo = true AND sd.dia = $1
       ),
       sdc AS (
         SELECT r.student_id, bd.fecha FROM redenciones r
         JOIN bonos_diarios bd ON bd.id = r.bono_diario_id
         WHERE r.student_id IN (SELECT id FROM ss) AND bd.fecha = ANY($2::date[])
           AND r.estado = 'reclamado'
       )
       SELECT ss.id, ss.codigo, ss.nombre, ss.programa,
              COALESCE(COUNT(DISTINCT sdc.fecha), 0)::int AS reclamados
       FROM ss LEFT JOIN sdc ON sdc.student_id = ss.id
       GROUP BY ss.id, ss.codigo, ss.nombre, ss.programa
       ORDER BY reclamados ASC, ss.nombre`,
      [dia, validDates]
    );

    const allStudents = studentsResult.rows.map(r => {
      const rec = Number(r.reclamados);
      const inas = validDates.length - rec;
      return {
        id: Number(r.id), codigo: r.codigo, nombre: r.nombre, programa: r.programa,
        diasHabilitados: validDates.length, reclamados: rec,
        inasistencias: Math.max(inas, 0),
        porcentajeAsistencia: validDates.length > 0 ? Number(((rec / validDates.length) * 100).toFixed(1)) : 0,
        porcentajeInasistencia: validDates.length > 0 ? Number(((Math.max(inas, 0) / validDates.length) * 100).toFixed(1)) : 0,
      };
    });

    const criticos = allStudents
      .filter(s => s.porcentajeInasistencia > 0 || s.reclamados === 0)
      .sort((a, b) => b.porcentajeInasistencia - a.porcentajeInasistencia || b.inasistencias - a.inasistencias);

    const mejorAsistencia = allStudents
      .filter(s => s.reclamados >= 1)
      .sort((a, b) => b.porcentajeAsistencia - a.porcentajeAsistencia || b.reclamados - a.reclamados)
      .slice(0, 10);

    const programWaste = {};
    for (const s of allStudents) {
      if (!programWaste[s.programa]) programWaste[s.programa] = { estudiantes: 0, esperados: 0, reclamados: 0, inasistencias: 0 };
      programWaste[s.programa].estudiantes++;
      programWaste[s.programa].esperados += s.diasHabilitados;
      programWaste[s.programa].reclamados += s.reclamados;
      programWaste[s.programa].inasistencias += s.inasistencias;
    }
    const programasCriticos = Object.entries(programWaste)
      .map(([programa, d]) => ({
        programa,
        estudiantes: d.estudiantes,
        esperados: d.esperados,
        reclamados: d.reclamados,
        inasistencias: d.inasistencias,
        porcentajeInasistencia: d.esperados > 0 ? Number(((d.inasistencias / d.esperados) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.porcentajeInasistencia - a.porcentajeInasistencia);

    studentResults.push({
      dia,
      baseSubsidiada: base,
      diasHabiles: validDates.length,
      asistenciasEsperadas,
      reclamadosReales,
      inasistencias,
      porcentajeAsistencia: pctAsistencia,
      porcentajeInasistencia: pctInasistencia,
      chartData,
      estudiantesCriticos: criticos,
      mejorAsistencia,
      programasCriticos,
    });
  }

  return { baseSubsidiadaTotal: baseSubsidiadaTotal, byDay: studentResults };
};

module.exports = { getSubsidyAnalytics };
