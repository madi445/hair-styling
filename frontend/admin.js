const API_BASE = location.port === '5500' ? 'http://localhost:3000' : '';
const api = (url, options = {}) => fetch(`${API_BASE}${url}`, { credentials: 'include', ...options });
const loginForm = document.querySelector('#adminLogin');
const content = document.querySelector('#adminContent');
const rows = document.querySelector('#paymentsRows');
const labels = { Pending: 'Ожидает проверки', Paid: 'Подтверждён', Rejected: 'Отклонён' };

function errorText(target, message) { document.querySelector(target).textContent = message; }
function addCell(row, value) { const cell = document.createElement('td'); cell.textContent = value; row.appendChild(cell); return cell; }

async function loadPayments() {
  const response = await api('/api/admin/payments');
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Не удалось загрузить список платежей.');
  rows.replaceChildren();
  for (const payment of result.payments) {
    const row = document.createElement('tr');
    const buyer = document.createElement('td');
    buyer.textContent = `${payment.name}\n${payment.phone}\n${payment.email}`;
    buyer.style.whiteSpace = 'pre-line';
    row.appendChild(buyer);
    addCell(row, `${Number(payment.amount).toLocaleString('ru-KZ')} ₸\n${new Date(payment.paid_at).toLocaleString('ru-RU')}`).style.whiteSpace = 'pre-line';
    const statusCell = addCell(row, labels[payment.status] || payment.status);
    statusCell.innerHTML = `<span class="status-pill status-${payment.status.toLowerCase()}">${labels[payment.status] || payment.status}</span>`;
    const proofCell = document.createElement('td');
    const proof = document.createElement('a');
    proof.href = `${API_BASE}${payment.screenshotUrl}`;
    proof.target = '_blank';
    proof.rel = 'noopener';
    const image = document.createElement('img');
    image.className = 'proof-thumb';
    image.src = proof.href;
    image.alt = 'Скриншот оплаты';
    proof.appendChild(image);
    proofCell.appendChild(proof);
    row.appendChild(proofCell);
    const actionCell = document.createElement('td');
    if (payment.status === 'Pending') {
      const actions = document.createElement('div');
      actions.className = 'actions';
      for (const [status, text, extraClass] of [['Paid', 'Подтвердить оплату', ''], ['Rejected', 'Отклонить', 'reject']]) {
        const button = document.createElement('button');
        button.className = `button ${extraClass}`;
        button.type = 'button';
        button.textContent = text;
        button.addEventListener('click', () => review(payment.id, status, button));
        actions.appendChild(button);
      }
      actionCell.appendChild(actions);
    } else actionCell.textContent = 'Рассмотрен';
    row.appendChild(actionCell);
    rows.appendChild(row);
  }
}

async function review(id, status, button) {
  button.disabled = true;
  try {
    const response = await api(`/api/admin/payments/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Не удалось обновить статус.');
    await loadPayments();
  } catch (error) { errorText('#listError', error.message); button.disabled = false; }
}

async function showAdmin() {
  const response = await api('/api/auth/me');
  const result = await response.json();
  if (result.authenticated && result.role === 'admin') {
    loginForm.hidden = true;
    content.hidden = false;
    document.querySelector('#adminLogout').hidden = false;
    await loadPayments();
  }
}

loginForm.addEventListener('submit', async event=>{
  event.preventDefault();const button=loginForm.querySelector('button');if(button.disabled)return;button.disabled=true;errorText('#adminError','');
  try{
    const response=await api('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:document.querySelector('#adminPassword').value})});
    const result=await response.json();if(!response.ok)throw Error(result.error||'Не удалось войти.');await showAdmin();
  }catch(error){errorText('#adminError',error instanceof TypeError||error instanceof SyntaxError?'Не удалось подключиться к серверу. Попробуйте ещё раз.':error.message);}
  finally{button.disabled=false;}
});
document.querySelector('#adminLogout').addEventListener('click',async()=>{try{const response=await api('/api/auth/logout',{method:'POST'});if(!response.ok)throw Error();location.reload();}catch{errorText('#listError','Не удалось выйти. Повторите попытку.');}});

showAdmin().catch((error) => errorText('#adminError', error.message));
