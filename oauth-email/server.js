require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const path = require('path');
const { sendVerificationCode, sendPasswordResetCode } = require('./mail');
const { findUser, addUser, updateUser, deleteUser } = require('./storage');

const app = express();
const PORT = process.env.PORT || 1237;
const SESSION_SECRET = 'liximiya-meow-meow';
const CODE_TTL_MS = 10 * 60 * 1000;

function getSmtpErrorMessage(err) {
  const message = err?.message || '';

  if (message.includes('535') || message.includes('authentication failed')) {
    return 'SMTP: неверный логин или пароль.';
  }

  return 'Не удалось отправить письмо.';
}

app.use(express.json());
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

app.use(express.static(path.join(__dirname, 'public')));

function createVerificationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function createUserId() {
  return crypto.randomBytes(8).toString('hex');
}

function toPublicUser(user) {
  return {
    id: user.id,
    login: user.login,
    email: user.email,
    username: user.login,
    avatarUrl: '/default-avatar.svg',
  };
}

app.get('/', (req, res) => {
  if (req.session.user) {
    return res.redirect('/profile');
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/register', (req, res) => {
  if (req.session.user) {
    return res.redirect('/profile');
  }
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/verify', (req, res) => {
  if (req.session.user) {
    return res.redirect('/profile');
  }
  if (!req.session.pendingUserId) {
    return res.redirect('/register');
  }
  res.sendFile(path.join(__dirname, 'public', 'verify.html'));
});

app.get('/profile', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, 'public', 'profile.html'));
});

app.get('/forgot', (req, res) => {
  if (req.session.user) {
    return res.redirect('/profile');
  }
  res.sendFile(path.join(__dirname, 'public', 'forgot.html'));
});

app.get('/reset-password', (req, res) => {
  if (req.session.user) {
    return res.redirect('/profile');
  }
  if (!req.session.resetUserId) {
    return res.redirect('/forgot');
  }
  res.sendFile(path.join(__dirname, 'public', 'reset-password.html'));
});

app.post('/api/register', async (req, res) => {
  const { login, email, password } = req.body;

  if (!login?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: 'Заполните все поля' });
  }

  if (login.trim().length < 3) {
    return res.status(400).json({ error: 'Логин должен быть не короче 3 символов' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Пароль должен быть не короче 6 символов' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return res.status(400).json({ error: 'Некорректная почта' });
  }

  if (findUser({ login: login.trim() })) {
    return res.status(400).json({ error: 'Такой логин уже занят' });
  }

  if (findUser({ email: email.trim() })) {
    return res.status(400).json({ error: 'Такая почта уже зарегистрирована' });
  }

  const verificationCode = createVerificationCode();
  const user = {
    id: createUserId(),
    login: login.trim(),
    email: email.trim().toLowerCase(),
    password,
    verified: false,
    verificationCode,
    codeExpiresAt: Date.now() + CODE_TTL_MS,
    createdAt: new Date().toISOString(),
  };

  addUser(user);

  try {
    await sendVerificationCode(user.email, user.login, verificationCode);
    req.session.pendingUserId = user.id;
    res.json({ ok: true });
  } catch (err) {
    deleteUser(user.id);
    console.error('Register error:', err.message);
    res.status(500).json({ error: getSmtpErrorMessage(err) });
  }
});

app.post('/api/verify', (req, res) => {
  const { code } = req.body;
  const userId = req.session.pendingUserId;

  if (!userId) {
    return res.status(400).json({ error: 'Сначала пройдите регистрацию' });
  }

  if (!code?.trim()) {
    return res.status(400).json({ error: 'Введите код' });
  }

  const user = findUser({ id: userId });

  if (!user) {
    return res.status(400).json({ error: 'Пользователь не найден' });
  }

  if (user.verified) {
    delete req.session.pendingUserId;
    return res.json({ ok: true });
  }

  if (Date.now() > user.codeExpiresAt) {
    return res.status(400).json({ error: 'Код истёк. Зарегистрируйтесь снова.' });
  }

  if (user.verificationCode !== code.trim()) {
    return res.status(400).json({ error: 'Неверный код' });
  }

  updateUser(user.id, {
    verified: true,
    verificationCode: null,
    codeExpiresAt: null,
    verifiedAt: new Date().toISOString(),
  });

  delete req.session.pendingUserId;
  req.session.user = toPublicUser(user);
  res.json({ ok: true });
});

app.post('/api/login', (req, res) => {
  const { login, password } = req.body;

  if (!login?.trim() || !password) {
    return res.status(400).json({ error: 'Введите логин и пароль' });
  }

  const user =
    findUser({ login: login.trim() }) ||
    findUser({ email: login.trim().toLowerCase() });

  if (!user) {
    return res.status(400).json({ error: 'Неверный логин или пароль' });
  }

  if (!user.verified) {
    req.session.pendingUserId = user.id;
    return res.status(403).json({
      error: 'Почта не подтверждена',
      needVerify: true,
    });
  }

  if (user.password !== password) {
    return res.status(400).json({ error: 'Неверный логин или пароль' });
  }

  req.session.user = toPublicUser(user);
  res.json({ ok: true });
});

app.post('/api/resend-code', async (req, res) => {
  const userId = req.session.pendingUserId;

  if (!userId) {
    return res.status(400).json({ error: 'Нет активной регистрации' });
  }

  const user = findUser({ id: userId });

  if (!user || user.verified) {
    return res.status(400).json({ error: 'Пользователь не найден или уже подтверждён' });
  }

  const verificationCode = createVerificationCode();

  updateUser(user.id, {
    verificationCode,
    codeExpiresAt: Date.now() + CODE_TTL_MS,
  });

  try {
    await sendVerificationCode(user.email, user.login, verificationCode);
    res.json({ ok: true });
  } catch (err) {
    console.error('Resend error:', err.message);
    res.status(500).json({ error: getSmtpErrorMessage(err) });
  }
});

app.post('/api/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email?.trim()) {
    return res.status(400).json({ error: 'Введите почту' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return res.status(400).json({ error: 'Некорректная почта' });
  }

  const user = findUser({ email: email.trim().toLowerCase() });

  if (!user) {
    return res.json({ ok: true });
  }

  if (!user.verified) {
    return res.status(400).json({ error: 'Почта не подтверждена. Сначала завершите регистрацию.' });
  }

  const resetCode = createVerificationCode();

  updateUser(user.id, {
    resetCode,
    resetCodeExpiresAt: Date.now() + CODE_TTL_MS,
  });

  try {
    await sendPasswordResetCode(user.email, user.login, resetCode);
    req.session.resetUserId = user.id;
    res.json({ ok: true });
  } catch (err) {
    console.error('Forgot password error:', err.message);
    res.status(500).json({ error: getSmtpErrorMessage(err) });
  }
});

app.post('/api/reset-password', (req, res) => {
  const { code, password, confirmPassword } = req.body;
  const userId = req.session.resetUserId;

  if (!userId) {
    return res.status(400).json({ error: 'Сначала запросите восстановление пароля' });
  }

  if (!code?.trim() || !password || !confirmPassword) {
    return res.status(400).json({ error: 'Заполните все поля' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Пароль должен быть не короче 6 символов' });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'Пароли не совпадают' });
  }

  const user = findUser({ id: userId });

  if (!user) {
    return res.status(400).json({ error: 'Пользователь не найден' });
  }

  if (!user.resetCode || Date.now() > user.resetCodeExpiresAt) {
    return res.status(400).json({ error: 'Код истёк. Запросите новый.' });
  }

  if (user.resetCode !== code.trim()) {
    return res.status(400).json({ error: 'Неверный код' });
  }

  updateUser(user.id, {
    password,
    resetCode: null,
    resetCodeExpiresAt: null,
    passwordUpdatedAt: new Date().toISOString(),
  });

  delete req.session.resetUserId;
  req.session.user = toPublicUser({ ...user, password });
  res.json({ ok: true });
});

app.post('/api/resend-reset-code', async (req, res) => {
  const userId = req.session.resetUserId;

  if (!userId) {
    return res.status(400).json({ error: 'Нет активного восстановления' });
  }

  const user = findUser({ id: userId });

  if (!user) {
    return res.status(400).json({ error: 'Пользователь не найден' });
  }

  const resetCode = createVerificationCode();

  updateUser(user.id, {
    resetCode,
    resetCodeExpiresAt: Date.now() + CODE_TTL_MS,
  });

  try {
    await sendPasswordResetCode(user.email, user.login, resetCode);
    res.json({ ok: true });
  } catch (err) {
    console.error('Resend reset error:', err.message);
    res.status(500).json({ error: getSmtpErrorMessage(err) });
  }
});

app.get('/api/me', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json(req.session.user);
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
