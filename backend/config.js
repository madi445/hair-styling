module.exports = {
  port: process.env.PORT || 3000,
  publicConfig: {
    price: 3490,
    oldPrice: 5990,
    whatsapp: 'https://wa.me/77479706963',
    instagram: 'https://www.instagram.com/elvira.akkulykyzy?stkn=dDZ1eGdnNWlib2Fw',
    deliveryTime: '15 минут',
    modules: [
      { title: 'Подготовка волос', text: 'Термозащита, правильная сушка и база, от которой зависит стойкость.' },
      { title: 'Объём у корней', text: 'Лифтинг без липкости: техника брашинга и работа с направлением.' },
      { title: 'Гладкость и блеск', text: 'Как убрать пушистость и получить полотно, которое отражает свет.' },
      { title: 'Мягкие волны', text: 'Разбор плойки, температуры и формы локона для естественного движения.' },
      { title: 'Финальная фиксация', text: 'Собираем образ целиком и учимся продлевать жизнь укладки.' }
    ]
  },
  paymentUrl: process.env.PAYMENT_URL || 'https://example.com/payment',
  videos: [
    { title: 'Урок 1', videoUrl: process.env.VIDEO_URL || '/videos/IMG_1016.MOV' }
  ]
};
