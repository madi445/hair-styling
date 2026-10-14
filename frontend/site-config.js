// Public settings only. No passwords, tokens or private video links.
const silkPublicConfig = {
  "price": 30000,
  "regularPrice": 50000,
  "promotionActive": false,
  "whatsapp": "https://wa.me/77479706963",
  "purchaseMessage": "Здравствуйте! Хочу получить доступ к видеоуроку Silk Styling по созданию пляжных локонов. Подскажите актуальную стоимость и как оплатить обучение.",
  "questionMessage": "Здравствуйте! У меня вопрос об авторском видеоуроке Silk Styling.",
  "instagram": "https://www.instagram.com/elvira.akkulykyzy",
  "courseUrl": "https://hair-styling.onrender.com/course/my-course/",
  "reviews": [],
  "modules": [
    {
      "title": "Подготовка волос",
      "text": "Как правильно подготовить волосы к укладке: вымыть, полностью высушить на 100% и обязательно использовать термозащиту."
    },
    {
      "title": "Локоны и прикорневой объём",
      "text": "Как работать с утюжком, создавать расслабленные пляжные локоны и придавать волосам объём у корней, не теряя визуальную длину."
    },
    {
      "title": "Текстура и фиксация",
      "text": "Как использовать жидкий лак для сохранения текстуры и сухой лак для фиксации без утяжеления волос."
    }
  ],
  "courseName": "Небрежные пляжные локоны",
  "receiptUrl": "https://hair-styling.onrender.com/course/confirm-payment/",
  "brand": "SILK STYLING",
  "author": "Эльвира Аққұлықызы",
  "canRewatch": true,
  "launchDate": "",
  "siteUrl": "https://heartfelt-pie-f54630.netlify.app/"
};
if (typeof module !== "undefined" && module.exports) module.exports = silkPublicConfig;
else globalThis.SILK_CONFIG = silkPublicConfig;
