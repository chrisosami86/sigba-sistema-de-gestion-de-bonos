const { BrevoClient } = require('@getbrevo/brevo');

const brevo = new BrevoClient({
  apiKey: process.env.BREVO_API_KEY,
});

const sendMail = async ({ to, subject, html }) => {
  try {
    await brevo.transactionalEmails.sendTransacEmail({
      sender: {
        name: 'SIGBA',
        email: process.env.SMTP_FROM || 'chrisosami86@gmail.com',
      },

      to: [
        {
          email: to,
        },
      ],

      subject,
      htmlContent: html,
    });

    return { sent: true };
  } catch (err) {
    console.error('[mailer] sendMail failed:', err);

    return {
      sent: false,
      reason: err.message,
    };
  }
};

module.exports = { sendMail };