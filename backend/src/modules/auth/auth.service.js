const pool = require("../../config/db");
const bcrypt = require("bcryptjs");
const { signToken } = require("../../config/jwt");
const { sendMail } = require("../../config/mailer");

const SALT_ROUNDS = 8;

// ============================================================
//  SEED DEFAULT ADMIN
// ============================================================

const ADMIN_INICIAL = {
  nombre: "Carolina Castro",
  correo: "desarrollohumano.yumbo@correounivalle.edu.co",
  telefono: "3175635984",
};

let adminCreado = false;

const ensureDefaultAdmin = async () => {
  try {
    const existing = await pool.query("SELECT id FROM admins LIMIT 1");

    if (existing.rows.length > 0) return;

    const passwordHash = await bcrypt.hash(ADMIN_INICIAL.telefono, SALT_ROUNDS);

    await pool.query(
      `INSERT INTO admins (nombre, correo, telefono, password_hash, must_change_password)
       VALUES ($1, $2, $3, $4, true)`,
      [ADMIN_INICIAL.nombre, ADMIN_INICIAL.correo, ADMIN_INICIAL.telefono, passwordHash],
    );

    adminCreado = true;
    console.log("✅ Administrador inicial creado correctamente");
  } catch (error) {
    if (error.code === "42P01") {
      console.warn("⚠️  Tabla 'admins' no existe. Ejecuta la migracion SQL primero.");
    } else {
      console.error("❌ Error al crear administrador inicial:", error.message);
    }
  }
};

// ============================================================
//  STUDENT LOGIN
// ============================================================

const loginStudent = async ({ codigo, password }) => {
  if (!codigo || !password) {
    throw new Error("Codigo y contraseña son obligatorios");
  }

  const query = `
    SELECT
      s.id,
      s.codigo,
      s.numero_documento,
      s.nombre,
      s.programa_codigo,
      s.programa_nombre,
      s.tipo_estudiante,
      s.activo,
      s.password_hash,
      s.must_change_password,
      COALESCE(sub.tiene_beca, false) AS tiene_beca,
      COALESCE(
        ARRAY_AGG(sd.dia) FILTER (WHERE sd.dia IS NOT NULL),
        '{}'
      ) AS dias
    FROM students s
    LEFT JOIN subsidies sub
      ON sub.student_id = s.id
    LEFT JOIN subsidy_days sd
      ON sd.subsidy_id = sub.id
    WHERE s.codigo = $1
    GROUP BY
      s.id,
      s.codigo,
      s.numero_documento,
      s.nombre,
      s.programa_codigo,
      s.programa_nombre,
      s.tipo_estudiante,
      s.activo,
      s.password_hash,
      s.must_change_password,
      sub.tiene_beca
  `;

  const result = await pool.query(query, [String(codigo)]);

  if (result.rows.length === 0) {
    throw new Error("Credenciales invalidas");
  }

  const student = result.rows[0];

  if (!student.activo) {
    throw new Error(
      "Tu cuenta se encuentra inactiva. Debes acercarte a bienestar universitario para activarla."
    );
  }

  const passwordValid = student.password_hash
    ? await bcrypt.compare(String(password), student.password_hash)
    : String(student.codigo) === String(password);

  if (!passwordValid) {
    throw new Error("Credenciales invalidas");
  }

  await pool.query(
    "UPDATE students SET last_login = NOW() WHERE id = $1",
    [student.id],
  );

  const payload = {
    id: student.id,
    codigo: student.codigo,
    role: "student",
  };

  const token = signToken(payload);

  return {
    token,
    student: {
      id: student.id,
      codigo: student.codigo,
      nombre: student.nombre,
      programa_codigo: student.programa_codigo,
      programa_nombre: student.programa_nombre,
      tipo_estudiante: student.tipo_estudiante,
      tiene_beca: student.tiene_beca,
      dias: student.dias,
      must_change_password: student.must_change_password,
    },
  };
};

// ============================================================
//  STUDENT CHANGE PASSWORD
// ============================================================

const changeStudentPassword = async (studentId, { currentPassword, newPassword }) => {
  if (!currentPassword || !newPassword) {
    throw new Error("Contraseña actual y nueva son obligatorias");
  }

  if (newPassword.length < 6) {
    throw new Error("La nueva contraseña debe tener al menos 6 caracteres");
  }

  if (String(currentPassword) === String(newPassword)) {
    throw new Error("La nueva contraseña no puede ser igual a la actual");
  }

  const result = await pool.query(
    "SELECT id, codigo, password_hash FROM students WHERE id = $1",
    [studentId],
  );

  if (result.rows.length === 0) {
    throw new Error("Estudiante no encontrado");
  }

  const student = result.rows[0];

  const passwordValid = student.password_hash
    ? await bcrypt.compare(String(currentPassword), student.password_hash)
    : String(student.codigo) === String(currentPassword);

  if (!passwordValid) {
    throw new Error("Contraseña actual incorrecta");
  }

  const passwordHash = await bcrypt.hash(String(newPassword), SALT_ROUNDS);

  await pool.query(
    "UPDATE students SET password_hash = $1, must_change_password = false WHERE id = $2",
    [passwordHash, studentId],
  );

  return { message: "Contraseña actualizada correctamente" };
};

// ============================================================
//  ADMIN LOGIN
// ============================================================

const loginAdmin = async ({ correo, password }) => {
  if (!correo || !password) {
    throw new Error("Correo y contraseña son obligatorios");
  }

  const result = await pool.query(
    `SELECT id, nombre, correo, telefono, password_hash, must_change_password, activo
     FROM admins WHERE correo = $1`,
    [correo],
  );

  if (result.rows.length === 0) {
    throw new Error("Credenciales invalidas");
  }

  const admin = result.rows[0];

  if (!admin.activo) {
    throw new Error("Cuenta de administrador desactivada");
  }

  const passwordValid = await bcrypt.compare(String(password), admin.password_hash);

  if (!passwordValid) {
    throw new Error("Credenciales invalidas");
  }

  await pool.query(
    "UPDATE admins SET last_login = NOW() WHERE id = $1",
    [admin.id],
  );

  const payload = {
    id: admin.id,
    nombre: admin.nombre,
    correo: admin.correo,
    role: "admin",
  };

  const token = signToken(payload);

  return {
    token,
    admin: {
      id: admin.id,
      nombre: admin.nombre,
      correo: admin.correo,
      telefono: admin.telefono,
      must_change_password: admin.must_change_password,
    },
  };
};

// ============================================================
//  ADMIN CHANGE PASSWORD
// ============================================================

const changeAdminPassword = async (adminId, { currentPassword, newPassword }) => {
  if (!currentPassword || !newPassword) {
    throw new Error("Contraseña actual y nueva son obligatorias");
  }

  if (newPassword.length < 6) {
    throw new Error("La nueva contraseña debe tener al menos 6 caracteres");
  }

  if (String(currentPassword) === String(newPassword)) {
    throw new Error("La nueva contraseña no puede ser igual a la actual");
  }

  const result = await pool.query(
    "SELECT id, password_hash FROM admins WHERE id = $1",
    [adminId],
  );

  if (result.rows.length === 0) {
    throw new Error("Administrador no encontrado");
  }

  const admin = result.rows[0];

  const passwordValid = await bcrypt.compare(String(currentPassword), admin.password_hash);

  if (!passwordValid) {
    throw new Error("Contraseña actual incorrecta");
  }

  const passwordHash = await bcrypt.hash(String(newPassword), SALT_ROUNDS);

  await pool.query(
    "UPDATE admins SET password_hash = $1, must_change_password = false WHERE id = $2",
    [passwordHash, adminId],
  );

  return { message: "Contraseña actualizada correctamente" };
};

// ============================================================
//  RECOVER STUDENT PASSWORD
// ============================================================

const recoverStudentPassword = async ({ correo }) => {
  if (!correo) {
    throw new Error("El correo es obligatorio");
  }

  const query = `
    SELECT id, codigo, nombre, correo, activo
    FROM students
    WHERE correo = $1
    LIMIT 1
  `;

  const result = await pool.query(query, [correo]);

  if (result.rows.length === 0) {
    throw new Error("No se encontro un estudiante con ese correo");
  }

  const student = result.rows[0];

  if (!student.activo) {
    throw new Error(
      "Tu cuenta se encuentra inactiva. Debes acercarte a bienestar universitario para activarla."
    );
  }

  // Generar contraseña temporal
  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, SALT_ROUNDS);

  await pool.query(
    "UPDATE students SET password_hash = $1, must_change_password = true WHERE id = $2",
    [passwordHash, student.id],
  );

  const mailResult = await sendMail({
    to: student.correo,
    subject: "Recuperación de contraseña SIGBA",
    html: buildRecoveryEmail({
      name: student.nombre,
      codigo: student.codigo,
      tempPassword,
    }),
  });

  return {
    message: mailResult.sent
      ? "Se ha enviado una contraseña temporal a tu correo institucional"
      : "Solicitud recibida, pero el servicio de correo no esta disponible. Contacta a bienestar universitario.",
    ...mailResult,
  };
};

// ============================================================
//  RECOVER ADMIN PASSWORD
// ============================================================

const recoverAdminPassword = async ({ correo }) => {
  if (!correo) {
    throw new Error("El correo es obligatorio");
  }

  const result = await pool.query(
    "SELECT id, nombre, correo, activo FROM admins WHERE correo = $1",
    [correo],
  );

  if (result.rows.length === 0) {
    throw new Error("No se encontro un administrador con ese correo");
  }

  const admin = result.rows[0];

  if (!admin.activo) {
    throw new Error("Cuenta de administrador desactivada");
  }

  // Generar contraseña temporal
  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, SALT_ROUNDS);

  await pool.query(
    "UPDATE admins SET password_hash = $1, must_change_password = true WHERE id = $2",
    [passwordHash, admin.id],
  );

  const mailResult = await sendMail({
    to: admin.correo,
    subject: "Recuperación de contraseña administrador SIGBA",
    html: buildRecoveryEmail({
      name: admin.nombre,
      codigo: admin.correo,
      tempPassword,
    }),
  });

  return {
    message: mailResult.sent
      ? "Se ha enviado una contraseña temporal a tu correo"
      : "Solicitud recibida, pero el servicio de correo no esta disponible.",
    ...mailResult,
  };
};

// ============================================================
//  HELPERS
// ============================================================

const generateTempPassword = () => {
  const digits = String(Math.floor(1000 + Math.random() * 9000));
  return `SIGBA-${digits}`;
};

const buildRecoveryEmail = ({ name, codigo, tempPassword }) => {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SIGBA — Recuperación de contraseña</title>
</head>
<body style="margin:0; padding:0; background:#f3f4f6;">
  <div style="font-family: Arial, Helvetica, sans-serif; color: #111827; max-width: 480px; margin: 0 auto; padding: 24px;">
    <h2 style="color: #991b1b;">SIGBA — Recuperación de contraseña</h2>
    <p>Hola ${name},</p>
    <p>Se ha generado una <strong>contraseña temporal</strong> para tu cuenta:</p>

    <div style="margin: 16px 0; padding: 16px; background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px;">
      <p style="margin: 0 0 8px 0; font-size: 14px; color: #166534;">Usuario</p>
      <p style="margin: 0; font-size: 20px; font-weight: bold; font-family: monospace;">${codigo}</p>
      <p style="margin: 12px 0 8px 0; font-size: 14px; color: #166534;">Contraseña temporal</p>
      <p style="margin: 0; font-size: 20px; font-weight: bold; font-family: monospace; letter-spacing: 2px;">${tempPassword}</p>
    </div>

    <p style="margin-top: 12px; padding: 12px; background: #fef3c7; border-radius: 6px;">
      <strong>Importante:</strong> Al iniciar sesión con esta contraseña temporal, el sistema te pedirá que la cambies inmediatamente por una personal.
    </p>

    <p style="margin-top: 16px; font-size: 13px; color: #6b7280;">
      Si no solicitaste este cambio de contraseña, comunícate inmediatamente con Bienestar Universitario. Si fuiste tú, por favor ignora este mensaje.
    </p>
  </div>
</body>
</html>`;
};

module.exports = {
  ensureDefaultAdmin,
  loginStudent,
  changeStudentPassword,
  loginAdmin,
  changeAdminPassword,
  recoverStudentPassword,
  recoverAdminPassword,
};
