# OAuth

В своих проектах я использую несколько вариантов входа пользователей. Это готовые шаблоны на **Node.js + Express**, которые можно подключать к своим сайтам.

## Способы авторизации

| Способ | Папка |
|--------|-------|
| **Discord** | `oauth-discord/` | 
| **Telegram** | `oauth-telegram-bot/` | 
| **Google** | `oauth-google/` | 
| **Email** | `oauth-email/` | 

## Запуск

```bash
cd oauth-discord      # или другая папка
npm install
npm start
```

## Настройка

- **Discord / Google** - Client ID, Client Secret и Redirect URI в [Discord Developer Portal](https://discord.com/developers/applications) / [Google Cloud Console](https://console.cloud.google.com/)
- **Telegram** - токен бота и username в `.env`, бот через [@BotFather](https://t.me/BotFather)
- **Email** - SMTP-хост, логин и пароль почтового ящика в `.env`, пользователи хранятся в `oauth-email/data/users.json`

