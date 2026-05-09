const pool = require("../../config/db");

const VALID_BONO_TYPES = ["almuerzo", "refrigerio"];

const HORARIOS = {
  almuerzo: {
    subsidiado: {
      inicio: 8 * 60,
      fin: 10 * 60 + 15,
      expiracion: { hours: 11, minutes: 0 },
    },
    ventaLibre: {
      inicio: 11 * 60 + 30,
      fin: 12 * 60 + 5,
      expiracion: { hours: 12, minutes: 5 },
    },
  },
  refrigerio: {
    subsidiado: {
      inicio: 17 * 60,
      fin: 18 * 60 + 29,
      expiracion: { hours: 21, minutes: 30 },
    },
    ventaLibre: {
      inicio: 18 * 60 + 30,
      fin: 22 * 60,
      expiracion: { hours: 22, minutes: 0 },
    },
  },
};

const DIAS_SEMANA = [
  "domingo",
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
];

const requestBono = async (studentId, tipo) => {
  validateTipo(tipo);
  validateStudentId(studentId);

  await expireBonos();

  const estadoSistema = getEstadoSistema(tipo);

  if (estadoSistema.estado === "bloqueado" || estadoSistema.estado === "cerrado") {
    throw new Error(estadoSistema.mensaje);
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (estadoSistema.estado === "subsidiado") {
      await validateSubsidio(client, studentId);
    }

    const alreadyHasBono = await studentAlreadyHasBono(client, studentId);
    if (alreadyHasBono) {
      throw new Error("El estudiante ya tiene un bono activo o reclamado hoy");
    }

    const bonoDiario = await getOrCreateBonoDiario(tipo, client);
    const disponibilidad = await calculateDisponibilidad(bonoDiario.id, client);

    if (disponibilidad.disponibles <= 0) {
      throw new Error("No hay bonos disponibles");
    }

    const reserva = await createReserva(
      client,
      studentId,
      bonoDiario,
      tipo,
      estadoSistema.estado,
    );

    await client.query("COMMIT");

    return {
      ...reserva,
      tipo,
      modalidad: estadoSistema.estado,
      disponibilidad: {
        ...disponibilidad,
        disponibles: disponibilidad.disponibles - 1,
      },
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const getDisponibilidad = async (tipo) => {
  validateTipo(tipo);
  await expireBonos();

  const bonoDiario = await getOrCreateBonoDiario(tipo);
  const disponibilidad = await calculateDisponibilidad(bonoDiario.id);

  return {
    tipo,
    ...disponibilidad,
  };
};

const getEstadoSistema = (tipo) => {
  if (!VALID_BONO_TYPES.includes(tipo)) {
    return {
      estado: "cerrado",
      mensaje: "Tipo de bono invalido",
    };
  }

  const now = new Date();
  const horaActual = now.getHours() * 60 + now.getMinutes();
  const horario = HORARIOS[tipo];

  if (
    horaActual >= horario.subsidiado.inicio &&
    horaActual <= horario.subsidiado.fin
  ) {
    return {
      estado: "subsidiado",
      mensaje: "Horario subsidiado activo",
    };
  }

  if (
    horaActual >= horario.ventaLibre.inicio &&
    horaActual <= horario.ventaLibre.fin
  ) {
    return {
      estado: "venta_libre",
      mensaje: "Venta libre activa",
    };
  }

  if (horaActual > horario.subsidiado.fin && horaActual < horario.ventaLibre.inicio) {
    return {
      estado: "bloqueado",
      mensaje: "Sistema temporalmente bloqueado",
    };
  }

  return {
    estado: "cerrado",
    mensaje: "Sistema fuera de horario",
  };
};

const getStudentBonos = async (studentId) => {
  validateStudentId(studentId);
  await expireBonos();

  const query = `
    SELECT
      r.id,
      cb.tipo,
      r.estado,
      bd.fecha,
      r.hora_solicitud,
      r.hora_reclamo,
      r.expiracion_at
    FROM redenciones r
    JOIN bonos_diarios bd
      ON bd.id = r.bono_diario_id
    JOIN config_bonos cb
      ON cb.id = bd.config_bono_id
    WHERE r.student_id = $1
    ORDER BY r.created_at DESC
  `;

  const result = await pool.query(query, [studentId]);

  return result.rows;
};

const getResumenDiario = async (filters = {}) => {
  await expireBonos();

  const page = Math.max(Number(filters.page) || 1, 1);
  const limit = Math.min(Math.max(Number(filters.limit) || 10, 1), 1000);
  const offset = (page - 1) * limit;
  const values = [];
  const conditions = ["bd.fecha = CURRENT_DATE"];

  if (filters.tipo) {
    validateTipo(filters.tipo);
    values.push(filters.tipo);
    conditions.push(`cb.tipo = $${values.length}`);
  }

  if (filters.estado) {
    values.push(filters.estado);
    conditions.push(`r.estado = $${values.length}`);
  }

  if (filters.codigo) {
    values.push(`%${filters.codigo}%`);
    conditions.push(`s.codigo ILIKE $${values.length}`);
  }

  const modalidadExpression = getModalidadExpression();

  if (filters.modalidad) {
    values.push(filters.modalidad);
    conditions.push(`${modalidadExpression} = $${values.length}`);
  }

  const whereClause = conditions.join(" AND ");

  const dataQuery = `
    SELECT
      r.id,
      s.codigo,
      s.nombre,
      s.programa_codigo,
      s.programa_nombre,
      s.tipo_estudiante,
      cb.tipo,
      r.estado,
      r.hora_solicitud,
      r.hora_reclamo,
      r.expiracion_at,
      ${modalidadExpression} AS modalidad
    FROM redenciones r
    JOIN students s
      ON s.id = r.student_id
    JOIN bonos_diarios bd
      ON bd.id = r.bono_diario_id
    JOIN config_bonos cb
      ON cb.id = bd.config_bono_id
    WHERE ${whereClause}
    ORDER BY r.created_at DESC
    LIMIT $${values.length + 1}
    OFFSET $${values.length + 2}
  `;

  const countQuery = `
    SELECT COUNT(*) AS total
    FROM redenciones r
    JOIN students s
      ON s.id = r.student_id
    JOIN bonos_diarios bd
      ON bd.id = r.bono_diario_id
    JOIN config_bonos cb
      ON cb.id = bd.config_bono_id
    WHERE ${whereClause}
  `;

  const [dataResult, countResult] = await Promise.all([
    pool.query(dataQuery, [...values, limit, offset]),
    pool.query(countQuery, values),
  ]);

  const total = Number(countResult.rows[0].total);

  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    rows: dataResult.rows,
  };
};

const getStatsDiarias = async () => {
  await expireBonos();

  const modalidadExpression = getModalidadExpression();

  const query = `
    SELECT
      cb.tipo,
      r.estado,
      ${modalidadExpression} AS modalidad,
      COUNT(*) AS total
    FROM redenciones r
    JOIN bonos_diarios bd
      ON bd.id = r.bono_diario_id
    JOIN config_bonos cb
      ON cb.id = bd.config_bono_id
    WHERE bd.fecha = CURRENT_DATE
    GROUP BY cb.tipo, r.estado, modalidad
  `;

  const result = await pool.query(query);

  const stats = {
    totalSolicitudes: 0,
    reclamados: 0,
    reservados: 0,
    expirados: 0,
    porTipo: {
      almuerzo: 0,
      refrigerio: 0,
    },
    porModalidad: {
      subsidiado: 0,
      venta_libre: 0,
      desconocida: 0,
    },
    rows: result.rows.map((row) => ({
      tipo: row.tipo,
      estado: row.estado,
      modalidad: row.modalidad,
      total: Number(row.total),
    })),
  };

  for (const row of stats.rows) {
    stats.totalSolicitudes += row.total;
    stats.porTipo[row.tipo] += row.total;
    stats.porModalidad[row.modalidad] += row.total;

    if (row.estado === "reclamado") stats.reclamados += row.total;
    if (row.estado === "reservado") stats.reservados += row.total;
    if (row.estado === "expirado") stats.expirados += row.total;
  }

  return {
    ...stats,
    frecuenciaUso:
      stats.totalSolicitudes > 0
        ? Number(((stats.reclamados / stats.totalSolicitudes) * 100).toFixed(1))
        : 0,
  };
};

const liberarBonos = async (tipo, cantidad) => {
  validateTipo(tipo);
  const cantidadNumerica = validateCantidad(cantidad);
  await expireBonos();

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const bonoDiario = await getOrCreateBonoDiario(tipo, client);
    const disponibilidad = await calculateDisponibilidad(bonoDiario.id, client);

    const expiradosPendientes =
      disponibilidad.expirados - disponibilidad.expiradosLiberados;

    if (expiradosPendientes <= 0) {
      throw new Error("No hay bonos expirados pendientes por liberar");
    }

    if (cantidadNumerica > expiradosPendientes) {
      throw new Error(`Solo hay ${expiradosPendientes} bonos expirados pendientes por liberar`);
    }

    const updateQuery = `
      UPDATE bonos_diarios
      SET
        cantidad_liberada = cantidad_liberada + $1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;

    const result = await client.query(updateQuery, [cantidadNumerica, bonoDiario.id]);

    await client.query("COMMIT");

    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const cargarBonosExtra = async (tipo, cantidad) => {
  validateTipo(tipo);
  const cantidadNumerica = validateCantidad(cantidad);

  const bonoDiario = await getOrCreateBonoDiario(tipo);

  const updateQuery = `
    UPDATE bonos_diarios
    SET
      cantidad_extra = cantidad_extra + $1,
      updated_at = NOW()
    WHERE id = $2
    RETURNING *
  `;

  const result = await pool.query(updateQuery, [cantidadNumerica, bonoDiario.id]);

  return result.rows[0];
};

const establecerCantidadBase = async (tipo, cantidad) => {
  validateTipo(tipo);
  const cantidadNumerica = validateCantidad(cantidad);

  const bonoDiario = await getOrCreateBonoDiario(tipo);

  const updateQuery = `
    UPDATE bonos_diarios
    SET
      cantidad_base = $1,
      updated_at = NOW()
    WHERE id = $2
    RETURNING *
  `;

  const result = await pool.query(updateQuery, [cantidadNumerica, bonoDiario.id]);

  return result.rows[0];
};

const claimBono = async (redencionId) => {
  const searchQuery = `
    SELECT *
    FROM redenciones
    WHERE id = $1
  `;

  const searchResult = await pool.query(searchQuery, [redencionId]);

  if (searchResult.rows.length === 0) {
    throw new Error("Redencion no encontrada");
  }

  const redencion = searchResult.rows[0];

  if (redencion.estado !== "reservado") {
    throw new Error("El bono no puede reclamarse");
  }

  if (new Date(redencion.expiracion_at) < new Date()) {
    await expireBonos();
    throw new Error("El bono ya expiro");
  }

  const updateQuery = `
    UPDATE redenciones
    SET
      estado = 'reclamado',
      hora_reclamo = NOW(),
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `;

  const updateResult = await pool.query(updateQuery, [redencionId]);

  return updateResult.rows[0];
};

const getOrCreateBonoDiario = async (tipo, client = pool) => {
  const bonoQuery = `
    SELECT *
    FROM config_bonos
    WHERE tipo = $1
  `;

  const bonoResult = await client.query(bonoQuery, [tipo]);

  if (bonoResult.rows.length === 0) {
    throw new Error("Configuracion de bono no encontrada");
  }

  const configBono = bonoResult.rows[0];

  const diarioQuery = `
    SELECT *
    FROM bonos_diarios
    WHERE config_bono_id = $1
    AND fecha = CURRENT_DATE
    FOR UPDATE
  `;

  const diarioResult = await client.query(diarioQuery, [configBono.id]);

  if (diarioResult.rows.length > 0) {
    return diarioResult.rows[0];
  }

  const createQuery = `
    INSERT INTO bonos_diarios (
      config_bono_id,
      fecha,
      cantidad_base
    )
    VALUES ($1, CURRENT_DATE, $2)
    RETURNING *
  `;

  const createResult = await client.query(createQuery, [
    configBono.id,
    configBono.cantidad_base,
  ]);

  return createResult.rows[0];
};

const studentAlreadyHasBono = async (client, studentId) => {
  const query = `
    SELECT r.id
    FROM redenciones r
    JOIN bonos_diarios bd
      ON bd.id = r.bono_diario_id
    WHERE r.student_id = $1
    AND bd.fecha = CURRENT_DATE
    AND r.estado IN ('reservado', 'reclamado')
    LIMIT 1
  `;

  const result = await client.query(query, [studentId]);

  return result.rows.length > 0;
};

const validateSubsidio = async (client, studentId) => {
  const diaActual = DIAS_SEMANA[new Date().getDay()];

  const query = `
    SELECT sd.dia
    FROM students s
    JOIN subsidies sub
      ON sub.student_id = s.id
    JOIN subsidy_days sd
      ON sd.subsidy_id = sub.id
    WHERE s.id = $1
    AND s.tipo_estudiante = 'subsidiado'
  `;

  const result = await client.query(query, [studentId]);
  const tieneDiaActivo = result.rows.some((row) => {
    return normalizeDia(row.dia) === diaActual;
  });

  if (!tieneDiaActivo) {
    throw new Error("El estudiante no tiene subsidio activo para el dia de hoy");
  }
};

const createReserva = async (client, studentId, bonoDiario, tipo, modalidad) => {
  const expiracion = getExpiracion(tipo, modalidad);

  const query = `
    INSERT INTO redenciones (
      student_id,
      bono_diario_id,
      estado,
      expiracion_at
    )
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `;

  const values = [studentId, bonoDiario.id, "reservado", expiracion];

  const result = await client.query(query, values);

  return result.rows[0];
};

const calculateDisponibilidad = async (bonoDiarioId, client = pool) => {
  const bonoQuery = `
    SELECT *
    FROM bonos_diarios
    WHERE id = $1
  `;

  const bonoResult = await client.query(bonoQuery, [bonoDiarioId]);
  const bonoDiario = bonoResult.rows[0];

  if (!bonoDiario) {
    throw new Error("Bono diario no encontrado");
  }

  const redencionesQuery = `
    SELECT
      COUNT(*) FILTER (WHERE estado = 'reservado') AS reservados,
      COUNT(*) FILTER (WHERE estado = 'reclamado') AS reclamados,
      COUNT(*) FILTER (WHERE estado = 'expirado') AS expirados
    FROM redenciones
    WHERE bono_diario_id = $1
  `;

  const redencionesResult = await client.query(redencionesQuery, [bonoDiarioId]);
  const redenciones = redencionesResult.rows[0];

  const reservados = Number(redenciones.reservados);
  const reclamados = Number(redenciones.reclamados);
  const expirados = Number(redenciones.expirados);
  const expiradosLiberados = Math.min(Number(bonoDiario.cantidad_liberada), expirados);
  const expiradosPendientes = expirados - expiradosLiberados;

  const totalOperativo = bonoDiario.cantidad_base + bonoDiario.cantidad_extra;
  const reservasActivas = reservados + reclamados;
  const disponibles = totalOperativo - reservasActivas - expiradosPendientes;

  return {
    totalOperativo,
    cantidadBase: bonoDiario.cantidad_base,
    cantidadExtra: bonoDiario.cantidad_extra,
    reservasActivas,
    reservados,
    reclamados,
    expirados,
    expiradosLiberados,
    expiradosPendientes,
    disponibles: Math.max(disponibles, 0),
  };
};

const expireBonos = async () => {
  const expireQuery = `
    UPDATE redenciones
    SET
      estado = 'expirado',
      updated_at = NOW()
    WHERE estado = 'reservado'
    AND expiracion_at < NOW()
    RETURNING *
  `;

  const result = await pool.query(expireQuery);

  return result.rows;
};

const getExpiracion = (tipo, modalidad) => {
  const horario = modalidad === "subsidiado"
    ? HORARIOS[tipo].subsidiado
    : HORARIOS[tipo].ventaLibre;

  const expiracion = new Date();
  expiracion.setHours(horario.expiracion.hours, horario.expiracion.minutes, 0, 0);

  return expiracion;
};

const validateTipo = (tipo) => {
  if (!VALID_BONO_TYPES.includes(tipo)) {
    throw new Error("Tipo de bono invalido");
  }
};

const validateStudentId = (studentId) => {
  if (!studentId || Number.isNaN(Number(studentId))) {
    throw new Error("Estudiante invalido");
  }
};

const validateCantidad = (cantidad) => {
  const cantidadNumerica = Number(cantidad);

  if (!Number.isInteger(cantidadNumerica) || cantidadNumerica <= 0) {
    throw new Error("La cantidad debe ser un numero entero positivo");
  }

  return cantidadNumerica;
};

const normalizeDia = (dia) => {
  return String(dia)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

const getModalidadExpression = () => {
  return `
    CASE
      WHEN cb.tipo = 'almuerzo'
        AND r.hora_solicitud::time BETWEEN TIME '08:00' AND TIME '10:15'
        THEN 'subsidiado'
      WHEN cb.tipo = 'almuerzo'
        AND r.hora_solicitud::time BETWEEN TIME '11:30' AND TIME '12:05'
        THEN 'venta_libre'
      WHEN cb.tipo = 'refrigerio'
        AND r.hora_solicitud::time BETWEEN TIME '17:00' AND TIME '18:29'
        THEN 'subsidiado'
      WHEN cb.tipo = 'refrigerio'
        AND r.hora_solicitud::time BETWEEN TIME '18:30' AND TIME '22:00'
        THEN 'venta_libre'
      ELSE 'desconocida'
    END
  `;
};

module.exports = {
  requestBono,
  claimBono,
  expireBonos,
  getDisponibilidad,
  getStudentBonos,
  getResumenDiario,
  getStatsDiarias,
  liberarBonos,
  cargarBonosExtra,
  establecerCantidadBase,
  getEstadoSistema,
};
