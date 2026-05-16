const pool = require("../../config/db");
const { getModalidadExpression } = require("../../shared/helpers/modalidad.helper");
const { isWorkingDay } = require("../../shared/helpers/workingDay.helper");

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

// ─────────────────────────────────────
// requestBono — transacción completa con FOR UPDATE
// ─────────────────────────────────────

const requestBono = async (studentId, tipo) => {
  validateTipo(tipo);
  validateStudentId(studentId);

  const workingDayCheck = await isWorkingDay();
  if (!workingDayCheck.isWorking) {
    throw new Error(workingDayCheck.reason);
  }

  const estadoSistema = await getEstadoSistema(tipo);

  if (estadoSistema.estado === "bloqueado" || estadoSistema.estado === "cerrado") {
    throw new Error(estadoSistema.mensaje);
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");

    // Expirar bonos dentro de la transacción
    await expireBonosInTransaction(client);

    // Bloquear fila crítica con FOR UPDATE
    const bonoDiario = await getOrCreateBonoDiario(tipo, client);

    // Validar subsidio si aplica
    if (estadoSistema.estado === "subsidiado") {
      await validateSubsidio(client, studentId);
    }

    // Verificar que el estudiante no tenga bono activo hoy (FOR UPDATE sobre sus redenciones)
    const alreadyHasBono = await studentAlreadyHasBono(client, studentId);
    if (alreadyHasBono) {
      throw new Error("El estudiante ya tiene un bono activo o reclamado hoy");
    }

    // Calcular disponibilidad real desde DB
    const disponibilidad = await calculateDisponibilidad(bonoDiario.id, client);

    if (disponibilidad.disponibles <= 0) {
      throw new Error("No hay bonos disponibles");
    }

    const expiracion = getExpiracion(tipo, estadoSistema.estado);

    const insertQuery = `
      INSERT INTO redenciones (
        student_id,
        bono_diario_id,
        estado,
        expiracion_at
      )
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

    const insertResult = await client.query(insertQuery, [
      studentId,
      bonoDiario.id,
      "reservado",
      expiracion,
    ]);

    await client.query("COMMIT");

    return {
      ...insertResult.rows[0],
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

// ─────────────────────────────────────
// claimBono — transacción completa con FOR UPDATE
// ─────────────────────────────────────

const claimBono = async (redencionId, codigoBono) => {
  if (codigoBono === undefined || codigoBono === null || String(codigoBono).trim() === '') {
    throw new Error("Debe ingresar el codigo del bono");
  }

  const codigoNumerico = Number(codigoBono);

  if (!Number.isInteger(codigoNumerico) || codigoNumerico <= 0) {
    throw new Error("El codigo del bono debe ser un numero entero positivo");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Bloquear la redención específica con FOR UPDATE
    const searchQuery = `
      SELECT *
      FROM redenciones
      WHERE id = $1
      FOR UPDATE
    `;

    const searchResult = await client.query(searchQuery, [redencionId]);

    if (searchResult.rows.length === 0) {
      throw new Error("Redencion no encontrada");
    }

    const redencion = searchResult.rows[0];

    if (redencion.estado !== "reservado") {
      throw new Error("El bono no puede reclamarse");
    }

    if (new Date(redencion.expiracion_at) < new Date()) {
      // Expirar dentro de la transacción
      await client.query(
        `UPDATE redenciones SET estado = 'expirado', updated_at = NOW()
         WHERE id = $1 AND estado = 'reservado'`,
        [redencionId],
      );
      throw new Error("El bono ya expiro");
    }

    const updateQuery = `
      UPDATE redenciones
      SET
        estado = 'reclamado',
        hora_reclamo = NOW(),
        codigo_bono = $2,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const updateResult = await client.query(updateQuery, [redencionId, codigoNumerico]);

    if (updateResult.rows.length === 0) {
      throw new Error("No se pudo reclamar el bono");
    }

    await client.query("COMMIT");

    return updateResult.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────
// getDisponibilidad — solo lectura, no necesita transacción
// ─────────────────────────────────────

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

// ─────────────────────────────────────
// getEstadoSistema — validación de día hábil
// ─────────────────────────────────────

const getEstadoSistema = async (tipo) => {
  if (!VALID_BONO_TYPES.includes(tipo)) {
    return {
      estado: "cerrado",
      mensaje: "Tipo de bono invalido",
    };
  }

  const workingDayCheck = await isWorkingDay();
  if (!workingDayCheck.isWorking) {
    return {
      estado: "cerrado",
      mensaje: workingDayCheck.reason,
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

// ─────────────────────────────────────
// getStudentBonos — solo lectura
// ─────────────────────────────────────

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

// ─────────────────────────────────────
// getResumenDiario — solo lectura
// ─────────────────────────────────────

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
      sub.tiene_beca,
      cb.tipo,
      r.estado,
      r.hora_solicitud,
      r.hora_reclamo,
      r.expiracion_at,
      r.codigo_bono,
      r.sincronizado_google,
      ${modalidadExpression} AS modalidad
    FROM redenciones r
    JOIN students s
      ON s.id = r.student_id
    JOIN bonos_diarios bd
      ON bd.id = r.bono_diario_id
    JOIN config_bonos cb
      ON cb.id = bd.config_bono_id
    LEFT JOIN subsidies sub
      ON sub.student_id = s.id
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

// ─────────────────────────────────────
// getStatsDiarias — solo lectura
// ─────────────────────────────────────

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
    noUtilizados: 0,
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

  const noUtilQuery = `
    SELECT COALESCE(SUM(cantidad_no_utilizada), 0)::int AS total
    FROM bonos_diarios
    WHERE fecha = CURRENT_DATE
  `;
  const noUtilResult = await pool.query(noUtilQuery);
  stats.noUtilizados = Number(noUtilResult.rows[0].total);

  return {
    ...stats,
    frecuenciaUso:
      stats.totalSolicitudes > 0
        ? Number(((stats.reclamados / stats.totalSolicitudes) * 100).toFixed(1))
        : 0,
  };
};

// ─────────────────────────────────────
// liberarBonos — transacción con FOR UPDATE
// ─────────────────────────────────────

const liberarBonos = async (tipo, cantidad) => {
  validateTipo(tipo);
  const cantidadNumerica = validateCantidad(cantidad);
  await expireBonos();

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const bonoDiario = await getOrCreateBonoDiario(tipo, client);
    const disponibilidad = await calculateDisponibilidad(bonoDiario.id, client);

    const reutilizables = disponibilidad.reutilizables;

    if (reutilizables <= 0) {
      throw new Error("No hay cupos reutilizables disponibles (ni expirados ni no utilizados)");
    }

    if (cantidadNumerica > reutilizables) {
      throw new Error(
        `Solo hay ${reutilizables} cupos reutilizables (${disponibilidad.expiradosPendientes} expirados + ${disponibilidad.noUtilizada} no utilizados)`,
      );
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

// ─────────────────────────────────────
// cargarBonosExtra — transacción
// ─────────────────────────────────────

const cargarBonosExtra = async (tipo, cantidad) => {
  validateTipo(tipo);
  const cantidadNumerica = validateCantidad(cantidad);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const bonoDiario = await getOrCreateBonoDiario(tipo, client);

    const updateQuery = `
      UPDATE bonos_diarios
      SET
        cantidad_extra = cantidad_extra + $1,
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

// ─────────────────────────────────────
// establecerCantidadBase — transacción
// ─────────────────────────────────────

const establecerCantidadBase = async (tipo, cantidad) => {
  validateTipo(tipo);
  const cantidadNumerica = validateCantidad(cantidad);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const bonoDiario = await getOrCreateBonoDiario(tipo, client);

    const updateDiarioQuery = `
      UPDATE bonos_diarios
      SET
        cantidad_base = $1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;

    const diarioResult = await client.query(updateDiarioQuery, [cantidadNumerica, bonoDiario.id]);

    const updateConfigQuery = `
      UPDATE config_bonos
      SET
        cantidad_base = $1
      WHERE tipo = $2
    `;

    await client.query(updateConfigQuery, [cantidadNumerica, tipo]);

    await client.query("COMMIT");

    return diarioResult.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────
// getOrCreateBonoDiario — con FOR UPDATE y ON CONFLICT
// ─────────────────────────────────────

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

  // ON CONFLICT previene creación duplicada en race condition
  const createQuery = `
    INSERT INTO bonos_diarios (
      config_bono_id,
      fecha,
      cantidad_base
    )
    VALUES ($1, CURRENT_DATE, $2)
    ON CONFLICT (config_bono_id, fecha) DO NOTHING
    RETURNING *
  `;

  const createResult = await client.query(createQuery, [
    configBono.id,
    configBono.cantidad_base,
  ]);

  if (createResult.rows.length > 0) {
    return createResult.rows[0];
  }

  // Si ON CONFLICT impidió el insert, hacer SELECT de nuevo
  const retryResult = await client.query(diarioQuery, [configBono.id]);
  return retryResult.rows[0];
};

// ─────────────────────────────────────
// studentAlreadyHasBono — verificación dentro de transacción
// ─────────────────────────────────────

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

// ─────────────────────────────────────
// validateSubsidio — validación de día de subsidio
// ─────────────────────────────────────

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

// ─────────────────────────────────────
// calculateDisponibilidad — cálculo desde DB real
// ─────────────────────────────────────

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
  const noUtilizada = Number(bonoDiario.cantidad_no_utilizada || 0);

  const totalOperativo = Number(bonoDiario.cantidad_base) + Number(bonoDiario.cantidad_extra);
  const reservasActivas = reservados + reclamados;
  const disponibles = totalOperativo - reservasActivas - expiradosPendientes - noUtilizada;

  const reutilizables = expiradosPendientes + noUtilizada;

  return {
    totalOperativo,
    cantidadBase: Number(bonoDiario.cantidad_base),
    cantidadExtra: Number(bonoDiario.cantidad_extra),
    reservasActivas,
    reservados,
    reclamados,
    expirados,
    expiradosLiberados,
    expiradosPendientes,
    noUtilizada,
    reutilizables,
    disponibles: Math.max(disponibles, 0),
  };
};

// ─────────────────────────────────────
// expireBonos — expira reservas vencidas (usa pool propio, idempotente)
// ─────────────────────────────────────

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

  await calcularNoUtilizada();

  return result.rows;
};

// ─────────────────────────────────────
// expireBonosInTransaction — expira dentro de transacción existente
// ─────────────────────────────────────

const expireBonosInTransaction = async (client) => {
  const expireQuery = `
    UPDATE redenciones
    SET
      estado = 'expirado',
      updated_at = NOW()
    WHERE estado = 'reservado'
    AND expiracion_at < NOW()
  `;

  await client.query(expireQuery);
};

// ─────────────────────────────────────
// getClosingTime / isPastClosing
// ─────────────────────────────────────

const getClosingTime = (tipo) => {
  const now = new Date();
  const closing = new Date(now);
  const horario = HORARIOS[tipo];

  closing.setHours(horario.ventaLibre.expiracion.hours, horario.ventaLibre.expiracion.minutes, 0, 0);

  return closing;
};

const isPastClosing = (tipo) => {
  const closing = getClosingTime(tipo);
  return new Date() >= closing;
};

// ─────────────────────────────────────
// cerrarOperacionDiaria — cierre explícito
// ─────────────────────────────────────

const cerrarOperacionDiaria = async (tipo) => {
  validateTipo(tipo);

  const bonoDiarioQuery = `
    SELECT * FROM bonos_diarios bd
    JOIN config_bonos cb ON cb.id = bd.config_bono_id
    WHERE cb.tipo = $1 AND bd.fecha = CURRENT_DATE
  `;
  const bonoResult = await pool.query(bonoDiarioQuery, [tipo]);

  if (bonoResult.rows.length === 0) return null;

  const bonoDiario = bonoResult.rows[0];
  const totalOperativo = Number(bonoDiario.cantidad_base) + Number(bonoDiario.cantidad_extra);

  const reservadosQuery = `
    SELECT COUNT(*)::int AS total_reservados
    FROM redenciones
    WHERE bono_diario_id = $1
  `;
  const reservadosResult = await pool.query(reservadosQuery, [bonoDiario.id]);
  const totalReservados = Number(reservadosResult.rows[0].total_reservados);

  const noUtilizada = Math.max(0, totalOperativo - totalReservados);

  await pool.query(
    `UPDATE bonos_diarios SET cantidad_no_utilizada = $1, updated_at = NOW() WHERE id = $2`,
    [noUtilizada, bonoDiario.id],
  );

  return {
    tipo,
    totalOperativo,
    totalReservados,
    noUtilizada,
  };
};

const calcularNoUtilizada = async (client = pool) => {
  for (const tipo of VALID_BONO_TYPES) {
    if (!isPastClosing(tipo)) continue;
    await cerrarOperacionDiariaInterna(tipo, client);
  }
};

const cerrarOperacionDiariaInterna = async (tipo, client) => {
  const bonoDiarioQuery = `
    SELECT * FROM bonos_diarios bd
    JOIN config_bonos cb ON cb.id = bd.config_bono_id
    WHERE cb.tipo = $1 AND bd.fecha = CURRENT_DATE
  `;
  const bonoResult = await client.query(bonoDiarioQuery, [tipo]);

  if (bonoResult.rows.length === 0) return;

  const bonoDiario = bonoResult.rows[0];
  const totalOperativo = Number(bonoDiario.cantidad_base) + Number(bonoDiario.cantidad_extra);

  const reservadosQuery = `
    SELECT COUNT(*)::int AS total_reservados
    FROM redenciones
    WHERE bono_diario_id = $1
  `;
  const reservadosResult = await client.query(reservadosQuery, [bonoDiario.id]);
  const totalReservados = Number(reservadosResult.rows[0].total_reservados);

  const noUtilizada = Math.max(0, totalOperativo - totalReservados);

  await client.query(
    `UPDATE bonos_diarios SET cantidad_no_utilizada = $1, updated_at = NOW() WHERE id = $2`,
    [noUtilizada, bonoDiario.id],
  );
};

// ─────────────────────────────────────
// getExpiracion — calcula fecha de expiración
// ─────────────────────────────────────

const getExpiracion = (tipo, modalidad) => {
  const horario = modalidad === "subsidiado"
    ? HORARIOS[tipo].subsidiado
    : HORARIOS[tipo].ventaLibre;

  const expiracion = new Date();
  expiracion.setHours(horario.expiracion.hours, horario.expiracion.minutes, 0, 0);

  return expiracion;
};

// ─────────────────────────────────────
// Validaciones
// ─────────────────────────────────────

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

module.exports = {
  requestBono,
  claimBono,
  expireBonos,
  calcularNoUtilizada,
  cerrarOperacionDiaria,
  getDisponibilidad,
  getStudentBonos,
  getResumenDiario,
  getStatsDiarias,
  liberarBonos,
  cargarBonosExtra,
  establecerCantidadBase,
  getEstadoSistema,
};
