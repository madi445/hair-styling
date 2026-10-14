const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'data');
const databasePath = config.databasePath || path.join(dataDir, 'silk-styling.sqlite');
const videoPaths = {
  ...config.videoPaths,
  'lesson-1': config.videoPaths['lesson-1'] || config.videoPath || path.join(root, 'videos', 'lesson-1.mp4')
};
const qrPath = config.qrPath || path.join(root, 'assets', 'kaspi-qr.jpeg');
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new DatabaseSync(databasePath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    amount INTEGER NOT NULL,
    paid_at TEXT NOT NULL,
    transaction_id TEXT NOT NULL DEFAULT '',
    screenshot_path TEXT NOT NULL,
    screenshot_data BLOB,
    screenshot_mime TEXT,
    screenshot_hash TEXT NOT NULL UNIQUE,
    rules_accepted INTEGER NOT NULL CHECK(rules_accepted IN (0, 1)),
    rules_accepted_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('Pending', 'Paid', 'Rejected')) DEFAULT 'Pending',
    idempotency_key TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    reviewed_at TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS payments_transaction_unique
    ON payments(transaction_id) WHERE transaction_id <> '';
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    role TEXT NOT NULL CHECK(role IN ('user', 'admin')),
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS course_access (
    user_id INTEGER NOT NULL REFERENCES users(id),
    course_id TEXT NOT NULL,
    payment_id TEXT NOT NULL REFERENCES payments(id),
    granted_at TEXT NOT NULL,
    PRIMARY KEY(user_id, course_id)
  );
`);

const paymentColumns = new Set(db.prepare('PRAGMA table_info(payments)').all().map((column) => column.name));
if (!paymentColumns.has('screenshot_data')) db.exec('ALTER TABLE payments ADD COLUMN screenshot_data BLOB');
if (!paymentColumns.has('screenshot_mime')) db.exec('ALTER TABLE payments ADD COLUMN screenshot_mime TEXT');
if (!paymentColumns.has('rules_accepted')) db.exec('ALTER TABLE payments ADD COLUMN rules_accepted INTEGER NOT NULL DEFAULT 0 CHECK(rules_accepted IN (0, 1))');
if (!paymentColumns.has('rules_accepted_at')) db.exec("ALTER TABLE payments ADD COLUMN rules_accepted_at TEXT NOT NULL DEFAULT ''");

const queries = {
  userByEmail: db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE'),
  userById: db.prepare('SELECT id, name, phone, email, created_at FROM users WHERE id = ?'),
  createUser: db.prepare('INSERT INTO users(name, phone, email, password_salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
  paymentByIdempotency: db.prepare('SELECT id, status FROM payments WHERE idempotency_key = ?'),
  paymentById: db.prepare('SELECT * FROM payments WHERE id = ?'),
  myPayments: db.prepare('SELECT id, amount, paid_at, status, created_at FROM payments WHERE user_id = ? ORDER BY created_at DESC'),
  adminPayments: db.prepare(`SELECT p.id, u.name, u.phone, u.email, p.amount, p.paid_at, p.transaction_id, p.status, p.created_at
    FROM payments p JOIN users u ON u.id = p.user_id ORDER BY p.created_at DESC`),
  access: db.prepare(`SELECT ca.course_id FROM course_access ca JOIN payments p ON p.id = ca.payment_id
    WHERE ca.user_id = ? AND p.status = 'Paid'`)
};

function sendJson(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(payload));
}

function readJson(request, maxBytes = 7 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    request.on('data', (chunk) => {
      length += chunk.length;
      if (length > maxBytes) {
        reject(Object.assign(new Error('Request is too large'), { status: 413 }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try { const body=JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');if(!body || typeof body!=='object' || Array.isArray(body)) throw Error('Object required');resolve(body); }
      catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
    });
    request.on('error', reject);
  });
}

function offer() {
  return {
    price: config.publicConfig.price,
    regularPrice: config.publicConfig.regularPrice,
    promoActive: config.publicConfig.promotionActive === true && config.publicConfig.price < config.publicConfig.regularPrice
  };
}

function parseCookies(request) {
  return Object.fromEntries((request.headers.cookie || '').split(';').map((entry) => entry.trim().split(/=(.*)/s).slice(0, 2)).filter(([key, value]) => key && value));
}

function currentSession(request) {
  const token = parseCookies(request).silk_session;
  if (!token) return null;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const session = db.prepare('SELECT token_hash, user_id, role, expires_at FROM sessions WHERE token_hash = ?').get(tokenHash);
  if (!session || session.expires_at <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    return null;
  }
  return session;
}

function setSession(response, userId, role) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
  db.prepare('INSERT INTO sessions(token_hash, user_id, role, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(crypto.createHash('sha256').update(token).digest('hex'), userId, role, expiresAt, new Date().toISOString());
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader('Set-Cookie', `silk_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure}`);
}

function clearSession(request, response) {
  const token = parseCookies(request).silk_session;
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(crypto.createHash('sha256').update(token).digest('hex'));
  response.setHeader('Set-Cookie', 'silk_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') };
}

function isPasswordValid(password, salt, storedHash) {
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(storedHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function saveScreenshot(dataUrl) {
  const match = typeof dataUrl === 'string' && dataUrl.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw Object.assign(new Error('Загрузите скриншот в формате PNG, JPG или WebP.'), { status: 400 });
  const image = Buffer.from(match[2], 'base64');
  if (!image.length || image.length > 5 * 1024 * 1024) throw Object.assign(new Error('Размер скриншота не должен превышать 5 МБ.'), { status: 413 });
  const signatures = {
    png: image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    jpeg: image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff,
    webp: image.toString('ascii', 0, 4) === 'RIFF' && image.toString('ascii', 8, 12) === 'WEBP'
  };
  if (!signatures[match[1]]) throw Object.assign(new Error('Формат файла не совпадает с изображением.'), { status: 400 });
  return { image, mime: `image/${match[1]}`, hash: crypto.createHash('sha256').update(image).digest('hex') };
}

function requireUser(request, response) {
  const session = currentSession(request);
  if (!session || session.role !== 'user') {
    sendJson(response, 401, { error: 'Войдите в аккаунт, чтобы продолжить.' });
    return null;
  }
  return session;
}

function requireAdmin(request, response) {
  const session = currentSession(request);
  if (!session || session.role !== 'admin') {
    sendJson(response, 401, { error: 'Требуется вход администратора.' });
    return null;
  }
  return session;
}

function allowedOrigin(request, response) {
  const origin = request.headers.origin;
  if (!origin) return true;
  const sameOrigin = origin === `http://${request.headers.host}` || origin === `https://${request.headers.host}`;
  if (!sameOrigin && !config.allowedOrigins.includes(origin)) return false;
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Vary', 'Origin');
  return true;
}

function purchaseUrl() {
  return config.publicConfig.whatsapp + '?text=' + encodeURIComponent(config.publicConfig.purchaseMessage);
}
function serveStatic(urlPath, response) {
  if (/^\/(?:course\/payment(?:\/(?:success|pending))?\/?|frontend\/(?:payment|pending|success)\.html)$/.test(urlPath)) {
    response.writeHead(303, { Location: purchaseUrl(), 'Cache-Control': 'no-store' });
    response.end();
    return true;
  }
  const pages = new Map([
    ['/', 'index.html'], ['/index.html', 'index.html'], ['/course/', 'index.html'], ['/course/payment/', 'frontend/payment.html'],
    ['/course/payment/success/', 'frontend/success.html'], ['/course/payment/pending/', 'frontend/pending.html'],
    ['/course/confirm-payment/', 'frontend/confirm-payment.html'], ['/course/payment-status/', 'frontend/payment-status.html'], ['/course/my-course/', 'frontend/my-course.html'], ['/admin/payments/', 'frontend/admin-payments.html']
  ]);
  let relativePath = pages.get(urlPath);
  const lessonMatch = urlPath.match(/^\/course\/lesson\/([a-z0-9-]+)\/$/i);
  if (lessonMatch) relativePath = 'frontend/lesson.html';
  if (urlPath === '/frontend/course.css') relativePath = 'frontend/course.css';
  if (urlPath === '/frontend/course.js') relativePath = 'frontend/course.js';
  if (urlPath === '/frontend/confirm-payment.js') relativePath = 'frontend/confirm-payment.js';
  if (urlPath === '/frontend/payment-status.js') relativePath = 'frontend/payment-status.js';
  if (urlPath === '/frontend/payment.js') relativePath = 'frontend/payment.js';
  if (urlPath === '/frontend/admin.js') relativePath = 'frontend/admin.js';
  if (urlPath === '/frontend/site-config.js') relativePath = 'frontend/site-config.js';
  if (urlPath === '/frontend/landing.css') relativePath = 'frontend/landing.css';
  if (urlPath === '/assets/favicon.svg') relativePath = 'assets/favicon.svg';
  if (urlPath === '/assets/preview.png') relativePath = 'assets/preview.png';
  if (urlPath === '/assets/preview.svg') relativePath = 'assets/preview.svg';
  if (urlPath === '/frontend/landing.js') relativePath = 'frontend/landing.js';
  if (urlPath === config.publicConfig.kaspiQrUrl && fs.existsSync(qrPath)) relativePath = qrPath;
  if (!relativePath) return false;
  const filePath = path.isAbsolute(relativePath) ? relativePath : path.join(root, relativePath);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;
  const extension = path.extname(filePath).toLowerCase();
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
  response.writeHead(200, { 'Content-Type': types[extension] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  if (relativePath === 'index.html') {
    const html = fs.readFileSync(filePath, 'utf8').replace(/(data-whatsapp href=")[^"]*"/g, '$1' + purchaseUrl().replaceAll('&', '&amp;') + '"').replace('data-course hidden', 'data-course');
    response.end(html);
  } else fs.createReadStream(filePath).pipe(response);
  return true;
}

function pipeVideo(file, options, request, response){
  const stream=fs.createReadStream(file,options);
  stream.on('error',()=>response.destroy());
  response.once('close',()=>stream.destroy());
  request.once('aborted',()=>stream.destroy());
  stream.pipe(response);
}
function streamVideo(request, response, userId, lessonId) {
  const hasAccess = queries.access.get(userId)?.course_id === 'hair-styling';
  if (!hasAccess) return sendJson(response, 403, { error: 'Доступ откроется после подтверждения оплаты.' });
  const videoPath = videoPaths[lessonId];
  if (!config.lessons.some((lesson) => lesson.id === lessonId) || !videoPath) return sendJson(response, 404, { error: 'Урок не найден.' });
  if (!fs.existsSync(videoPath)) return sendJson(response, 404, { error: 'Видео пока не загружено на сервер.' });
  const size = fs.statSync(videoPath).size;
  const range = request.headers.range;
  const type = path.extname(videoPath).toLowerCase() === '.mov' ? 'video/quicktime' : 'video/mp4';
  response.setHeader('Content-Type', type);
  response.setHeader('Accept-Ranges', 'bytes');
  response.setHeader('Cache-Control', 'private, no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (range) {
    const match = range.match(/^bytes=(\d*)-(\d*)$/);
    if (!match) {
      response.writeHead(416, { 'Content-Range': `bytes */${size}` });
      return response.end();
    }
    const first=Number(match[1]),last=Number(match[2]);
    if ((!match[1]&&!match[2]) || (match[1]&&!Number.isSafeInteger(first)) || (match[2]&&!Number.isSafeInteger(last)) || (!match[1]&&last<=0)) {
      response.writeHead(416,{'Content-Range':`bytes */${size}`});return response.end();
    }
    const start = match[1] ? first : Math.max(0, size - last);
    const end = match[2] && match[1] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (start >= size || end < start) {
      response.writeHead(416, { 'Content-Range': `bytes */${size}` });
      return response.end();
    }
    response.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
    return pipeVideo(videoPath,{start,end},request,response);
  }
  response.writeHead(200, { 'Content-Length': size });
  pipeVideo(videoPath,{},request,response);
}

const loginAttempts = new Map();
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    if (!allowedOrigin(request, response)) return sendJson(response, 403, { error: 'Недопустимый источник запроса.' });
    if (request.method === 'OPTIONS') {
      response.writeHead(204, { 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Idempotency-Key' });
      return response.end();
    }

    if (request.method === 'GET' && url.pathname === '/api/config') {
      const promo = offer();
      return sendJson(response, 200, { ...config.publicConfig, ...promo, purchaseUrl: purchaseUrl(), qrAvailable: fs.existsSync(qrPath), lessons: config.lessons });
    }
    if (request.method === 'GET' && url.pathname === '/api/health') return sendJson(response, 200, { status: 'ok' });

    if (request.method === 'POST' && url.pathname === '/api/payments') {
      const data = await readJson(request);
      const name = typeof data.name === 'string' ? data.name.trim().slice(0, 120) : '';
      const phone = typeof data.phone === 'string' ? data.phone.trim().slice(0, 40) : '';
      const email = typeof data.email === 'string' ? data.email.trim().toLowerCase().slice(0, 254) : '';
      const amount = Number(data.amount);
      const paidAt = typeof data.paidAt === 'string' ? new Date(data.paidAt) : null;
      const transactionId = typeof data.transactionId === 'string' ? data.transactionId.trim().slice(0, 120) : '';
      const password = typeof data.password === 'string' ? data.password : '';
      const idempotencyKey = request.headers['idempotency-key'];
      if (!name || !validEmail(email) || !paidAt || Number.isNaN(paidAt.getTime()) || !idempotencyKey || idempotencyKey.length > 100) {
        return sendJson(response, 400, { error: 'Проверьте имя, email и дату оплаты.' });
      }
      if (paidAt.getTime() > Date.now() + 5 * 60 * 1000 || paidAt.getTime() < Date.now() - 30 * 24 * 60 * 60 * 1000) {
        return sendJson(response, 400, { error: 'Укажите дату оплаты за последние 30 дней.' });
      }
      if (amount !== offer().price) return sendJson(response, 409, { error: `Сумма должна совпадать с текущей ценой: ${offer().price} ₸.` });
      if (data.rulesAccepted !== true) return sendJson(response, 400, { error: 'Подтвердите правила использования курса.' });
      if (password.length < 10 || password.length > 128) return sendJson(response, 400, { error: 'Пароль для аккаунта должен содержать не менее 10 символов.' });
      const duplicate = queries.paymentByIdempotency.get(idempotencyKey);
      if (duplicate) {
        const owner = queries.paymentById.get(duplicate.id);
        const account = db.prepare('SELECT email, password_salt, password_hash FROM users WHERE id = ?').get(owner.user_id);
        if (account.email.toLowerCase() !== email || !isPasswordValid(password, account.password_salt, account.password_hash)) {
          return sendJson(response, 401, { error: 'Для повтора отправки войдите в аккаунт с тем же email и паролем.' });
        }
        setSession(response, owner.user_id, 'user');
        return sendJson(response, 200, { paymentId: duplicate.id, status: duplicate.status, repeated: true });
      }

      const screenshot = saveScreenshot(data.screenshotData);
      let paymentId;
      try {
        db.exec('BEGIN IMMEDIATE');
        let user = queries.userByEmail.get(email);
        if (user) {
          if (!isPasswordValid(password, user.password_salt, user.password_hash)) throw Object.assign(new Error('Аккаунт с этим email уже существует. Войдите с вашим паролем.'), { status: 401 });
          db.prepare('UPDATE users SET name = ?, phone = ? WHERE id = ?').run(name, phone, user.id);
        } else {
          const credential = hashPassword(password);
          const result = queries.createUser.run(name, phone, email, credential.salt, credential.hash, new Date().toISOString());
          user = { id: Number(result.lastInsertRowid) };
        }
        paymentId = crypto.randomUUID();
        const acceptedAt = new Date().toISOString();
        db.prepare(`INSERT INTO payments(id, user_id, amount, paid_at, transaction_id, screenshot_path, screenshot_data, screenshot_mime, screenshot_hash, rules_accepted, rules_accepted_at, idempotency_key, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(paymentId, user.id, amount, paidAt.toISOString(), transactionId, '', screenshot.image, screenshot.mime, screenshot.hash, 1, acceptedAt, idempotencyKey, acceptedAt);
        db.exec('COMMIT');
        setSession(response, user.id, 'user');
      } catch (error) {
        db.exec('ROLLBACK');
        if (error.errcode === 2067 || error.message.includes('UNIQUE constraint failed')) return sendJson(response, 409, { error: 'Этот платёж или скриншот уже отправлен на проверку.' });
        throw error;
      }
      return sendJson(response, 201, { paymentId, status: 'Pending' });
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/login') {
      const data = await readJson(request, 16000);
      const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
      const password = typeof data.password === 'string' ? data.password : '';
      if(!validEmail(email)||email.length>254||password.length<1||password.length>128)return sendJson(response,400,{error:'Проверьте email и пароль.'});
      const attemptKey='user:'+request.socket.remoteAddress+':'+email;
      const record=loginAttempts.get(attemptKey)||{count:0,resetAt:Date.now()+15*60*1000};
      if(record.resetAt<Date.now()){record.count=0;record.resetAt=Date.now()+15*60*1000;}
      if(record.count>=8)return sendJson(response,429,{error:'Слишком много попыток. Попробуйте позже.'});
      record.count++;loginAttempts.set(attemptKey,record);
      const user = queries.userByEmail.get(email);
      if (!user || !isPasswordValid(password, user.password_salt, user.password_hash)) return sendJson(response, 401, { error: 'Неверный email или пароль.' });
      loginAttempts.delete(attemptKey);
      setSession(response, user.id, 'user');
      return sendJson(response, 200, { user: queries.userById.get(user.id) });
    }

    if (request.method === 'POST' && url.pathname === '/api/admin/login') {
      const address = request.socket.remoteAddress || 'unknown';
      const attempts = loginAttempts.get(address) || { count: 0, resetAt: Date.now() + 15 * 60 * 1000 };
      if (attempts.resetAt < Date.now()) { attempts.count = 0; attempts.resetAt = Date.now() + 15 * 60 * 1000; }
      if (attempts.count >= 8) return sendJson(response, 429, { error: 'Слишком много попыток. Попробуйте позже.' });
      attempts.count += 1;
      loginAttempts.set(address, attempts);
      const data = await readJson(request, 16000);
      const supplied = Buffer.from(typeof data.password === 'string' ? data.password : '');
      const expected = Buffer.from(config.adminPassword);
      if (!expected.length || supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return sendJson(response, 401, { error: 'Неверный пароль администратора или не настроен ADMIN_PASSWORD.' });
      loginAttempts.delete(address);
      setSession(response, null, 'admin');
      return sendJson(response, 200, { authenticated: true });
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
      clearSession(request, response);
      return sendJson(response, 200, { ok: true });
    }

    if (request.method === 'GET' && url.pathname === '/api/auth/me') {
      const session = currentSession(request);
      if (!session) return sendJson(response, 200, { authenticated: false });
      return sendJson(response, 200, { authenticated: true, role: session.role, user: session.role === 'user' ? queries.userById.get(session.user_id) : null });
    }

    if (request.method === 'GET' && url.pathname === '/api/my-payments') {
      const session = requireUser(request, response);
      if (!session) return;
      return sendJson(response, 200, { payments: queries.myPayments.all(session.user_id) });
    }

    if (request.method === 'GET' && url.pathname === '/api/my-course') {
      const session = requireUser(request, response);
      if (!session) return;
      const user = queries.userById.get(session.user_id);
      const access = queries.access.get(session.user_id);
      if (!access) return sendJson(response, 403, { error: 'Доступ к курсу откроется после подтверждения оплаты.' });
      return sendJson(response, 200, { user, lessons: config.lessons.map(({ id, title, description }) => ({ id, title, description, url: `/course/lesson/${id}/` })) });
    }

    const lessonVideoMatch = url.pathname.match(/^\/api\/lessons\/([a-z0-9-]+)\/video$/i);
    if (request.method === 'GET' && lessonVideoMatch) {
      const session = requireUser(request, response);
      if (!session) return;
      return streamVideo(request, response, session.user_id, lessonVideoMatch[1]);
    }

    if (url.pathname === '/api/admin/payments' && request.method === 'GET') {
      if (!requireAdmin(request, response)) return;
      return sendJson(response, 200, { payments: queries.adminPayments.all().map((payment) => ({ ...payment, screenshotUrl: `/api/admin/payments/${payment.id}/screenshot` })) });
    }

    const paymentStatusMatch = url.pathname.match(/^\/api\/admin\/payments\/([0-9a-f-]+)\/status$/i);
    if (paymentStatusMatch && request.method === 'PATCH') {
      if (!requireAdmin(request, response)) return;
      const data = await readJson(request, 16000);
      if (!['Paid', 'Rejected'].includes(data.status)) return sendJson(response, 400, { error: 'Допустимый статус: Paid или Rejected.' });
      const payment = queries.paymentById.get(paymentStatusMatch[1]);
      if (!payment) return sendJson(response, 404, { error: 'Платёж не найден.' });
      if (payment.status === data.status) return sendJson(response, 200, { paymentId: payment.id, status: payment.status, repeated: true });
      if (payment.status !== 'Pending') return sendJson(response, 409, { error: 'Рассмотренный платёж нельзя изменить.' });
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('UPDATE payments SET status = ?, reviewed_at = ? WHERE id = ? AND status = ?').run(data.status, new Date().toISOString(), payment.id, 'Pending');
        if (data.status === 'Paid') db.prepare(`INSERT OR IGNORE INTO course_access(user_id, course_id, payment_id, granted_at)
          VALUES (?, 'hair-styling', ?, ?)`).run(payment.user_id, payment.id, new Date().toISOString());
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      return sendJson(response, 200, { paymentId: payment.id, status: data.status });
    }

    const screenshotMatch = url.pathname.match(/^\/api\/admin\/payments\/([0-9a-f-]+)\/screenshot$/i);
    if (screenshotMatch && request.method === 'GET') {
      if (!requireAdmin(request, response)) return;
      const payment = queries.paymentById.get(screenshotMatch[1]);
      if (!payment) return sendJson(response, 404, { error: 'Платёж не найден.' });
      if (payment.screenshot_data) {
        response.writeHead(200, { 'Content-Type': payment.screenshot_mime || 'application/octet-stream', 'Content-Length': payment.screenshot_data.length, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
        return response.end(payment.screenshot_data);
      }
      return sendJson(response, 404, { error: 'Скриншот платежа не найден.' });
    }

    if (serveStatic(url.pathname, response)) return;
    if (url.pathname.startsWith('/api/')) return sendJson(response, 404, { error: 'API route not found.' });
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  } catch (error) {
    if (!response.headersSent) sendJson(response, error.status || 500, { error: error.status ? error.message : 'Внутренняя ошибка сервера.' });
    else response.destroy(error);
  }
});

server.listen(config.port, process.env.HOST || '0.0.0.0', () => console.log(`Silk Styling: http://localhost:${config.port}`));
