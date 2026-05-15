
const pool = require("../../config/db");
const { getModalidadExpression } = require("../../shared/helpers/modalidad.helper");

const VALID_TIPOS = ["almuerzo", "refrigerio"];
const VALID_AGRUPACIONES = ["diaria", "semanal", "mensual"];

const getAnalytics = async (filters = {}) => {
  await require("../bonos/bonos.service").expireBonos();

  const agrupacion = VALID_AGRUPACIONES.includes(filters.agrupacion)
    ? filters.agrupacion
    : "diaria";

  const tipo = VALID_TIPOS.includes(filters.tipo) ? filters.tipo : null;
  const programa = filters.programa || null;

  let fechaInicio = filters.fechaInicio || null;
  let fechaFin = filters.fechaFin || null;
  let settings = null;

  if (!fechaInicio || !fechaFin) {
    const settingsResult = await pool.query(
      "SELECT periodo_actual, fecha_inicio, fecha_fin FROM system_settings WHERE id = 1"
    );

    settings = settingsResult.rows[0] || null;

    if (!fechaInicio) fechaInicio = settings?.fecha_inicio || null;
    if (!fechaFin) fechaFin = settings?.fecha_fin || null;

    if (!fechaInicio) {
      const now = new Date();
      now.setDate(1);
      fechaInicio = now.toISOString().slice(0, 10);
    }

    if (!fechaFin) {
      const now = new Date();
      fechaFin = now.toISOString().slice(0, 10);
    }
  }

  const periodo = filters.periodo || null;

  const truncMap = {
    diaria: "day",
    semanal: "week",
    mensual: "month",
  };

  const truncUnit = truncMap[agrupacion];

  const buildConditions = (
    startIndex,
    { tipo = null, programa = null } = {}
  ) => {
    const conditions = [];
    const values = [];
    let index = startIndex;

    if (tipo) {
      conditions.push(`AND cb.tipo = $${index}`);
      values.push(tipo);
      index += 1;
    }

    if (programa) {
      conditions.push(`AND s.programa_codigo = $${index}`);
      values.push(programa);
      index += 1;
    }

    return {
      sql: conditions.join("\n"),
      values,
    };
  };

  const commonConditions = buildConditions(3, {
    tipo,
    programa,
  });

  const modalidadExpression = getModalidadExpression();

  // =====================================================
  // Query 1 - Totales subsidiados (basado en modalidad real)
  // =====================================================

  const subsidizedTotalsQuery = `
    SELECT
      COUNT(*) FILTER (WHERE r.estado = 'reclamado')::int AS reclamados,
      COUNT(*) FILTER (WHERE r.estado = 'expirado')::int AS expirados
    FROM redenciones r
    JOIN bonos_diarios bd ON bd.id = r.bono_diario_id
    JOIN config_bonos cb ON cb.id = bd.config_bono_id
    JOIN students s ON s.id = r.student_id
    WHERE ${modalidadExpression} = 'subsidiado'
      AND bd.fecha BETWEEN $1::date AND $2::date
      ${commonConditions.sql}
  `;

  const subsidizedValues = [
    fechaInicio,
    fechaFin,
    ...commonConditions.values,
  ];

  // =====================================================
  // Query 2 - Subsidiados activos
  // =====================================================

  const activeConditions = [];
  const activeValues = [];

  if (programa) {
    activeConditions.push(`AND s.programa_codigo = $1`);
    activeValues.push(programa);
  }

  const activeSubsidizedQuery = `
    SELECT COUNT(*)::int AS total
    FROM students s
    WHERE s.tipo_estudiante = 'subsidiado'
      AND s.activo = true
      ${activeConditions.join("\n")}
  `;

  // =====================================================
  // Query 3 - Serie temporal
  // =====================================================

  const timeSeriesQuery = `
    SELECT
      date_trunc('${truncUnit}', bd.fecha)::date AS periodo,
      COUNT(*) FILTER (WHERE r.estado = 'reclamado')::int AS reclamados,
      COUNT(*) FILTER (WHERE r.estado = 'expirado')::int AS expirados
    FROM redenciones r
    JOIN bonos_diarios bd ON bd.id = r.bono_diario_id
    JOIN config_bonos cb ON cb.id = bd.config_bono_id
    JOIN students s ON s.id = r.student_id
    WHERE ${modalidadExpression} = 'subsidiado'
      AND bd.fecha BETWEEN $1::date AND $2::date
      ${commonConditions.sql}
    GROUP BY periodo
    ORDER BY periodo
  `;

  // =====================================================
  // Query 4 - Día crítico
  // =====================================================

  const criticalDayQuery = `
    SELECT
      bd.fecha,
      COUNT(*) FILTER (WHERE r.estado = 'expirado')::int AS expirados,
      COUNT(*) FILTER (WHERE r.estado = 'reclamado')::int AS reclamados,
      COUNT(*)::int AS total
    FROM redenciones r
    JOIN bonos_diarios bd ON bd.id = r.bono_diario_id
    JOIN config_bonos cb ON cb.id = bd.config_bono_id
    JOIN students s ON s.id = r.student_id
    WHERE ${modalidadExpression} = 'subsidiado'
      AND bd.fecha BETWEEN $1::date AND $2::date
      ${commonConditions.sql}
    GROUP BY bd.fecha
    HAVING COUNT(*) FILTER (WHERE r.estado = 'expirado') > 0
    ORDER BY expirados DESC
    LIMIT 1
  `;

  // =====================================================
  // Query 5 - Estudiantes
  // =====================================================

  const studentsQuery = `
    SELECT
      s.id,
      s.codigo,
      s.nombre,
      s.programa_nombre AS programa,
      COUNT(*) FILTER (WHERE r.estado = 'reclamado')::int AS reclamados,
      COUNT(*) FILTER (WHERE r.estado = 'expirado')::int AS expirados
    FROM redenciones r
    JOIN students s ON s.id = r.student_id
    JOIN bonos_diarios bd ON bd.id = r.bono_diario_id
    JOIN config_bonos cb ON cb.id = bd.config_bono_id
    WHERE ${modalidadExpression} = 'subsidiado'
      AND bd.fecha BETWEEN $1::date AND $2::date
      ${commonConditions.sql}
    GROUP BY s.id, s.codigo, s.nombre, s.programa_nombre
    ORDER BY s.codigo
  `;

  // =====================================================
  // Query 6 - Venta libre
  // =====================================================

  const ventaLibreConditions = [];
  const ventaLibreValues = [fechaInicio, fechaFin];

  if (tipo) {
    ventaLibreConditions.push(`AND cb.tipo = $3`);
    ventaLibreValues.push(tipo);
  }

  const ventaLibreQuery = `
    SELECT
      COUNT(*)::int AS solicitudes,
      COUNT(*) FILTER (WHERE r.estado = 'reclamado')::int AS reclamados,
      COUNT(*) FILTER (WHERE r.estado = 'expirado')::int AS expirados
    FROM redenciones r
    JOIN bonos_diarios bd ON bd.id = r.bono_diario_id
    JOIN config_bonos cb ON cb.id = bd.config_bono_id
    JOIN students s ON s.id = r.student_id
    WHERE ${modalidadExpression} = 'venta_libre'
      AND bd.fecha BETWEEN $1::date AND $2::date
      ${ventaLibreConditions.join("\n")}
  `;

  // =====================================================
  // Query 7 - Operaciones fuera de franja (desconocida)
  // =====================================================

  const desconocidaConditions = [];
  const desconocidaValues = [fechaInicio, fechaFin];

  if (tipo) {
    desconocidaConditions.push(`AND cb.tipo = $3`);
    desconocidaValues.push(tipo);
  }

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
      ${desconocidaConditions.join("\n")}
  `;

  // =====================================================
  // Query 8 - Reutilización
  // =====================================================

  const reutilizacionConditions = [];
  const reutilizacionValues = [fechaInicio, fechaFin];

  if (tipo) {
    reutilizacionConditions.push(`AND cb.tipo = $3`);
    reutilizacionValues.push(tipo);
  }

  const reutilizacionQuery = `
    SELECT
      COUNT(*) FILTER (WHERE r.estado = 'expirado')::int AS total_expirados,
      COALESCE(SUM(bd.cantidad_liberada), 0)::int AS total_liberados,
      COALESCE(SUM(bd.cantidad_no_utilizada), 0)::int AS total_no_utilizados
    FROM redenciones r
    JOIN bonos_diarios bd ON bd.id = r.bono_diario_id
    JOIN config_bonos cb ON cb.id = bd.config_bono_id
    WHERE bd.fecha BETWEEN $1::date AND $2::date
      ${reutilizacionConditions.join("\n")}
  `;

  // =====================================================
  // Query 9 - Habilitados
  // =====================================================

  const habilitadosQuerySafe = `
    WITH dias_periodo AS (
      SELECT d::date AS fecha,
             CASE EXTRACT(DOW FROM d::date)
               WHEN 1 THEN 'lunes'
               WHEN 2 THEN 'martes'
               WHEN 3 THEN 'miercoles'
               WHEN 4 THEN 'jueves'
               WHEN 5 THEN 'viernes'
               WHEN 6 THEN 'sabado'
               WHEN 0 THEN 'domingo'
             END AS dia_semana
      FROM generate_series($1::date, $2::date, '1 day') d
      WHERE d::date NOT IN (
        SELECT fecha
        FROM holidays
        WHERE fecha BETWEEN $1::date AND $2::date
      )
      AND EXTRACT(DOW FROM d::date) BETWEEN 1 AND 5
    ),
    habilitados AS (
      SELECT COUNT(*) AS total
      FROM students s
      JOIN subsidies sub ON sub.student_id = s.id
      JOIN subsidy_days sd ON sd.subsidy_id = sub.id
      JOIN dias_periodo dp ON dp.dia_semana = sd.dia
      WHERE s.tipo_estudiante = 'subsidiado'
        AND s.activo = true
        ${programa ? 'AND s.programa_codigo = $3' : ''}
    )
    SELECT total::int AS total_habilitados FROM habilitados
  `;

  const habilitadosValues = [fechaInicio, fechaFin];

  if (programa) {
    habilitadosValues.push(programa);
  }

  // =====================================================
  // Ejecutar queries
  // =====================================================

  const [
    subsidizedResult,
    activeResult,
    timeSeriesResult,
    criticalResult,
    studentsResult,
    ventaResult,
    desconocidaResult,
    reuResult,
    habilitadosResult,
  ] = await Promise.all([
    pool.query(subsidizedTotalsQuery, subsidizedValues),
    pool.query(activeSubsidizedQuery, activeValues),
    pool.query(timeSeriesQuery, subsidizedValues),
    pool.query(criticalDayQuery, subsidizedValues),
    pool.query(studentsQuery, subsidizedValues),
    pool.query(ventaLibreQuery, ventaLibreValues),
    pool.query(desconocidaQuery, desconocidaValues),
    pool.query(reutilizacionQuery, reutilizacionValues),
    pool.query(habilitadosQuerySafe, habilitadosValues),
  ]);

  const subsidizedTotals = subsidizedResult.rows[0] || {
    reclamados: 0,
    expirados: 0,
  };

  const reclamados = Number(subsidizedTotals.reclamados);
  const expirados = Number(subsidizedTotals.expirados);
  const totalInteracciones = reclamados + expirados;

  const indiceAsistencia =
    totalInteracciones > 0
      ? Number(((reclamados / totalInteracciones) * 100).toFixed(1))
      : 0;

  const estudiantesSubsidiadosActivos = Number(
    activeResult.rows[0]?.total || 0
  );

  const timeSeriesData = timeSeriesResult.rows.map((r) => ({
    periodo:
      r.periodo instanceof Date
        ? r.periodo.toISOString().slice(0, 10)
        : String(r.periodo).slice(0, 10),
    reclamados: Number(r.reclamados),
    expirados: Number(r.expirados),
  }));

  const criticalRow = criticalResult.rows[0];

  const diaCritico = criticalRow
    ? {
        fecha:
          criticalRow.fecha instanceof Date
            ? criticalRow.fecha.toISOString().slice(0, 10)
            : String(criticalRow.fecha).slice(0, 10),
        porcentajeInasistencia:
          Number(criticalRow.total) > 0
            ? Number(
                (
                  (Number(criticalRow.expirados) /
                    Number(criticalRow.total)) *
                  100
                ).toFixed(1)
              )
            : 0,
        expiradosSubsidiados: Number(criticalRow.expirados),
        comparacionPromedio: null,
      }
    : null;

  const avgAbsenteeism =
    totalInteracciones > 0
      ? Number(((expirados / totalInteracciones) * 100).toFixed(1))
      : 0;

  if (diaCritico) {
    const diff =
      diaCritico.porcentajeInasistencia - avgAbsenteeism;

    diaCritico.comparacionPromedio =
      diff >= 0
        ? `+${diff.toFixed(1)}% vs promedio`
        : `${diff.toFixed(1)}% vs promedio`;
  }

  const diasEnPeriodo = Math.max(1, timeSeriesData.length);

  const promedioDiarioAsistencia = Number(
    (reclamados / diasEnPeriodo).toFixed(1)
  );

  const studentMap = new Map();

  for (const row of studentsResult.rows) {
    const rec = Number(row.reclamados);
    const exp = Number(row.expirados);
    const total = rec + exp;

    studentMap.set(Number(row.id), {
      id: Number(row.id),
      codigo: row.codigo,
      nombre: row.nombre,
      programa: row.programa,
      reclamados: rec,
      expirados: exp,
      totalInteracciones: total,
      porcentajeAsistencia:
        total > 0 ? Number(((rec / total) * 100).toFixed(1)) : 0,
    });
  }

  const habilitadosTotal = Number(
    habilitadosResult.rows[0]?.total_habilitados || 0
  );

  const diasHabilitadosMap = new Map();

  if (habilitadosTotal > 0) {
    const habPorStudentQuery = `
      WITH dias_periodo AS (
        SELECT d::date AS fecha,
               CASE EXTRACT(DOW FROM d::date)
                 WHEN 1 THEN 'lunes'
                 WHEN 2 THEN 'martes'
                 WHEN 3 THEN 'miercoles'
                 WHEN 4 THEN 'jueves'
                 WHEN 5 THEN 'viernes'
                 WHEN 6 THEN 'sabado'
                 WHEN 0 THEN 'domingo'
               END AS dia_semana
        FROM generate_series($1::date, $2::date, '1 day') d
        WHERE d::date NOT IN (
          SELECT fecha
          FROM holidays
          WHERE fecha BETWEEN $1::date AND $2::date
        )
        AND EXTRACT(DOW FROM d::date) BETWEEN 1 AND 5
      )
      SELECT s.id, COUNT(*)::int AS dias
      FROM students s
      JOIN subsidies sub ON sub.student_id = s.id
      JOIN subsidy_days sd ON sd.subsidy_id = sub.id
      JOIN dias_periodo dp ON dp.dia_semana = sd.dia
      WHERE s.tipo_estudiante = 'subsidiado'
        AND s.activo = true
        ${programa ? 'AND s.programa_codigo = $3' : ''}
      GROUP BY s.id
    `;

    const habPorStudentValues = [fechaInicio, fechaFin];

    if (programa) {
      habPorStudentValues.push(programa);
    }

    const habPorStudentResult = await pool.query(
      habPorStudentQuery,
      habPorStudentValues
    );

    for (const row of habPorStudentResult.rows) {
      diasHabilitadosMap.set(Number(row.id), Number(row.dias));
    }
  }

  for (const [id, record] of studentMap) {
    record.diasHabilitados = diasHabilitadosMap.get(id) || 0;
  }

  const bajaFrecuencia = Array.from(studentMap.values())
    .filter((s) => s.totalInteracciones > 0)
    .sort((a, b) => a.porcentajeAsistencia - b.porcentajeAsistencia)
    .slice(0, 15);

  const mejorAsistencia = Array.from(studentMap.values())
    .filter((s) => s.totalInteracciones >= 3)
    .sort((a, b) => b.porcentajeAsistencia - a.porcentajeAsistencia)
    .slice(0, 10);

  const ventaRow = ventaResult.rows[0] || {
    solicitudes: 0,
    reclamados: 0,
    expirados: 0,
  };

  const vlSolicitudes = Number(ventaRow.solicitudes);
  const vlReclamados = Number(ventaRow.reclamados);
  const vlExpirados = Number(ventaRow.expirados);

  const ventaLibre = {
    solicitudes: vlSolicitudes,
    reclamados: vlReclamados,
    expirados: vlExpirados,
    tendenciaPorcentaje:
      vlSolicitudes > 0
        ? Number(((vlReclamados / vlSolicitudes) * 100).toFixed(1))
        : 0,
  };

  const reuRow = reuResult.rows[0] || {
    total_expirados: 0,
    total_liberados: 0,
    total_no_utilizados: 0,
  };

  const reuExpirados = Number(reuRow.total_expirados);
  const reuLiberados = Number(reuRow.total_liberados);
  const reuNoUtilizados = Number(reuRow.total_no_utilizados);

  const reutilizacion = {
    totalExpirados: reuExpirados,
    totalLiberados: reuLiberados,
    totalNoUtilizados: reuNoUtilizados,
    totalReutilizados: reuLiberados,
    totalReutilizables: reuExpirados + reuNoUtilizados,
    porcentajeReutilizacion:
      reuExpirados > 0
        ? Number(((reuLiberados / reuExpirados) * 100).toFixed(1))
        : 0,
  };

  const descRow = desconocidaResult.rows[0] || {
    total: 0,
    reclamados: 0,
    expirados: 0,
    reservados: 0,
  };

  const desconocida = {
    total: Number(descRow.total),
    reclamados: Number(descRow.reclamados),
    expirados: Number(descRow.expirados),
    reservados: Number(descRow.reservados),
  };

  return {
    filtros: {
      periodo: periodo || settings?.periodo_actual || null,
      fechaInicio,
      fechaFin,
      tipo,
      programa,
      agrupacion,
    },

    kpiPrincipal: {
      indiceAsistencia,
      reclamadosSubsidiados: reclamados,
      expiradosSubsidiados: expirados,
      totalInteracciones,
    },

    kpisSecundarios: {
      totalReclamadosSubsidiados: reclamados,
      totalExpiradosSubsidiados: expirados,
      totalNoUtilizados: reuNoUtilizados,
      totalReutilizadosExpirados: reuLiberados,
      estudiantesSubsidiadosActivos,
      promedioDiarioAsistencia,
      porcentajeReutilizacion: reutilizacion.porcentajeReutilizacion,
      asistenciaPromedioPeriodo: indiceAsistencia,
      diasHabilitadosTotal: habilitadosTotal,
    },

    timeSeries: timeSeriesData,
    diaCritico,
    bajaFrecuencia,
    mejorAsistencia,
    ventaLibre,
    reutilizacion,
    desconocida,
  };
};

module.exports = {
  getAnalytics,
};
