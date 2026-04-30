const pool = require('../../config/db');

const createStudent = async (data) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Insertar estudiante
    const studentQuery = `
      INSERT INTO students (
        codigo,
        tipo_documento,
        numero_documento,
        nombre,
        correo,
        programa_codigo,
        programa_nombre,
        tipo_estudiante
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *;
    `;

    const studentValues = [
      data.codigo,
      data.tipo_documento,
      data.numero_documento,
      data.nombre,
      data.correo,
      data.programa_codigo,
      data.programa_nombre,
      data.tipo_estudiante
    ];

    const studentResult = await client.query(studentQuery, studentValues);
    const student = studentResult.rows[0];

    // 2. Si es subsidiado → crear subsidio
    if (data.tipo_estudiante === 'subsidiado') {

      const subsidyQuery = `
        INSERT INTO subsidies (student_id, tiene_beca)
        VALUES ($1, $2)
        RETURNING *;
      `;

      const subsidyResult = await client.query(subsidyQuery, [
        student.id,
        data.tiene_beca || false
      ]);

      const subsidy = subsidyResult.rows[0];

      // 3. Guardar días
      if (data.dias && data.dias.length > 0) {
        for (const dia of data.dias) {
          await client.query(
            `INSERT INTO subsidy_days (subsidy_id, dia)
             VALUES ($1, $2);`,
            [subsidy.id, dia]
          );
        }
      }
    }

    await client.query('COMMIT');

    return student;

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  createStudent
};