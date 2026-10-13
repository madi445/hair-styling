module.exports = {
  port: process.env.PORT || 3000,
  databasePath: process.env.DATABASE_PATH,
  videoPath: process.env.VIDEO_PATH,
  videoPaths: {
    'lesson-1': process.env.VIDEO_PATH
  },
  qrPath: process.env.KASPI_QR_PATH,
  adminPassword: process.env.ADMIN_PASSWORD || '',
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:5500,http://127.0.0.1:5500').split(',').map((origin) => origin.trim()),
  publicConfig: {
    ...require('../frontend/site-config.js'),
    sellerName: 'ИП Эльвира',
    sellerAddress: 'г. Астана, пр. Әл-Фараби д. 33',
    kaspiQrUrl: '/assets/kaspi-qr.jpeg'
  },
  lessons: [
    { id: 'lesson-1', title: 'Урок 1. Подготовка волос', description: 'Подготовка волос к созданию пляжных небрежных локонов.' }
  ]
};
