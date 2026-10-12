(() => {
  const config = globalThis.SILK_CONFIG;
  if (!config) return;
  const money = value => Number(value).toLocaleString('ru-KZ') + ' ₸';
  const purchaseUrl = config.whatsapp + '?text=' + encodeURIComponent(config.purchaseMessage);
  const questionUrl = config.whatsapp + '?text=' + encodeURIComponent(config.questionMessage);
  document.querySelectorAll('[data-buy]').forEach(link => { link.href = purchaseUrl; });
  document.querySelectorAll('[data-question]').forEach(link => { link.href = questionUrl; });
  document.querySelectorAll('[data-price]').forEach(node => { node.textContent = money(config.price); });
  document.querySelector('#oldPrice').textContent = config.promotionActive && config.price < config.regularPrice ? money(config.regularPrice) : '';
  document.querySelectorAll('[data-course]').forEach(link => {
    if (config.courseUrl) { link.href = config.courseUrl; link.hidden = false; }
  });
  // Hide the floating contact when an action is already visible, so it cannot cover it.
  const floating = document.querySelector('.whatsapp-float');
  if (floating && 'IntersectionObserver' in globalThis) {
    const visible = new Set();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => entry.isIntersecting ? visible.add(entry.target) : visible.delete(entry.target));
      floating.hidden = visible.size > 0;
    });
    document.querySelectorAll('[data-buy], [data-question]:not(.whatsapp-float), .footer').forEach(node => observer.observe(node));
  }
  const root = document.querySelector('#modules'); root.replaceChildren();
  config.modules.forEach((module, index) => {
    const card = document.createElement('article'); card.className = 'module';
    const number = document.createElement('span'); number.className = 'module-number'; number.textContent = String(index + 1).padStart(2, '0');
    const title = document.createElement('h3'); title.textContent = module.title;
    const text = document.createElement('p'); text.textContent = module.text;
    card.append(number, title, text); root.appendChild(card);
  });
})();
