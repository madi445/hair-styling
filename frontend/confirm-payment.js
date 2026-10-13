const form = document.querySelector('#receiptForm');
const errorNode = document.querySelector('#receiptError');
let idempotencyKey = crypto.randomUUID();
let submittedPayload = '';
const readFile = file => new Promise((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error('Не удалось прочитать файл. Выберите его заново.'));
  reader.readAsDataURL(file);
});
form.addEventListener('submit', async event => {
  event.preventDefault(); const button = form.querySelector('button'); errorNode.textContent = '';
  const file = form.elements.screenshot.files[0];
  if (!file || !['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    errorNode.textContent = 'Выберите изображение чека JPG, PNG или WebP до 5 МБ.'; return;
  }
  button.disabled = true;
  try {
    const date = new Date(form.elements.paidAt.value);
    if (Number.isNaN(date.getTime())) throw new Error('Укажите дату и время оплаты.');
    const payload = JSON.stringify({
      name: form.elements.name.value, email: form.elements.email.value, password: form.elements.password.value,
      phone: form.elements.phone.value, amount: Number(form.elements.amount.value), paidAt: date.toISOString(),
      transactionId: form.elements.transactionId.value, rulesAccepted: form.elements.rulesAccepted.checked,
      screenshotData: await readFile(file)
    });
    // Retry the same receipt safely; edits create a new submission key.
    if (submittedPayload && submittedPayload !== payload) idempotencyKey = crypto.randomUUID();
    submittedPayload = payload;
    const response = await fetch('/api/payments', { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type':'application/json', 'Idempotency-Key':idempotencyKey }, body: payload });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Не удалось отправить чек.');
    form.reset(); submittedPayload = '';
    location.assign('/course/payment-status/');
  } catch (error) { errorNode.textContent = error.message || 'Ошибка соединения. Попробуйте ещё раз.'; }
  finally { button.disabled = false; }
});
const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
form.elements.paidAt.value = now.toISOString().slice(0,16);
fetch('/api/config').then(response => response.ok ? response.json() : Promise.reject()).then(config => {
  form.elements.amount.value = config.price;
}).catch(() => { errorNode.textContent = 'Не удалось загрузить цену. Укажите фактически оплаченную сумму.'; });
