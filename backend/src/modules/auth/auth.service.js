
const pool = require("../../config/db");
const { sendMail } = require("../../config/mailer");

const ADMIN_USER = {
  id: 1,
  nombre: "Carolina",
  correo: "bienestar@gmail.com",
  telefono: "3185557421",
  password: "admin123",
};

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
      sub.tiene_beca
  `;

  const result = await pool.query(query, [String(codigo)]);

  if (result.rows.length === 0) {
    throw new Error("Credenciales invalidas");
  }

  const student = result.rows[0];

  if (String(student.numero_documento) !== String(password)) {
    throw new Error("Credenciales invalidas");
  }

  return {
    id: student.id,
    codigo: student.codigo,
    nombre: student.nombre,
    programa_codigo: student.programa_codigo,
    programa_nombre: student.programa_nombre,
    tipo_estudiante: student.tipo_estudiante,
    tiene_beca: student.tiene_beca,
    dias: student.dias,
  };
};

const loginAdmin = async ({ correo, password }) => {
  if (!correo || !password) {
    throw new Error("Correo y contrasena son obligatorios");
  }

  if (correo !== ADMIN_USER.correo || password !== ADMIN_USER.password) {
    throw new Error("Credenciales invalidas");
  }

  return {
    id: ADMIN_USER.id,
    nombre: ADMIN_USER.nombre,
    correo: ADMIN_USER.correo,
    telefono: ADMIN_USER.telefono,
  };
};

const recoverStudentPassword = async ({ correo }) => {
  if (!correo) {
    throw new Error("El correo es obligatorio");
  }

  const query = `
    SELECT codigo, nombre, correo, numero_documento
    FROM students
    WHERE correo = $1
    LIMIT 1
  `;

  const result = await pool.query(query, [correo]);

  if (result.rows.length === 0) {
    throw new Error("No se encontro un estudiante con ese correo");
  }

  const student = result.rows[0];

  const mailResult = await sendMail({
    to: student.correo,
    subject: "Recuperacion de contrasena SIGBA",
    html: buildRecoveryEmail({
      name: student.nombre,
      userLabel: "Codigo",
      userValue: student.codigo,
      password: student.numero_documento,
    }),
  });

  return {
    correo: student.correo,
    ...mailResult,
  };
};

const recoverAdminPassword = async ({ correo }) => {
  if (!correo) {
    throw new Error("El correo es obligatorio");
  }

  if (correo !== ADMIN_USER.correo) {
    throw new Error("No se encontro un administrador con ese correo");
  }

  const mailResult = await sendMail({
    to: ADMIN_USER.correo,
    subject: "Recuperacion de contrasena administrador SIGBA",
    html: buildRecoveryEmail({
      name: ADMIN_USER.nombre,
      userLabel: "Correo",
      userValue: ADMIN_USER.correo,
      password: ADMIN_USER.password,
    }),
  });

  return {
    correo: ADMIN_USER.correo,
    ...mailResult,
  };
};

const buildRecoveryEmail = ({ name, userLabel, userValue, password }) => {
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
        <tr>
          <td style="padding: 6px 12px; font-weight: bold;">Contrasena</td>
          <td style="padding: 6px 12px;">${password}</td>
        </tr>
      </table>
      <p>Si no solicitaste esta recuperacion, comunicate con bienestar universitario.</p>
    </div>
  `;
};

module.exports = {
  loginStudent,
  loginAdmin,
  recoverStudentPassword,
  recoverAdminPassword,
};
