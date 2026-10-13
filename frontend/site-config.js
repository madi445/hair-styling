// Public settings only. Never place passwords, tokens or private video links here.
const silkPublicConfig = {
  "price": 30000,
  "regularPrice": 50000,
  "promotionActive": false,
  "whatsapp": "https://wa.me/77479706963",
  "purchaseMessage": "Здравствуйте! Хочу приобрести онлайн-курс \"Пляжные небрежные локоны\". Подскажите, пожалуйста, как произвести оплату и получить доступ к урокам?",
  "questionMessage": "Здравствуйте! У меня вопрос об онлайн-курсе \"Пляжные небрежные локоны\".",
  "instagram": "https://www.instagram.com/elvira.akkulykyzy",
  "courseUrl": "",
  "reviews": [],
  "modules": [
    {
      "title": "Подготовка и термозащита",
      "text": "Подготовка волос и нанесение термозащиты. Без привязки к конкретному бренду."
    },
    {
      "title": "Лёгкий объём",
      "text": "Подготовка прикорневой зоны для естественного объёма без перегруженности."
    },
    {
      "title": "Пляжные локоны",
      "text": "Направление и форма локонов для расслабленного, небрежного образа."
    },
    {
      "title": "Воздушная текстура",
      "text": "Разбираем локоны и придаём им мягкость и естественную подвижность."
    },
    {
      "title": "Лёгкая фиксация",
      "text": "Жидкий лак и сухой лак — понемногу, чтобы сохранить лёгкость локонов."
    }
  ],
  "courseName": "Пляжные небрежные локоны"
};
if (typeof module !== 'undefined' && module.exports) module.exports = silkPublicConfig;
else globalThis.SILK_CONFIG = silkPublicConfig;
