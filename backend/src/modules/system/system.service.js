const pool = require("../../config/db");

const getServerTime = async () => {
  return { serverTime: new Date() };
};

// ── System Settings ──

const getSystemSettings = async () => {
  const result = await pool.query("SELECT * FROM system_settings WHERE id = 1");

  if (result.rows.length === 0) {
    await pool.query("INSERT INTO system_settings (id, periodo_actual) VALUES (1, '2026-1') ON CONFLICT (id) DO NOTHING");
    const inserted = await pool.query("SELECT * FROM system_settings WHERE id = 1");
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

  fields.push("updated_at = NOW()");
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
  const result = await pool.query("SELECT * FROM holidays ORDER BY fecha");
  return result.rows;
};

const createHoliday = async (data) => {
  const result = await pool.query(
    "INSERT INTO holidays (fecha, descripcion) VALUES ($1, $2) RETURNING *",
    [data.fecha, data.descripcion || null],
  );

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

module.exports = {
  getServerTime,
  getSystemSettings,
  updateSystemSettings,
  getWorkingDays,
  updateWorkingDays,
  getHolidays,
  createHoliday,
  deleteHoliday,
};
