const pool = require("../../config/db");
const { getBogotaDateTime } = require("../../shared/helpers/timezone.helper");
const { BOGOTA } = require("../../shared/helpers/sql-timezone.helper");

const VALID_WORKING_DAYS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];

const getServerTime = async () => {
  return { serverTime: getBogotaDateTime() };
};

// ── System Settings ──

const getSystemSettings = async () => {
  const result = await pool.query("SELECT id, periodo_actual, fecha_inicio::text AS fecha_inicio, fecha_fin::text AS fecha_fin, created_at, updated_at FROM system_settings WHERE id = 1");

  if (result.rows.length === 0) {
    await pool.query("INSERT INTO system_settings (id, periodo_actual) VALUES (1, '2026-1') ON CONFLICT (id) DO NOTHING");
    const inserted = await pool.query("SELECT id, periodo_actual, fecha_inicio::text AS fecha_inicio, fecha_fin::text AS fecha_fin, created_at, updated_at FROM system_settings WHERE id = 1");
    return inserted.rows[0];
  }

  return result.rows[0];
};

const updateSystemSettings = async (data) => {
  const fields = [];
  const values = [];
  let paramIndex = 0;

  if (data.periodo_actual !== undefined) {
    paramIndex++;
    fields.push(`periodo_actual = $${paramIndex}`);
    values.push(data.periodo_actual);
  }

  if (data.fecha_inicio !== undefined) {
    paramIndex++;
    fields.push(`fecha_inicio = $${paramIndex}`);
    values.push(data.fecha_inicio || null);
  }

  if (data.fecha_fin !== undefined) {
    paramIndex++;
    fields.push(`fecha_fin = $${paramIndex}`);
    values.push(data.fecha_fin || null);
  }

  if (fields.length === 0) {
    const current = await getSystemSettings();
    return current;
  }

  fields.push(`updated_at = ${BOGOTA.timestamp}`);
  paramIndex++;
  values.push(1);

  const query = `UPDATE system_settings SET ${fields.join(", ")} WHERE id = $${paramIndex} RETURNING *`;

  const result = await pool.query(query, values);

  return result.rows[0];
};

// ── Working Days ──

const getWorkingDays = async () => {
  const result = await pool.query("SELECT * FROM working_days ORDER BY id");
  return result.rows;
};

const updateWorkingDays = async (days) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const day of days) {
      await client.query(
        "UPDATE working_days SET activo = $1 WHERE dia = $2",
        [day.activo, day.dia],
      );
    }

    await client.query("COMMIT");

    return await getWorkingDays();
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// ── Holidays ──

const getHolidays = async () => {
  const result = await pool.query("SELECT id, fecha::text AS fecha, descripcion FROM holidays ORDER BY fecha");
  return result.rows;
};

const createHoliday = async (data) => {
  const result = await pool.query(
    "INSERT INTO holidays (fecha, descripcion) VALUES ($1, $2) RETURNING *",
    [data.fecha, data.descripcion || null],
  );

  return result.rows[0];
};

const updateHoliday = async (id, data) => {
  const result = await pool.query(
    `UPDATE holidays
     SET fecha = $1, descripcion = $2
     WHERE id = $3
     RETURNING id, fecha::text AS fecha, descripcion`,
    [data.fecha, data.descripcion || null, id],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
};

const deleteHoliday = async (id) => {
  const result = await pool.query(
    "DELETE FROM holidays WHERE id = $1 RETURNING *",
    [id],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
};

// ── Academic Periods ──

const getAcademicPeriods = async () => {
  const result = await pool.query(`
    SELECT
      ap.id,
      ap.periodo,
      ap.fecha_inicio::text AS fecha_inicio,
      ap.fecha_fin::text AS fecha_fin,
      ap.activo,
      ap.created_at,
      ap.updated_at,
      COUNT(DISTINCT apwd.id)::int AS working_days_count,
      COUNT(DISTINCT aph.id)::int AS holidays_count
    FROM academic_periods ap
    LEFT JOIN academic_period_working_days apwd
      ON apwd.academic_period_id = ap.id
      AND apwd.activo = true
    LEFT JOIN academic_period_holidays aph
      ON aph.academic_period_id = ap.id
    GROUP BY ap.id
    ORDER BY ap.activo DESC, ap.fecha_inicio DESC, ap.id DESC
  `);

  return result.rows;
};

const getAcademicPeriodById = async (id) => {
  const period = await getAcademicPeriodRow(pool, id);

  if (!period) {
    return null;
  }

  const [workingDays, holidays] = await Promise.all([
    getAcademicPeriodWorkingDays(pool, id),
    getAcademicPeriodHolidays(pool, id),
  ]);

  return {
    ...period,
    workingDays,
    holidays,
  };
};

const createAcademicPeriod = async (data, adminId = null) => {
  const payload = validateAcademicPeriodPayload(data);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const periodResult = await client.query(
      `INSERT INTO academic_periods (
        periodo,
        fecha_inicio,
        fecha_fin,
        activo,
        created_by,
        updated_by
      )
      VALUES ($1, $2, $3, false, $4, $4)
      RETURNING id, periodo, fecha_inicio::text AS fecha_inicio, fecha_fin::text AS fecha_fin, activo, created_at, updated_at`,
      [payload.periodo, payload.fecha_inicio, payload.fecha_fin, adminId],
    );

    const period = periodResult.rows[0];
    const workingDays = payload.workingDays || (await getCurrentWorkingDays(client));
    const holidays = payload.holidays || [];

    await replaceAcademicPeriodWorkingDays(client, period.id, workingDays);
    await replaceAcademicPeriodHolidays(client, period.id, holidays);
    await client.query("COMMIT");

    return await getAcademicPeriodById(period.id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const updateAcademicPeriod = async (id, data, adminId = null) => {
  const payload = validateAcademicPeriodPayload(data);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const periodResult = await client.query(
      `UPDATE academic_periods
       SET periodo = $1,
           fecha_inicio = $2,
           fecha_fin = $3,
           updated_by = $4,
           updated_at = ${BOGOTA.timestamp}
       WHERE id = $5
       RETURNING id`,
      [payload.periodo, payload.fecha_inicio, payload.fecha_fin, adminId, id],
    );

    if (periodResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    if (payload.workingDays) {
      await replaceAcademicPeriodWorkingDays(client, id, payload.workingDays);
    }

    if (payload.holidays) {
      await replaceAcademicPeriodHolidays(client, id, payload.holidays);
    }

    const activeResult = await client.query(
      "SELECT activo FROM academic_periods WHERE id = $1",
      [id],
    );

    if (activeResult.rows[0]?.activo) {
      await syncActivePeriodToSystemSettings(client, id);
    }

    await client.query("COMMIT");

    return await getAcademicPeriodById(id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const activateAcademicPeriod = async (id, adminId = null) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const periodResult = await client.query(
      `SELECT id, periodo, fecha_inicio::text AS fecha_inicio, fecha_fin::text AS fecha_fin
       FROM academic_periods
       WHERE id = $1
       FOR UPDATE`,
      [id],
    );

    if (periodResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    await client.query(
      `UPDATE academic_periods
       SET activo = false,
           updated_by = $1,
           updated_at = ${BOGOTA.timestamp}
       WHERE activo = true`,
      [adminId],
    );

    await client.query(
      `UPDATE academic_periods
       SET activo = true,
           updated_by = $1,
           updated_at = ${BOGOTA.timestamp}
       WHERE id = $2`,
      [adminId, id],
    );

    await syncActivePeriodToSystemSettings(client, id);
    await client.query("COMMIT");

    return await getAcademicPeriodById(id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const getAcademicPeriodRow = async (client, id) => {
  const result = await client.query(
    `SELECT
      id,
      periodo,
      fecha_inicio::text AS fecha_inicio,
      fecha_fin::text AS fecha_fin,
      activo,
      created_at,
      updated_at,
      created_by,
      updated_by
    FROM academic_periods
    WHERE id = $1`,
    [id],
  );

  return result.rows[0] || null;
};

const getAcademicPeriodWorkingDays = async (client, id) => {
  const result = await client.query(
    `SELECT id, dia, activo
     FROM academic_period_working_days
     WHERE academic_period_id = $1
     ORDER BY CASE dia
       WHEN 'lunes' THEN 1
       WHEN 'martes' THEN 2
       WHEN 'miercoles' THEN 3
       WHEN 'jueves' THEN 4
       WHEN 'viernes' THEN 5
       WHEN 'sabado' THEN 6
       WHEN 'domingo' THEN 7
       ELSE 8
     END`,
    [id],
  );

  return normalizeWorkingDays(result.rows);
};

const getAcademicPeriodHolidays = async (client, id) => {
  const result = await client.query(
    `SELECT id, fecha::text AS fecha, descripcion
     FROM academic_period_holidays
     WHERE academic_period_id = $1
     ORDER BY fecha`,
    [id],
  );

  return result.rows;
};

const getCurrentWorkingDays = async (client) => {
  const result = await client.query("SELECT id, dia, activo FROM working_days ORDER BY id");
  return normalizeWorkingDays(result.rows);
};

const replaceAcademicPeriodWorkingDays = async (client, periodId, days) => {
  const normalizedDays = normalizeWorkingDays(days);

  await client.query("DELETE FROM academic_period_working_days WHERE academic_period_id = $1", [periodId]);

  for (const day of normalizedDays) {
    await client.query(
      `INSERT INTO academic_period_working_days (academic_period_id, dia, activo)
       VALUES ($1, $2, $3)`,
      [periodId, day.dia, day.activo],
    );
  }
};

const replaceAcademicPeriodHolidays = async (client, periodId, holidays) => {
  const normalizedHolidays = normalizeHolidays(holidays);

  await client.query("DELETE FROM academic_period_holidays WHERE academic_period_id = $1", [periodId]);

  for (const holiday of normalizedHolidays) {
    await client.query(
      `INSERT INTO academic_period_holidays (academic_period_id, fecha, descripcion)
       VALUES ($1, $2, $3)`,
      [periodId, holiday.fecha, holiday.descripcion || null],
    );
  }
};

const syncActivePeriodToSystemSettings = async (client, periodId) => {
  const period = await getAcademicPeriodRow(client, periodId);

  await client.query(
    `INSERT INTO system_settings (id, periodo_actual, fecha_inicio, fecha_fin)
     VALUES (1, $1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET
       periodo_actual = EXCLUDED.periodo_actual,
       fecha_inicio = EXCLUDED.fecha_inicio,
       fecha_fin = EXCLUDED.fecha_fin,
       updated_at = ${BOGOTA.timestamp}`,
    [period.periodo, period.fecha_inicio, period.fecha_fin],
  );

  const periodWorkingDays = await getAcademicPeriodWorkingDays(client, periodId);
  for (const day of periodWorkingDays) {
    await client.query(
      `INSERT INTO working_days (dia, activo)
       VALUES ($1, $2)
       ON CONFLICT (dia) DO UPDATE SET activo = EXCLUDED.activo`,
      [day.dia, day.activo],
    );
  }

  const periodHolidays = await getAcademicPeriodHolidays(client, periodId);
  await client.query("DELETE FROM holidays");

  for (const holiday of periodHolidays) {
    await client.query(
      `INSERT INTO holidays (fecha, descripcion)
       VALUES ($1, $2)
       ON CONFLICT (fecha) DO UPDATE SET descripcion = EXCLUDED.descripcion`,
      [holiday.fecha, holiday.descripcion || null],
    );
  }
};

const validateAcademicPeriodPayload = (data = {}) => {
  const periodo = String(data.periodo || "").trim();
  const fecha_inicio = String(data.fecha_inicio || "").trim();
  const fecha_fin = String(data.fecha_fin || "").trim();

  if (!periodo) {
    throw new Error("El periodo academico es obligatorio");
  }

  if (!fecha_inicio || !fecha_fin) {
    throw new Error("Las fechas del periodo son obligatorias");
  }

  if (fecha_inicio > fecha_fin) {
    throw new Error("La fecha de inicio no puede ser posterior a la fecha de fin");
  }

  return {
    periodo,
    fecha_inicio,
    fecha_fin,
    workingDays: data.workingDays ? normalizeWorkingDays(data.workingDays) : null,
    holidays: data.holidays ? normalizeHolidays(data.holidays) : null,
  };
};

const normalizeWorkingDays = (days = []) => {
  const byDay = new Map();

  for (const day of days) {
    const dia = String(day.dia || "").toLowerCase();
    if (VALID_WORKING_DAYS.includes(dia)) {
      byDay.set(dia, Boolean(day.activo));
    }
  }

  return VALID_WORKING_DAYS.map((dia) => ({
    dia,
    activo: byDay.get(dia) ?? false,
  }));
};

const normalizeHolidays = (holidays = []) => {
  const byDate = new Map();

  for (const holiday of holidays) {
    const fecha = String(holiday.fecha || "").slice(0, 10);
    if (!fecha) {
      continue;
    }
    byDate.set(fecha, {
      fecha,
      descripcion: holiday.descripcion ? String(holiday.descripcion).trim() : null,
    });
  }

  return Array.from(byDate.values()).sort((a, b) => a.fecha.localeCompare(b.fecha));
};

module.exports = {
  getServerTime,
  getSystemSettings,
  updateSystemSettings,
  getWorkingDays,
  updateWorkingDays,
  getHolidays,
  createHoliday,
  updateHoliday,
  deleteHoliday,
  getAcademicPeriods,
  getAcademicPeriodById,
  createAcademicPeriod,
  updateAcademicPeriod,
  activateAcademicPeriod,
};
