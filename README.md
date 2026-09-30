# Silk Styling

## Запуск

```powershell
npm start
```

Откройте `http://localhost:3000`.

## Структура

- `index.html` - frontend лендинга.
- `backend/server.js` - backend API и раздача frontend.
- `backend/config.js` - серверная цена, контакты, платёжная ссылка и приватные видео.

## Настройка

Для продакшена задайте переменные окружения:

```powershell
$env:PORT = 3000
$env:PAYMENT_URL = 'https://ваш-платёжный-провайдер/checkout'
$env:VIDEO_URL = 'https://ваш-приватный-плеер/токен'
npm start
```

`POST /api/orders` принимает `name`, `contact` и `rulesAccepted`. В реальном проекте сохраните заказ в базе данных и подтверждайте оплату webhook-ом платёжного провайдера перед выдачей видео.
