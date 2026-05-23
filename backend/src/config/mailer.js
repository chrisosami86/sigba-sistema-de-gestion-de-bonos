const nodemailer = require("nodemailer");

const sendMail = async ({ to, subject, html }) => {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",

    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || "SIGBA <noreply@sigba.local>",
      to,
      subject,
      html,
    });

    return { sent: true };
  } catch (err) {
    console.error("[mailer] sendMail failed:", err.message);
    return { sent: false, reason: err.message };
  }
};

module.exports = { sendMail };