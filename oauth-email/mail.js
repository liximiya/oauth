require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendEmail({ to, subject, text, html }) {
  const mailOptions = {
    from: process.env.SMTP_FROM || `"Saltashop" <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
    html,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Письмо отправлено:', info.messageId);
    return info;
  } catch (error) {
    console.error('Ошибка отправки:', error.message);
    throw error;
  }
}

async function sendVerificationCode(email, login, code) {
  return sendEmail({
    to: email,
    subject: 'Код подтверждения регистрации',
    text: `Здравствуйте, ${login}!\n\nВаш код подтверждения: ${code}\n\nКод действует 10 минут.`,
    html: `
      <div style="font-family:Segoe UI,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <h2 style="color:#6366f1;">Подтверждение регистрации</h2>
        <p>Здравствуйте, <b>${login}</b>!</p>
        <p>Ваш код подтверждения:</p>
        <div style="font-size:32px;font-weight:700;letter-spacing:6px;color:#6366f1;padding:16px;background:#f4f4f5;border-radius:12px;text-align:center;">
          ${code}
        </div>
        <p style="color:#71717a;">Код действует 10 минут.</p>
      </div>
    `,
  });
}

async function sendPasswordResetCode(email, login, code) {
  return sendEmail({
    to: email,
    subject: 'Восстановление пароля',
    text: `Здравствуйте, ${login}!\n\nКод для сброса пароля: ${code}\n\nКод действует 10 минут. Если вы не запрашивали сброс — проигнорируйте письмо.`,
    html: `
      <div style="font-family:Segoe UI,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <h2 style="color:#6366f1;">Восстановление пароля</h2>
        <p>Здравствуйте, <b>${login}</b>!</p>
        <p>Код для сброса пароля:</p>
        <div style="font-size:32px;font-weight:700;letter-spacing:6px;color:#6366f1;padding:16px;background:#f4f4f5;border-radius:12px;text-align:center;">
          ${code}
        </div>
        <p style="color:#71717a;">Код действует 10 минут.</p>
        <p style="color:#71717a;">Если вы не запрашивали сброс пароля — просто проигнорируйте это письмо.</p>
      </div>
    `,
  });
}

module.exports = { sendEmail, sendVerificationCode, sendPasswordResetCode, transporter };
