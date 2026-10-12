const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createServer } = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const project = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'silk-flow-'));
const databasePath = path.join(temp, 'payments.sqlite');
const videoPath = path.join(temp, 'lesson.mp4');
let port;
let serverProcess;
let baseUrl;

function unusedPort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port: selected } = probe.address();
      probe.close((error) => error ? reject(error) : resolve(selected));
    });
  });
}

async function waitUntilReady() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (serverProcess.exitCode !== null) throw new Error('Backend exited before becoming ready.');
    try {
      const response = await fetch(`${baseUrl}/api/config`);
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Backend did not become ready.');
}

function cookieFrom(response) {
  const cookie = response.headers.get('set-cookie');
  assert.ok(cookie, 'response must establish a session');
  return cookie.split(';', 1)[0];
}

before(async () => {
  fs.writeFileSync(videoPath, Buffer.from('test-video-bytes'));
  port = await unusedPort();
  baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = spawn(process.execPath, [path.join(project, 'backend', 'server.js')], {
    cwd: project,
    env: { ...process.env, PORT: String(port), DATABASE_PATH: databasePath, VIDEO_PATH: videoPath, ADMIN_PASSWORD: 'integration-test-admin-password', PROMO_START_AT: new Date().toISOString() },
    stdio: 'ignore'
  });
  await waitUntilReady();
}, { timeout: 15000 });

after(async () => {
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill();
    await new Promise((resolve) => serverProcess.once('exit', resolve));
  }
  fs.rmSync(temp, { recursive: true, force: true });
});

test('Kaspi payment stays pending until admin approval and only paid accounts can stream lessons', async () => {
  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, 'ok');
  const configResponse = await fetch(`${baseUrl}/api/config`);
  const config = await configResponse.json();
  assert.equal(config.price, 30000);
  const purchase = new URL(config.purchaseUrl);
  assert.equal(purchase.origin + purchase.pathname, 'https://wa.me/77479706963');
  assert.equal(purchase.searchParams.get('text'), config.purchaseMessage);
  for (const route of ['/course/payment/', '/course/payment', '/course/payment/success/', '/course/payment/pending/', '/frontend/payment.html']) {
    const redirect = await fetch(baseUrl + route, { redirect: 'manual' });
    assert.equal(redirect.status, 303);
    assert.equal(redirect.headers.get('location'), config.purchaseUrl);
  }
  const landing = await (await fetch(baseUrl + '/')).text();
  assert.equal((landing.match(/data-buy href="https:\/\/wa.me\//g) || []).length, 2);
  assert.ok(!landing.includes('href="/course/payment/"'));
  assert.ok(!landing.includes('id="timer"'));
  assert.ok(!landing.includes('class="testimonial"'));
  assert.ok(landing.includes('/frontend/site-config.js'));
  const sharedConfig = await fetch(baseUrl + '/frontend/site-config.js');
  assert.equal(sharedConfig.status, 200);


  assert.equal(config.promoActive, false);
  assert.equal(config.regularPrice, 50000);
  assert.equal(config.qrAvailable, true);
  const qrResponse = await fetch(`${baseUrl}${config.kaspiQrUrl}`);
  assert.equal(qrResponse.status, 200);
  assert.equal(qrResponse.headers.get('content-type'), 'image/jpeg');
  assert.ok((await qrResponse.arrayBuffer()).byteLength > 1000);

  assert.equal((await fetch(`${baseUrl}/videos/IMG_1016.MOV`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/lessons/lesson-1/video`, { headers: { Range: 'bytes=0-3' } })).status, 401);

  const paymentData = {
    name: 'Тестовый покупатель', phone: '8 (700) 123-45-67', email: 'buyer@example.com', password: 'course-password-123',
    amount: 30000, paidAt: new Date().toISOString(), transactionId: 'KASPI-TEST-001',
    screenshotData: 'data:image/png;base64,iVBORw0KGgo=', rulesAccepted: true
  };
  const submit = () => fetch(`${baseUrl}/api/payments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'test-buyer-payment-001' }, body: JSON.stringify(paymentData)
  });
  const paymentResponse = await submit();
  assert.equal(paymentResponse.status, 201);
  const payment = await paymentResponse.json();
  const buyerCookie = cookieFrom(paymentResponse);
  assert.equal(payment.status, 'Pending');
  const auditDb = new DatabaseSync(databasePath);
  const savedConsent = auditDb.prepare('SELECT rules_accepted, rules_accepted_at FROM payments WHERE id = ?').get(payment.paymentId);
  assert.equal(savedConsent.rules_accepted, 1);
  assert.ok(savedConsent.rules_accepted_at);
  auditDb.close();
  assert.equal((await fetch(`${baseUrl}/api/my-course`, { headers: { Cookie: buyerCookie } })).status, 403);
  assert.equal((await fetch(`${baseUrl}/api/lessons/lesson-1/video`, { headers: { Cookie: buyerCookie, Range: 'bytes=0-3' } })).status, 403);

  const repeated = await submit();
  assert.equal(repeated.status, 200);
  assert.equal((await repeated.json()).paymentId, payment.paymentId);
  const duplicatedProof = await fetch(`${baseUrl}/api/payments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'different-key-same-proof' },
    body: JSON.stringify({ ...paymentData, transactionId: 'DIFFERENT-TRANSACTION-ID' })
  });
  assert.equal(duplicatedProof.status, 409);

  const adminLogin = await fetch(`${baseUrl}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'integration-test-admin-password' }) });
  assert.equal(adminLogin.status, 200);
  const adminCookie = cookieFrom(adminLogin);
  const listing = await (await fetch(`${baseUrl}/api/admin/payments`, { headers: { Cookie: adminCookie } })).json();
  assert.equal(listing.payments.length, 1);
  const proofResponse = await fetch(`${baseUrl}${listing.payments[0].screenshotUrl}`, { headers: { Cookie: adminCookie } });
  assert.equal(proofResponse.status, 200);
  assert.equal(proofResponse.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await proofResponse.arrayBuffer()), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

  const approve = () => fetch(`${baseUrl}/api/admin/payments/${payment.paymentId}/status`, {
    method: 'PATCH', headers: { Cookie: adminCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'Paid' })
  });
  assert.equal((await approve()).status, 200);
  assert.equal((await approve()).status, 200);
  const courseResponse = await fetch(`${baseUrl}/api/my-course`, { headers: { Cookie: buyerCookie } });
  assert.equal(courseResponse.status, 200);
  assert.equal((await courseResponse.json()).lessons.length, 1);
  const logout = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: buyerCookie } });
  assert.equal(logout.status, 200);
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: paymentData.email, password: paymentData.password })
  });
  assert.equal(login.status, 200);
  const loggedInCookie = cookieFrom(login);
  assert.equal((await fetch(`${baseUrl}/api/my-course`, { headers: { Cookie: loggedInCookie } })).status, 200);
  const stream = await fetch(`${baseUrl}/api/lessons/lesson-1/video`, { headers: { Cookie: loggedInCookie, Range: 'bytes=0-3' } });
  assert.equal(stream.status, 206);
  assert.equal(await stream.text(), 'test');

  const rejectedData = { ...paymentData, name: 'Второй покупатель', email: 'rejected@example.com', transactionId: 'KASPI-TEST-002', screenshotData: 'data:image/png;base64,iVBORw0KGgoBAA==' };
  const rejectedResponse = await fetch(`${baseUrl}/api/payments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'test-rejected-payment-002' }, body: JSON.stringify(rejectedData)
  });
  assert.equal(rejectedResponse.status, 201);
  const rejectedPayment = await rejectedResponse.json();
  const rejectedCookie = cookieFrom(rejectedResponse);
  const rejectResponse = await fetch(`${baseUrl}/api/admin/payments/${rejectedPayment.paymentId}/status`, {
    method: 'PATCH', headers: { Cookie: adminCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'Rejected' })
  });
  assert.equal(rejectResponse.status, 200);
  assert.equal((await fetch(`${baseUrl}/api/my-course`, { headers: { Cookie: rejectedCookie } })).status, 403);
  assert.equal((await fetch(`${baseUrl}/api/lessons/lesson-1/video`, { headers: { Cookie: rejectedCookie } })).status, 403);
});
