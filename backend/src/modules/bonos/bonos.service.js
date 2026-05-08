const pool = require("../../config/db");

const requestBono = async (studentId, tipo) => {
  const bonoDiario = await getOrCreateBonoDiario(tipo);
  const alreadyHasBono = await studentAlreadyHasBono(studentId);

  const disponibilidad = await calculateDisponibilidad(bonoDiario.id);

  console.log("DISPONIBILIDAD:", disponibilidad);

  if (disponibilidad.disponibles <= 0) {
    throw new Error("No hay bonos disponibles");
  }

  if (alreadyHasBono) {
    throw new Error("El estudiante ya tiene un bono hoy");
  }

  const reserva = await createReserva(studentId, bonoDiario, tipo);

  console.log("RESERVA CREADA:", reserva);

  return reserva;
};

const getOrCreateBonoDiario = async (tipo) => {
  try {
    // 1. Buscar configuración base

    const bonoQuery = `
      SELECT *
      FROM config_bonos
      WHERE tipo = $1
    `;

    const bonoResult = await pool.query(bonoQuery, [tipo]);

    if (bonoResult.rows.length === 0) {
      throw new Error("Configuración de bono no encontrada");
    }

    const configBono = bonoResult.rows[0];

    console.log("CONFIG BONO:", configBono);

    // 2. Buscar bono diario de hoy

    const diarioQuery = `
      SELECT *
      FROM bonos_diarios
      WHERE config_bono_id = $1
      AND fecha = CURRENT_DATE
    `;

    const diarioResult = await pool.query(diarioQuery, [configBono.id]);

    // 3. Si YA existe → retornarlo

    if (diarioResult.rows.length > 0) {
      console.log("BONO DIARIO EXISTENTE");

      return diarioResult.rows[0];
    }

    // 4. Si NO existe → crearlo

    const createQuery = `
      INSERT INTO bonos_diarios (
        config_bono_id,
        fecha,
        cantidad_base
      )
      VALUES ($1, CURRENT_DATE, $2)
      RETURNING *
    `;

    const createResult = await pool.query(createQuery, [
      configBono.id,
      configBono.cantidad_base,
    ]);

    console.log("BONO DIARIO CREADO");

    return createResult.rows[0];
  } catch (error) {
    console.error("Error obteniendo o creando bono diario:", error);

    throw error;
  }
};

const studentAlreadyHasBono = async (studentId) => {
  const query = `
    SELECT *
    FROM redenciones r
    JOIN bonos_diarios bd
      ON bd.id = r.bono_diario_id
    WHERE r.student_id = $1
    AND bd.fecha = CURRENT_DATE
    AND r.estado IN ('reservado', 'reclamado')
  `;

  const result = await pool.query(query, [studentId]);

  return result.rows.length > 0;
};

const createReserva = async (studentId, bonoDiario, tipo) => {
  let expiracion;

  const now = new Date();

  if (tipo === "almuerzo") {
    expiracion = new Date();

    expiracion.setHours(11, 0, 0, 0);
  } else {
    expiracion = new Date();

    expiracion.setHours(22, 0, 0, 0);
  }

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

  const result = await pool.query(query, values);

  return result.rows[0];
};

const calculateDisponibilidad = async (bonoDiarioId) => {
  // 1. Obtener bono diario

  const bonoQuery = `
    SELECT *
    FROM bonos_diarios
    WHERE id = $1
  `;

  const bonoResult = await pool.query(bonoQuery, [bonoDiarioId]);

  const bonoDiario = bonoResult.rows[0];

  // 2. Contar reservas activas

  const redencionesQuery = `
    SELECT COUNT(*) AS total
    FROM redenciones
    WHERE bono_diario_id = $1
    AND estado IN ('reservado', 'reclamado')
  `;

  const redencionesResult = await pool.query(redencionesQuery, [bonoDiarioId]);

  const reservasActivas = Number(redencionesResult.rows[0].total);

  // 3. Calcular total disponible

  const totalOperativo =
    bonoDiario.cantidad_base +
    bonoDiario.cantidad_extra +
    bonoDiario.cantidad_liberada;

  const disponibles = totalOperativo - reservasActivas;

  return {
    totalOperativo,
    reservasActivas,
    disponibles,
  };
};

module.exports = {
  requestBono,
};
