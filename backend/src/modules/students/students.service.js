const pool = require("../../config/db");

const createStudent = async (data) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

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
      data.tipo_estudiante,
    ];

    const studentResult = await client.query(studentQuery, studentValues);
    const student = studentResult.rows[0];

    // 2. Si es subsidiado → crear subsidio
    if (data.tipo_estudiante === "subsidiado") {
      const subsidyQuery = `
        INSERT INTO subsidies (student_id, tiene_beca)
        VALUES ($1, $2)
        RETURNING *;
      `;

      const subsidyResult = await client.query(subsidyQuery, [
        student.id,
        data.tiene_beca || false,
      ]);

      const subsidy = subsidyResult.rows[0];

      // 3. Guardar días
      if (data.dias && data.dias.length > 0) {
        for (const dia of data.dias) {
          await client.query(
            `INSERT INTO subsidy_days (subsidy_id, dia)
             VALUES ($1, $2);`,
            [subsidy.id, dia],
          );
        }
      }
    }

    await client.query("COMMIT");

    return student;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const getStudents = async (filters) => {
  let query = `
    SELECT 
      s.id,
      s.codigo,
      s.nombre,
      s.correo,
      s.tipo_estudiante,
      sub.tiene_beca,
      sd.dia
    FROM students s
    LEFT JOIN subsidies sub ON sub.student_id = s.id
    LEFT JOIN subsidy_days sd ON sd.subsidy_id = sub.id
  `;

  const conditions = [];
  const values = [];

  // filtro por tipo
  if (filters.tipo) {
    values.push(filters.tipo);
    conditions.push(`s.tipo_estudiante = $${values.length}`);
  }

  // filtro por día
  if (filters.dia) {
    values.push(filters.dia);
    conditions.push(`sd.dia = $${values.length}`);
  }

  // agregar condiciones si existen
  if (conditions.length > 0) {
    query += ` WHERE ` + conditions.join(" AND ");
  }

  query += ` ORDER BY s.id;`;

  const result = await pool.query(query, values);

  // 🔄 misma transformación de antes
  const studentsMap = {};

  for (const row of result.rows) {
    if (!studentsMap[row.id]) {
      studentsMap[row.id] = {
        id: row.id,
        codigo: row.codigo,
        nombre: row.nombre,
        correo: row.correo,
        tipo_estudiante: row.tipo_estudiante,
        tiene_beca: row.tiene_beca || false,
        dias: [],
      };
    }

    if (row.dia) {
      studentsMap[row.id].dias.push(row.dia);
    }
  }

  return Object.values(studentsMap);
};

const getStudentById = async (id) => {
  const query = `
  SELECT 
    s.id,
    s.codigo,
    s.tipo_documento,
    s.numero_documento,
    s.nombre,
    s.correo,
    s.programa_codigo,
    s.programa_nombre,
    s.tipo_estudiante,
    sub.tiene_beca,
    sd.dia
  FROM students s
  LEFT JOIN subsidies sub ON sub.student_id = s.id
  LEFT JOIN subsidy_days sd ON sd.subsidy_id = sub.id
  WHERE s.id = $1;
`;

  const result = await pool.query(query, [id]);

  if (result.rows.length === 0) {
    return null;
  }

  // 🧠 Transformar igual que antes pero para uno solo
  const student = {
    id: result.rows[0].id,
    codigo: result.rows[0].codigo,
    tipo_documento: result.rows[0].tipo_documento,
    numero_documento: result.rows[0].numero_documento,
    nombre: result.rows[0].nombre,
    correo: result.rows[0].correo,
    programa_codigo: result.rows[0].programa_codigo,
    programa_nombre: result.rows[0].programa_nombre,
    tipo_estudiante: result.rows[0].tipo_estudiante,
    tiene_beca: result.rows[0].tiene_beca || false,
    dias: [],
  };

  for (const row of result.rows) {
    if (row.dia) {
      student.dias.push(row.dia);
    }
  }

  return student;
};

const updateStudent = async (id, data) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Verificar que existe
    const existing = await client.query(
      "SELECT * FROM students WHERE id = $1",
      [id],
    );

    if (existing.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    // 2. Actualizar datos básicos (solo si vienen)
    const updateQuery = `
      UPDATE students SET
        codigo = COALESCE($1, codigo),
        tipo_documento = COALESCE($2, tipo_documento),
        numero_documento = COALESCE($3, numero_documento),
        nombre = COALESCE($4, nombre),
        correo = COALESCE($5, correo),
        programa_codigo = COALESCE($6, programa_codigo),
        programa_nombre = COALESCE($7, programa_nombre),
        tipo_estudiante = COALESCE($8, tipo_estudiante)
      WHERE id = $9
      RETURNING *;
    `;

    const values = [
      data.codigo,
      data.tipo_documento,
      data.numero_documento,
      data.nombre,
      data.correo,
      data.programa_codigo,
      data.programa_nombre,
      data.tipo_estudiante,
      id,
    ];

    const studentResult = await client.query(updateQuery, values);
    const student = studentResult.rows[0];

    // 3. Manejar subsidio si es subsidiado
    if (data.tipo_estudiante === "subsidiado") {
      // buscar subsidio existente
      let subsidyRes = await client.query(
        "SELECT * FROM subsidies WHERE student_id = $1",
        [id],
      );

      let subsidy;

      if (subsidyRes.rows.length === 0) {
        // crear si no existe
        const newSubsidy = await client.query(
          "INSERT INTO subsidies (student_id, tiene_beca) VALUES ($1, $2) RETURNING *",
          [id, data.tiene_beca || false],
        );
        subsidy = newSubsidy.rows[0];
      } else {
        // actualizar beca
        const updatedSubsidy = await client.query(
          "UPDATE subsidies SET tiene_beca = COALESCE($1, tiene_beca) WHERE student_id = $2 RETURNING *",
          [data.tiene_beca, id],
        );
        subsidy = updatedSubsidy.rows[0];
      }

      // 4. actualizar días (estrategia simple: borrar y volver a insertar)
      if (data.dias) {
        await client.query("DELETE FROM subsidy_days WHERE subsidy_id = $1", [
          subsidy.id,
        ]);

        for (const dia of data.dias) {
          await client.query(
            "INSERT INTO subsidy_days (subsidy_id, dia) VALUES ($1, $2)",
            [subsidy.id, dia],
          );
        }
      }
    } else if (data.tipo_estudiante === "no_subsidiado") {
      // si deja de ser subsidiado → borrar subsidio
      await client.query("DELETE FROM subsidies WHERE student_id = $1", [id]);
    }

    await client.query("COMMIT");

    return student;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const deleteStudent = async (id) => {
  const result = await pool.query(
    "DELETE FROM students WHERE id = $1 RETURNING *",
    [id],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
};



module.exports = {
  createStudent,
  getStudents,
  getStudentById,
  updateStudent,
  deleteStudent,
};
