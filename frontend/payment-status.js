const title = document.querySelector('#statusTitle');
const message = document.querySelector('#statusMessage');
let finished = false;
async function check() {
  const response = await fetch('/api/my-payments', { credentials:'same-origin', cache:'no-store' });
  if (response.status === 401) { title.textContent = 'Войдите в аккаунт'; message.textContent = 'Используйте email и пароль, указанные при отправке чека.'; return; }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Не удалось проверить статус.');
  const payment = result.payments[0];
  if (!payment) { title.textContent = 'Чек ещё не отправлен'; message.textContent = 'После оплаты в WhatsApp прикрепите чек для проверки.'; return; }
  if (payment.status === 'Paid') {
    title.textContent = 'Оплата подтверждена'; message.textContent = 'Переходим к вашему курсу…';
    finished = true; location.replace('/course/my-course/'); return;
  }
  title.textContent = payment.status === 'Rejected' ? 'Оплата не подтверждена' : 'Чек на проверке';
  message.textContent = payment.status === 'Rejected' ? 'Свяжитесь с владельцем курса в WhatsApp, чтобы уточнить причину.' : 'Владелец курса сверит поступление денег. Доступ к видео пока закрыт.';
}
async function poll() {
  try { await check(); } catch { message.textContent = 'Не удалось обновить статус. Проверим ещё раз.'; }
  if (!finished) setTimeout(poll, 10000);
}
poll();
