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
    promoPrice: 30000,
    regularPrice: 50000,
    promoDays: 7,
    whatsapp: 'https://wa.me/77479706963',
    instagram: 'https://www.instagram.com/elvira.akkulykyzy?stkn=dDZ1eGdnNWlib2Fw',
    sellerName: 'ИП Эльвира',
    sellerAddress: 'г. Астана, пр. Әл-Фараби д. 33',
    kaspiQrUrl: '/assets/kaspi-qr.jpeg',
    modules: [
      { title: 'Подготовка волос', text: 'Термозащита, правильная сушка и база, от которой зависит стойкость.' },
      { title: 'Объём у корней', text: 'Лифтинг без липкости: техника брашинга и работа с направлением.' },
      { title: 'Гладкость и блеск', text: 'Как убрать пушистость и получить полотно, которое отражает свет.' },
      { title: 'Мягкие волны', text: 'Разбор плойки, температуры и формы локона для естественного движения.' },
      { title: 'Финальная фиксация', text: 'Собираем образ целиком и учимся продлевать жизнь укладки.' }
    ]
  },
  lessons: [
    { id: 'lesson-1', title: 'Урок 1. Подготовка волос', description: 'Техника подготовки и создания стойкой укладки.' }
  ]
};
