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
    throw new Error("Codigo y contrasena son obligatorios");
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
    : String(student.numero_documento) === String(password);

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
    throw new Error("Contrasena actual y nueva son obligatorias");
  }

  if (newPassword.length < 6) {
    throw new Error("La nueva contrasena debe tener al menos 6 caracteres");
  }

  if (String(currentPassword) === String(newPassword)) {
    throw new Error("La nueva contrasena no puede ser igual a la actual");
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
    throw new Error("Contrasena actual incorrecta");
  }

  const passwordHash = await bcrypt.hash(String(newPassword), SALT_ROUNDS);

  await pool.query(
    "UPDATE students SET password_hash = $1, must_change_password = false WHERE id = $2",
    [passwordHash, studentId],
  );

  return { message: "Contrasena actualizada correctamente" };
};

// ============================================================
//  ADMIN LOGIN
// ============================================================

const loginAdmin = async ({ correo, password }) => {
  if (!correo || !password) {
    throw new Error("Correo y contrasena son obligatorios");
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
    throw new Error("Contrasena actual y nueva son obligatorias");
  }

  if (newPassword.length < 6) {
    throw new Error("La nueva contrasena debe tener al menos 6 caracteres");
  }

  if (String(currentPassword) === String(newPassword)) {
    throw new Error("La nueva contrasena no puede ser igual a la actual");
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
    throw new Error("Contrasena actual incorrecta");
  }

  const passwordHash = await bcrypt.hash(String(newPassword), SALT_ROUNDS);

  await pool.query(
    "UPDATE admins SET password_hash = $1, must_change_password = false WHERE id = $2",
    [passwordHash, adminId],
  );

  return { message: "Contrasena actualizada correctamente" };
};

// ============================================================
//  RECOVER STUDENT PASSWORD
// ============================================================

const recoverStudentPassword = async ({ correo }) => {
  if (!correo) {
    throw new Error("El correo es obligatorio");
  }

  const query = `
    SELECT codigo, nombre, correo, activo
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

  const mailResult = await sendMail({
    to: student.correo,
    subject: "Recuperacion de contrasena SIGBA",
    html: buildRecoveryEmail({
      name: student.nombre,
      userLabel: "Codigo",
      userValue: student.codigo,
      hint: "Usa tu codigo de estudiante como contrasena inicial. Si ya la cambiaste, contacta a bienestar universitario.",
    }),
  });

  return {
    correo: student.correo,
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
    "SELECT nombre, correo, activo FROM admins WHERE correo = $1",
    [correo],
  );

  if (result.rows.length === 0) {
    throw new Error("No se encontro un administrador con ese correo");
  }

  const admin = result.rows[0];

  if (!admin.activo) {
    throw new Error("Cuenta de administrador desactivada");
  }

  const mailResult = await sendMail({
    to: admin.correo,
    subject: "Recuperacion de contrasena administrador SIGBA",
    html: buildRecoveryEmail({
      name: admin.nombre,
      userLabel: "Correo",
      userValue: admin.correo,
      hint: "Contacta al administrador del sistema si no recuerdas tu contrasena.",
    }),
  });

  return {
    correo: admin.correo,
    ...mailResult,
  };
};

// ============================================================
//  HELPERS
// ============================================================

const buildRecoveryEmail = ({ name, userLabel, userValue, hint }) => {
  return `
    <div style="font-family: Arial, sans-serif; color: #111827;">
      <h2 style="color: #991b1b;">Recuperacion de contrasena SIGBA</h2>
      <p>Hola ${name},</p>
      <p>Estos son tus datos de acceso registrados en SIGBA:</p>
      <table style="border-collapse: collapse;">
        <tr>
          <td style="padding: 6px 12px; font-weight: bold;">${userLabel}</td>
          <td style="padding: 6px 12px;">${userValue}</td>
        </tr>
      </table>
      <p style="margin-top: 12px; padding: 12px; background: #fef3c7; border-radius: 6px;">
        <strong>Nota:</strong> ${hint}
      </p>
      <p>Si no solicitaste esta recuperacion, comunicate con bienestar universitario.</p>
    </div>
  `;
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
