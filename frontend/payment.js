const API_BASE = location.port === '5500' ? 'http://localhost:3000' : '';
const money = (value) => `${Number(value).toLocaleString('ru-KZ')} ₸`;
const api = (path, options = {}) => fetch(`${API_BASE}${path}`, { credentials: 'include', ...options });
const form = document.querySelector('#paymentForm');
let offerData;

const terms = document.createElement('details');
terms.className = 'notice';
const termsTitle = document.createElement('summary');
termsTitle.textContent = 'Правила использования видео курса';
const termsText = document.createElement('p');
termsText.textContent = 'Видео-материалы предназначены только для личного использования. Запрещено копировать, скачивать, записывать экран, пересылать третьим лицам, публиковать или продавать материалы. Видео содержат персональный водяной знак. При распространении доступ может быть заблокирован без возврата средств.';
terms.append(termsTitle, termsText);
document.querySelector('.checkrow').before(terms);

function showError(message) { document.querySelector('#formError').textContent = message; }
function updateTimer() {
  const output = document.querySelector('#promoTimer');
  if (!offerData?.promoActive) { output.textContent = 'Акционная цена завершена'; return; }
  const left = Math.max(0, Date.parse(offerData.promoEndsAt) - Date.now());
  const days = Math.floor(left / 86400000);
  const hours = Math.floor((left % 86400000) / 3600000);
  const minutes = Math.floor((left % 3600000) / 60000);
  const seconds = Math.floor((left % 60000) / 1000);
  output.textContent = `До окончания цены 30 000 ₸: ${days} дн. ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

async function initialize() {
  const response = await api('/api/config');
  if (!response.ok) throw new Error('Не удалось загрузить цену. Убедитесь, что backend запущен на порту 3000.');
  offerData = await response.json();
  document.querySelector('#currentPrice').textContent = money(offerData.price);
  document.querySelector('#regularPrice').textContent = offerData.promoActive ? money(offerData.regularPrice) : '';
  document.querySelector('#sellerName').textContent = offerData.sellerName;
  document.querySelector('#sellerAddress').textContent = offerData.sellerAddress;
  const qr = document.querySelector('#kaspiQr');
  qr.style.display = 'none';
  if (offerData.qrAvailable) { qr.src = `${API_BASE}${offerData.kaspiQrUrl}`; qr.hidden = false; qr.style.display = 'block'; document.querySelector('#qrMissing').hidden = true; }
  document.querySelector('#amount').value = offerData.price;
  updateTimer();
  window.setInterval(updateTimer, 1000);
}

document.querySelector('#paidButton').addEventListener('click', () => {
  document.querySelector('#formPanel').hidden = false;
  document.querySelector('#formPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  const local = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  document.querySelector('#paidAt').value = local;
});

document.querySelector('#phone').addEventListener('input', (event) => {
  const input = event.currentTarget;
  let digits = input.value.replace(/\D/g, '');
  if (!digits) { input.value = ''; return; }
  if (digits.startsWith('8') || digits.startsWith('7')) digits = digits.slice(1);
  digits = digits.slice(0, 10);
  let formatted = '8';
  if (digits.length) formatted += ` (${digits.slice(0, 3)}`;
  if (digits.length >= 3) formatted += ')';
  if (digits.length > 3) formatted += ` ${digits.slice(3, 6)}`;
  if (digits.length > 6) formatted += `-${digits.slice(6, 8)}`;
  if (digits.length > 8) formatted += `-${digits.slice(8, 10)}`;
  input.value = formatted;
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  showError('');
  const submit = document.querySelector('#submitPayment');
  if (!form.reportValidity()) return;
  const file = document.querySelector('#screenshot').files[0];
  if (!file || file.size > 5 * 1024 * 1024) { showError('Выберите скриншот до 5 МБ.'); return; }
  submit.disabled = true;
  try {
    const screenshotData = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Не удалось прочитать изображение.'));
      reader.readAsDataURL(file);
    });
    let idempotencyKey = sessionStorage.getItem('silk-payment-key');
    if (!idempotencyKey) { idempotencyKey = crypto.randomUUID(); sessionStorage.setItem('silk-payment-key', idempotencyKey); }
    const response = await api('/api/payments', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ name: document.querySelector('#name').value, phone: document.querySelector('#phone').value, email: document.querySelector('#email').value, password: document.querySelector('#password').value, amount: Number(document.querySelector('#amount').value), paidAt: new Date(document.querySelector('#paidAt').value).toISOString(), transactionId: document.querySelector('#transactionId').value, screenshotData, rulesAccepted: document.querySelector('#rulesAccepted').checked })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Не удалось отправить платёж.');
    sessionStorage.removeItem('silk-payment-key');
    location.href = '/course/payment/success/';
  } catch (error) { showError(error.message || 'Ошибка отправки. Проверьте подключение и повторите.'); submit.disabled = false; }
});

initialize().catch((error) => { document.querySelector('#currentPrice').textContent = '—'; showError(error.message); });
