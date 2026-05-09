const nodemailer = require("nodemailer");

const isMailConfigured = () => {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
};

const sendMail = async ({ to, subject, html }) => {
  if (!isMailConfigured()) {
    return {
      sent: false,
      reason: "SMTP no configurado",
    };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    html,
  });

  return {
    sent: true,
  };
};

module.exports = {
  sendMail,
};
