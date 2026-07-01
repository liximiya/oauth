require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const PORT = process.env.PORT || 1235;

const BOT_TOKEN = process.env.BOT_TOKEN;
const BOT_USERNAME = (process.env.BOT_USERNAME || '').replace(/^@/, '');
const SESSION_SECRET = 'liximiya-meow-meow';
const AUTH_TTL_MS = 10 * 60 * 1000;

const pendingAuths = new Map();

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

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

function createAuthToken() {
  return crypto.randomBytes(16).toString('hex');
}

function cleanupExpiredAuths() {
  const now = Date.now();
  for (const [token, entry] of pendingAuths) {
    if (now - entry.createdAt > AUTH_TTL_MS) {
      pendingAuths.delete(token);
    }
  }
}

setInterval(cleanupExpiredAuths, 60 * 1000);

async function getTelegramAvatar(userId) {
  try {
    const photos = await bot.getUserProfilePhotos(userId, { limit: 1 });
    if (photos.total_count > 0) {
      const fileId = photos.photos[0][0].file_id;
      const file = await bot.getFile(fileId);
      return `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
    }
  } catch (err) {
    console.error('Avatar error:', err.message);
  }
  return null;
}

function buildUserData(from, phone) {
  const data = {
    id: from.id,
    nickname: [from.first_name, from.last_name].filter(Boolean).join(' ') || 'Пользователь',
    username: from.username ? `@${from.username}` : null,
    avatarUrl: null,
  };

  if (phone) {
    data.phone = phone;
  }

  return data;
}

async function finishAuth(token, from, phone) {
  const entry = pendingAuths.get(token);
  if (!entry || entry.status === 'completed') {
    return false;
  }

  const userData = buildUserData(from, phone);
  userData.avatarUrl = (await getTelegramAvatar(from.id)) || '/default-avatar.svg';

  entry.userData = userData;
  entry.status = 'completed';
  return true;
}

function findTokenByChatId(chatId) {
  for (const [token, entry] of pendingAuths) {
    if (entry.chatId === chatId && entry.status === 'pending') {
      return token;
    }
  }
  return null;
}

bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const token = match[1]?.trim();

  if (!token) {
    await bot.sendMessage(
      chatId,
      'Привет! Для входа на сайт нажмите кнопку «Авторизация через Telegram» на странице входа.'
    );
    return;
  }

  const entry = pendingAuths.get(token);

  if (!entry || Date.now() - entry.createdAt > AUTH_TTL_MS) {
    await bot.sendMessage(chatId, 'Ссылка недействительна или истекла. Вернитесь на сайт и попробуйте снова.');
    return;
  }

  if (entry.status === 'completed') {
    await bot.sendMessage(chatId, 'Авторизация уже выполнена. Можете вернуться на сайт.');
    return;
  }

  entry.chatId = chatId;
  entry.from = msg.from;

  await bot.sendMessage(
    chatId,
    `Здравствуйте, ${msg.from.first_name}!\n\nПоделитесь номером телефона или продолжите без него:`,
    {
      reply_markup: {
        keyboard: [
          [{ text: 'Поделиться номером', request_contact: true }],
          [{ text: 'Продолжить без номера' }],
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    }
  );
});

bot.on('contact', async (msg) => {
  const chatId = msg.chat.id;
  const token = findTokenByChatId(chatId);

  if (!token || msg.contact.user_id !== msg.from.id) {
    return;
  }

  const ok = await finishAuth(token, msg.from, msg.contact.phone_number);

  if (ok) {
    await bot.sendMessage(chatId, 'Авторизация успешна! Вернитесь на сайт.', {
      reply_markup: { remove_keyboard: true },
    });
  }
});

bot.on('message', async (msg) => {
  if (msg.text !== 'Продолжить без номера' || msg.contact) {
    return;
  }

  const chatId = msg.chat.id;
  const token = findTokenByChatId(chatId);

  if (!token) {
    return;
  }

  const ok = await finishAuth(token, msg.from);

  if (ok) {
    await bot.sendMessage(chatId, 'Авторизация успешна! Вернитесь на сайт.', {
      reply_markup: { remove_keyboard: true },
    });
  }
});

app.get('/', (req, res) => {
  if (req.session.user) {
    return res.redirect('/profile');
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/profile', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, 'public', 'profile.html'));
});

app.get('/waiting', (req, res) => {
  if (!req.session.authToken) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, 'public', 'waiting.html'));
});

app.get('/auth/telegram', (req, res) => {
  if (req.session.user) {
    return res.redirect('/profile');
  }

  const token = createAuthToken();

  pendingAuths.set(token, {
    createdAt: Date.now(),
    status: 'pending',
    chatId: null,
    from: null,
    userData: null,
  });

  req.session.authToken = token;
  res.redirect('/waiting');
});

app.get('/api/auth/bot-link', (req, res) => {
  if (!req.session.authToken) {
    return res.status(400).json({ error: 'No auth token' });
  }

  res.json({
    url: `https://t.me/${BOT_USERNAME}?start=${req.session.authToken}`,
    token: req.session.authToken,
  });
});

app.get('/api/auth/status', (req, res) => {
  const token = req.session.authToken;

  if (!token) {
    return res.status(400).json({ status: 'no_token' });
  }

  const entry = pendingAuths.get(token);

  if (!entry) {
    return res.json({ status: 'expired' });
  }

  if (Date.now() - entry.createdAt > AUTH_TTL_MS) {
    pendingAuths.delete(token);
    return res.json({ status: 'expired' });
  }

  if (entry.status === 'completed' && entry.userData) {
    req.session.user = entry.userData;
    delete req.session.authToken;
    pendingAuths.delete(token);
    return res.json({ status: 'completed' });
  }

  res.json({ status: 'pending' });
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
