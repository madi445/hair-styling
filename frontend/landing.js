const API_BASE = location.port === '5500' ? 'http://localhost:3000' : '';
const money = (value) => `${Number(value).toLocaleString('ru-KZ')} ₸`;
const modulesRoot = document.querySelector('#modules');

function showModules(modules) {
  modulesRoot.replaceChildren();
  modules.forEach((module, index) => {
    const card = document.createElement('article');
    card.className = 'module';
    const number = document.createElement('span');
    number.className = 'module-number';
    number.textContent = String(index + 1).padStart(2, '0');
    const title = document.createElement('h3');
    title.textContent = module.title;
    const text = document.createElement('p');
    text.textContent = module.text;
    card.append(number, title, text);
    modulesRoot.appendChild(card);
  });
}

async function loadLanding() {
  const response = await fetch(`${API_BASE}/api/config`, { credentials: 'include' });
  if (!response.ok) throw new Error('Backend unavailable');
  const offer = await response.json();
  document.querySelectorAll('[data-buy]').forEach(link => { link.href = offer.purchaseUrl; });
  document.querySelector('#price').textContent = money(offer.price);
  document.querySelector('#oldPrice').textContent = offer.promoActive ? money(offer.regularPrice) : '';
  document.querySelector('#promoNote').textContent = offer.promoActive ? 'Первые 7 дней специальная цена.' : 'Сейчас действует стандартная цена.';
  showModules(offer.modules);
  const timer = document.querySelector('#timer');
  const updateTimer = () => {
    const remaining = Date.parse(offer.promoEndsAt) - Date.now();
    if (!offer.promoActive || remaining <= 0) { timer.textContent = 'Период специальной цены завершён'; return; }
    const days = Math.floor(remaining / 86400000);
    const hours = Math.floor((remaining % 86400000) / 3600000);
    const minutes = Math.floor((remaining % 3600000) / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    timer.textContent = `До окончания скидки: ${days} дн. ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };
  updateTimer();
  window.setInterval(updateTimer, 1000);
}

loadLanding().catch(() => {
  document.querySelector('#price').textContent = 'Цена временно недоступна';
  document.querySelector('#timer').textContent = 'Для просмотра запустите backend: npm start';
});
