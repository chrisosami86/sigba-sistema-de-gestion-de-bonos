
const pool = require("../../config/db");
const { getModalidadExpression } = require("../../shared/helpers/modalidad.helper");
const { formatBogotaDate, getBogotaDate } = require("../../shared/helpers/timezone.helper");

const VALID_TIPOS = ["almuerzo", "refrigerio"];
const VALID_DIAS = ["lunes", "martes", "miercoles", "jueves", "viernes"];

const WEEKDAY_TO_DOW = {
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  domingo: 0,
};

const getAnalytics = async (filters = {}) => {
  await require("../bonos/bonos.service").expireBonos();

  const tipo = VALID_TIPOS.includes(filters.tipo) ? filters.tipo : null;
  const dia = VALID_DIAS.includes(filters.dia) ? filters.dia : null;

  let fechaInicio = filters.fechaInicio || null;
  let fechaFin = filters.fechaFin || null;

  if (!fechaInicio || !fechaFin) {
    const settingsResult = await pool.query(
      "SELECT periodo_actual, fecha_inicio, fecha_fin FROM system_settings WHERE id = 1"
    );
    const settings = settingsResult.rows[0] || null;
    if (!fechaInicio) fechaInicio = settings?.fecha_inicio || null;
    if (!fechaFin) fechaFin = settings?.fecha_fin || null;

    if (!fechaInicio) {
      const now = new Date();
      now.setDate(1);
      fechaInicio = formatBogotaDate(now);
    }
    if (!fechaFin) {
      fechaFin = getBogotaDate();
    }
  }

  if (!tipo || !dia) {
    return getEmptyResponse(fechaInicio, fechaFin, tipo, dia);
  }

  const holidaysResult = await pool.query(
    "SELECT fecha FROM holidays WHERE fecha BETWEEN $1::date AND $2::date",
    [fechaInicio, fechaFin]
  );
  const holidayDates = new Set(
    holidaysResult.rows.map((r) => {
      const d = r.fecha instanceof Date ? r.fecha : new Date(r.fecha);
      return d.toISOString().slice(0, 10);
    })
  );

  const validDates = [];
  const start = new Date(fechaInicio + "T00:00:00");
  const end = new Date(fechaFin + "T00:00:00");
  const targetDow = WEEKDAY_TO_DOW[dia];

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === targetDow) {
      const dateStr = d.toISOString().slice(0, 10);
      if (!holidayDates.has(dateStr)) {
        validDates.push(dateStr);
      }
    }
  }

  const diasEncontrados = validDates.length;
  const festivosExcluidos = holidaysResult.rows.filter((r) => {
    const d = r.fecha instanceof Date ? r.fecha : new Date(r.fecha);
    return d.getDay() === targetDow;
  }).length;

  const baseSubsidiadaQuery = `
    SELECT COUNT(DISTINCT s.id)::int AS total
    FROM students s
    JOIN subsidies sub ON sub.student_id = s.id
    JOIN subsidy_days sd ON sd.subsidy_id = sub.id
    WHERE s.tipo_estudiante = 'subsidiado'
      AND s.activo = true
      AND sd.dia = $1
  `;

  const baseResult = await pool.query(baseSubsidiadaQuery, [dia]);
  const baseSubsidiada = Number(baseResult.rows[0]?.total || 0);
  const asistenciasEsperadas = baseSubsidiada * diasEncontrados;

  const modalidadExpression = getModalidadExpression();

  let chartData = [];
  let reclamadosReales = 0;
  let inasistencias = 0;

  if (diasEncontrados > 0 && baseSubsidiada > 0) {
    const tipoCondition = tipo ? 'AND cb.tipo = $3' : '';
    const tipoValue = tipo ? [tipo] : [];

    const chartQuery = `
      WITH subsidized_ids AS (
        SELECT DISTINCT s.id
        FROM students s
        JOIN subsidies sub ON sub.student_id = s.id
        JOIN subsidy_days sd ON sd.subsidy_id = sub.id
        WHERE s.tipo_estudiante = 'subsidiado'
          AND s.activo = true
          AND sd.dia = $1
      ),
      claims_per_date AS (
        SELECT
          bd.fecha,
          COUNT(DISTINCT r.student_id)::int AS reclamados
        FROM redenciones r
        JOIN bonos_diarios bd ON bd.id = r.bono_diario_id
        JOIN config_bonos cb ON cb.id = bd.config_bono_id
        WHERE r.student_id IN (SELECT id FROM subsidized_ids)
          AND bd.fecha = ANY($2::date[])
          AND r.estado = 'reclamado'
          AND ${modalidadExpression} = 'subsidiado'
          ${tipoCondition}
        GROUP BY bd.fecha
      )
      SELECT
        d::date AS fecha,
        COALESCE(cpd.reclamados, 0)::int AS reclamados,
        GREATEST(${baseSubsidiada} - COALESCE(cpd.reclamados, 0), 0)::int AS inasistencias
      FROM unnest($2::date[]) AS d
      LEFT JOIN claims_per_date cpd ON cpd.fecha = d::date
      ORDER BY d::date
    `;

    const chartValues = [dia, validDates, ...tipoValue];
    const chartResult = await pool.query(chartQuery, chartValues);

    chartData = chartResult.rows.map((r) => ({
      fecha: r.fecha instanceof Date ? r.fecha.toISOString().slice(0, 10) : String(r.fecha).slice(0, 10),
      reclamados: Number(r.reclamados),
      inasistencias: Number(r.inasistencias),
    }));

    for (const row of chartData) {
      reclamadosReales += row.reclamados;
      inasistencias += row.inasistencias;
    }
  }

  const porcentajeAsistencia = asistenciasEsperadas > 0
    ? Number(((reclamadosReales / asistenciasEsperadas) * 100).toFixed(1))
    : 0;

  const porcentajeInasistencia = asistenciasEsperadas > 0
    ? Number(((inasistencias / asistenciasEsperadas) * 100).toFixed(1))
    : 0;

  const indiceInasistencia = porcentajeInasistencia;

  let estudiantesInasistencia = [];
  let estudiantesMejorAsistencia = [];

  if (baseSubsidiada > 0 && diasEncontrados > 0) {
    const tipoCondition2 = tipo ? 'AND cb.tipo = $3' : '';
    const tipoValue2 = tipo ? [tipo] : [];

    const studentsQuery = `
      WITH subsidio_students AS (
        SELECT DISTINCT s.id, s.codigo, s.nombre, s.programa_nombre
        FROM students s
        JOIN subsidies sub ON sub.student_id = s.id
        JOIN subsidy_days sd ON sd.subsidy_id = sub.id
        WHERE s.tipo_estudiante = 'subsidiado'
          AND s.activo = true
          AND sd.dia = $1
      ),
      student_date_claims AS (
        SELECT
          r.student_id,
          bd.fecha
        FROM redenciones r
        JOIN bonos_diarios bd ON bd.id = r.bono_diario_id
        JOIN config_bonos cb ON cb.id = bd.config_bono_id
        WHERE r.student_id IN (SELECT id FROM subsidio_students)
          AND bd.fecha = ANY($2::date[])
          AND r.estado = 'reclamado'
          AND ${modalidadExpression} = 'subsidiado'
          ${tipoCondition2}
      )
      SELECT
        ss.id,
        ss.codigo,
        ss.nombre,
        ss.programa_nombre AS programa,
        COALESCE(COUNT(DISTINCT sdc.fecha), 0)::int AS reclamados
      FROM subsidio_students ss
      LEFT JOIN student_date_claims sdc ON sdc.student_id = ss.id
      GROUP BY ss.id, ss.codigo, ss.nombre, ss.programa_nombre
      ORDER BY reclamados ASC, ss.nombre
    `;

    const studentsValues = [dia, validDates, ...tipoValue2];
    const studentsResult = await pool.query(studentsQuery, studentsValues);

    const allStudents = studentsResult.rows.map((r) => {
      const rec = Number(r.reclamados);
      const inas = diasEncontrados - rec;

      return {
        id: Number(r.id),
        codigo: r.codigo,
        nombre: r.nombre,
        programa: r.programa,
        diasHabilitados: diasEncontrados,
        reclamados: rec,
        inasistencias: Math.max(inas, 0),
        porcentajeAsistencia: diasEncontrados > 0 ? Number(((rec / diasEncontrados) * 100).toFixed(1)) : 0,
        porcentajeInasistencia: diasEncontrados > 0 ? Number(((Math.max(inas, 0) / diasEncontrados) * 100).toFixed(1)) : 0,
      };
    });

    estudiantesInasistencia = allStudents
      .filter((s) => s.porcentajeInasistencia > 0 || s.reclamados === 0)
      .sort((a, b) => b.porcentajeInasistencia - a.porcentajeInasistencia || b.inasistencias - a.inasistencias);

    estudiantesMejorAsistencia = allStudents
      .filter((s) => s.reclamados >= 1)
      .sort((a, b) => b.porcentajeAsistencia - a.porcentajeAsistencia || b.reclamados - a.reclamados)
      .slice(0, 10);
  }

  const ventaLibreQuery = `
    SELECT
      COUNT(*)::int AS solicitudes,
      COUNT(*) FILTER (WHERE r.estado = 'reclamado')::int AS reclamados,
      COUNT(*) FILTER (WHERE r.estado = 'expirado')::int AS expirados
    FROM redenciones r
    JOIN bonos_diarios bd ON bd.id = r.bono_diario_id
    JOIN config_bonos cb ON cb.id = bd.config_bono_id
    WHERE ${modalidadExpression} = 'venta_libre'
      AND bd.fecha BETWEEN $1::date AND $2::date
      ${tipo ? 'AND cb.tipo = $3' : ''}
  `;

  const vlValues = [fechaInicio, fechaFin];
  if (tipo) vlValues.push(tipo);

  const ventaResult = await pool.query(ventaLibreQuery, vlValues);

  const ventaRow = ventaResult.rows[0] || { solicitudes: 0, reclamados: 0, expirados: 0 };
  const vlSolicitudes = Number(ventaRow.solicitudes);
  const vlReclamados = Number(ventaRow.reclamados);
  const vlExpirados = Number(ventaRow.expirados);

  const ventaLibre = {
    solicitudes: vlSolicitudes,
    reclamados: vlReclamados,
    expirados: vlExpirados,
    efectividad: vlSolicitudes > 0
      ? Number(((vlReclamados / vlSolicitudes) * 100).toFixed(1))
      : 0,
  };

  const reutilizacionQuery = `
    SELECT
      COUNT(*) FILTER (WHERE r.estado = 'expirado')::int AS total_expirados,
      COALESCE(SUM(bd.cantidad_liberada), 0)::int AS total_liberados,
      COALESCE(SUM(bd.cantidad_no_utilizada), 0)::int AS total_no_utilizados
    FROM redenciones r
    JOIN bonos_diarios bd ON bd.id = r.bono_diario_id
    JOIN config_bonos cb ON cb.id = bd.config_bono_id
    WHERE bd.fecha BETWEEN $1::date AND $2::date
      ${tipo ? 'AND cb.tipo = $3' : ''}
  `;

  const reuValues = [fechaInicio, fechaFin];
  if (tipo) reuValues.push(tipo);

  const reuResult = await pool.query(reutilizacionQuery, reuValues);

  const reuRow = reuResult.rows[0] || { total_expirados: 0, total_liberados: 0, total_no_utilizados: 0 };
  const reuExpirados = Number(reuRow.total_expirados);
  const reuLiberados = Number(reuRow.total_liberados);
  const reuNoUtilizados = Number(reuRow.total_no_utilizados);

  const reutilizacion = {
    totalExpirados: reuExpirados,
    totalLiberados: reuLiberados,
    totalNoUtilizados: reuNoUtilizados,
    totalReutilizados: reuLiberados,
    totalReutilizables: reuExpirados + reuNoUtilizados,
    porcentajeReutilizacion: reuExpirados > 0
      ? Number(((reuLiberados / reuExpirados) * 100).toFixed(1))
      : 0,
  };

  const desconocidaQuery = `
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE r.estado = 'reclamado')::int AS reclamados,
      COUNT(*) FILTER (WHERE r.estado = 'expirado')::int AS expirados,
      COUNT(*) FILTER (WHERE r.estado = 'reservado')::int AS reservados
    FROM redenciones r
    JOIN bonos_diarios bd ON bd.id = r.bono_diario_id
    JOIN config_bonos cb ON cb.id = bd.config_bono_id
    WHERE ${modalidadExpression} = 'desconocida'
      AND bd.fecha BETWEEN $1::date AND $2::date
      ${tipo ? 'AND cb.tipo = $3' : ''}
  `;

  const descValues = [fechaInicio, fechaFin];
  if (tipo) descValues.push(tipo);

  const descResult = await pool.query(desconocidaQuery, descValues);

  const descRow = descResult.rows[0] || { total: 0, reclamados: 0, expirados: 0, reservados: 0 };

  const desconocida = {
    total: Number(descRow.total),
    reclamados: Number(descRow.reclamados),
    expirados: Number(descRow.expirados),
    reservados: Number(descRow.reservados),
  };

  return {
    filtros: {
      fechaInicio,
      fechaFin,
      tipo,
      dia,
      diasEncontrados,
      festivosExcluidos,
    },

    kpiPrincipal: {
      indiceInasistencia,
      asistenciasEsperadas,
      reclamadosReales,
      inasistencias,
    },

    kpisSecundarios: {
      baseSubsidiada,
      diasEncontrados,
      asistenciasEsperadas,
      reclamadosReales,
      inasistencias,
      porcentajeAsistencia,
      porcentajeInasistencia,
    },

    chartData,
    estudiantesInasistencia,
    estudiantesMejorAsistencia,
    ventaLibre,
    reutilizacion,
    desconocida,
  };
};

const getEmptyResponse = (fechaInicio, fechaFin, tipo, dia) => ({
  filtros: {
    fechaInicio: fechaInicio || "",
    fechaFin: fechaFin || "",
    tipo,
    dia,
    diasEncontrados: 0,
    festivosExcluidos: 0,
  },
  kpiPrincipal: {
    indiceInasistencia: 0,
    asistenciasEsperadas: 0,
    reclamadosReales: 0,
    inasistencias: 0,
  },
  kpisSecundarios: {
    baseSubsidiada: 0,
    diasEncontrados: 0,
    asistenciasEsperadas: 0,
    reclamadosReales: 0,
    inasistencias: 0,
    porcentajeAsistencia: 0,
    porcentajeInasistencia: 0,
  },
  chartData: [],
  estudiantesInasistencia: [],
  estudiantesMejorAsistencia: [],
  ventaLibre: { solicitudes: 0, reclamados: 0, expirados: 0, efectividad: 0 },
  reutilizacion: {
    totalExpirados: 0,
    totalLiberados: 0,
    totalNoUtilizados: 0,
    totalReutilizados: 0,
    totalReutilizables: 0,
    porcentajeReutilizacion: 0,
  },
  desconocida: { total: 0, reclamados: 0, expirados: 0, reservados: 0 },
});

module.exports = {
  getAnalytics,
};
