// Browser checks against the static Netlify artifact, without a Node API.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const config = require('../frontend/site-config');
const root = path.resolve(__dirname, '..', 'dist');
const browser = [process.env.BROWSER_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean).find(file => fs.existsSync(file));
if (!browser) throw new Error('Set BROWSER_PATH to an installed Chrome/Chromium browser.');
if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error('Run npm run build:site first.');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'silk-mobile-'));
const requests = [];
const server = http.createServer((request, response) => {
  requests.push(request.url);
  let relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (relative === '/') relative = '/index.html';
  const file = path.resolve(root, '.' + relative);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end(); return; }
  const types = { '.html':'text/html; charset=utf-8', '.js':'application/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml' };
  response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(response);
});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let child, socket;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  child = spawn(browser, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + path.join(temp, 'profile'), 'about:blank'], { stdio: 'ignore', windowsHide: true });
  let launchError; child.on('error', error => { launchError = error; });
  const activePortFile = path.join(temp, 'profile', 'DevToolsActivePort');
  for (let i = 0; !fs.existsSync(activePortFile) && i < 150; i++) { if (launchError) throw launchError; if (child.exitCode !== null) throw new Error('Browser exited early.'); await delay(100); }
  if (!fs.existsSync(activePortFile)) throw new Error('Browser debug connection timed out.');
  const port = fs.readFileSync(activePortFile, 'utf8').split(/\r?\n/)[0];
  const target = await (await fetch('http://127.0.0.1:' + port + '/json/new?about:blank', { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let id = 0; const pending = new Map(); const errors = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    if (message.id && pending.has(message.id)) { const entry = pending.get(message.id); pending.delete(message.id); message.error ? entry.reject(new Error(message.error.message)) : entry.resolve(message.result); }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(method + ' timed out')); }, 15000);
    pending.set(requestId, { resolve: result => { clearTimeout(timer); resolve(result); }, reject: error => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id: requestId, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: base + '/' });
  for (let i = 0; i < 100; i++) { if (await evaluate("document.readyState === 'complete' && !!globalThis.SILK_CONFIG")) break; await delay(50); }
  const expected = config.whatsapp + '?text=' + encodeURIComponent(config.purchaseMessage);
  for (const width of [320, 375, 390, 430, 768, 1024, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 812, deviceScaleFactor: 1, mobile: width < 768 });
    await evaluate('window.scrollTo(0,0)');
    await delay(150);
    const layout = await evaluate("({ theme: getComputedStyle(document.documentElement).getPropertyValue('--paper').trim(), width: innerWidth, scrollWidth: document.documentElement.scrollWidth, modules: document.querySelectorAll('#modules .module').length, prices: [...document.querySelectorAll('[data-price]')].map(n=>n.textContent), buy: [...document.querySelectorAll('[data-buy]')].map(n=>({url:n.href,height:n.getBoundingClientRect().height,color:getComputedStyle(n).color,background:getComputedStyle(n).backgroundColor})), instagram: [...document.querySelectorAll('a')].filter(n=>n.href.includes('instagram.com')).map(n=>n.href) })");
    assert.ok(layout.scrollWidth <= width, 'Horizontal overflow at ' + width + ': ' + JSON.stringify(layout));
    assert.equal(layout.theme, '#fffaf7', 'Theme stylesheet must parse correctly');
    assert.ok(layout.buy.every(button => button.background !== 'rgba(0, 0, 0, 0)' && button.background !== button.color), 'Purchase buttons must remain visible');
    assert.equal(layout.modules, 5);
    const destinations = await evaluate("({course:document.querySelector('[data-course]')?.href,receipt:document.querySelector('[data-receipt]')?.href})");
    assert.equal(destinations.course, config.courseUrl);
    assert.equal(destinations.receipt, config.receiptUrl);

    assert.equal(layout.buy.length, 2);
    assert.ok(layout.buy.every(button => button.url === expected && button.height >= 48));
    assert.ok(layout.prices.every(price => price.replace(/\s/g, '') === '30000₸'));
    assert.ok(layout.instagram.every(url => url === config.instagram));
    for (const index of [0, 1]) {
      await evaluate("document.querySelectorAll('[data-buy]')[" + index + "].scrollIntoView({block:'center',behavior:'instant'})");
      await delay(120);
      const hit = await evaluate("(()=>{const n=document.querySelectorAll('[data-buy]')[" + index + "];const r=n.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('[data-buy]')===n})()");
      assert.equal(hit, true, 'Purchase button is covered at ' + width);
    }
    if (width === 390 || width === 1440) {
      await evaluate('window.scrollTo(0,0)'); await delay(100);
      const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const output = path.join(os.tmpdir(), 'silk-mobile-' + width + '.png');
      fs.writeFileSync(output, Buffer.from(screenshot.data, 'base64'));
      console.log('Screenshot: ' + output);
    }
    console.log('PASS ' + width + 'px: no overflow, price/program ready, WhatsApp buttons clickable');
  }
  assert.equal(errors.length, 0, errors.join('\n'));
  assert.ok(!requests.some(url => url.startsWith('/api/')), 'Static landing must not need a backend API');
  // Verify the artifact contains no private files.
  const files = [];
  const walk = directory => { for (const entry of fs.readdirSync(directory, { withFileTypes:true })) { const file = path.join(directory, entry.name); entry.isDirectory() ? walk(file) : files.push(path.relative(root, file).replaceAll('\\', '/')); } };
  walk(root);
  assert.deepEqual(files.sort(), ['_headers','_redirects','assets/favicon.svg','frontend/landing.css','frontend/landing.js','frontend/site-config.js','index.html'].sort());
  console.log('PASS static site: no API dependency, no private files or JavaScript exceptions');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  socket?.close();
  if (child && child.exitCode === null) { child.kill(); await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(2000)]); }
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  await delay(300);
  try { fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { console.error('Browser profile cleanup pending: ' + temp); }
});
