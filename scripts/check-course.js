// Browser checks against the static Netlify artifact, without a Node API.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const config = require('../frontend/site-config');
const root = path.resolve(__dirname, '..');
const browser = [process.env.BROWSER_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean).find(file => fs.existsSync(file));
if (!browser) throw new Error('Set BROWSER_PATH to an installed Chrome/Chromium browser.');
if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error('Run npm run build:site first.');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'silk-mobile-'));
const server=http.createServer();
let backendChild;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let child, socket;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const backendPort=server.address().port;
  await new Promise(resolve=>server.close(resolve));
  backendChild=spawn(process.execPath,[path.join(root,'backend/server.js')],{cwd:root,env:{...process.env,PORT:String(backendPort),HOST:'127.0.0.1',DATABASE_PATH:path.join(temp,'qa.sqlite'),VIDEO_PATH:path.join(root,'videos/lesson-1.mp4'),ADMIN_PASSWORD:'local-browser-qa-password',NODE_ENV:'development'},stdio:'ignore',windowsHide:true});
  for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await delay(50);}
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
    const result = await send('Runtime.evaluate', { expression, userGesture:true, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: base + '/' });
  for (let i = 0; i < 100; i++) { if (await evaluate("document.readyState === 'complete' && !!globalThis.SILK_CONFIG")) break; await delay(50); }

  async function navigate(route,condition){
    await send('Page.navigate',{url:base+route});
    for(let i=0;i<100;i++){if(await evaluate(condition))return;await delay(100);}throw Error('Page not ready: '+route);
  }
  await navigate('/course/my-course/',"document.querySelector('#loginForm') && !document.querySelector('#loginForm').hidden");
  await evaluate("document.querySelector('#email').value='offline-qa@example.com';document.querySelector('#password').value='offline-qa-password';window.fetch=()=>Promise.reject(new TypeError('Offline'));document.querySelector('#loginForm').requestSubmit()");await delay(200);
  assert(await evaluate("document.querySelector('#error').textContent.includes('подключиться') && !document.querySelector('#loginForm button').disabled && document.querySelector('#email').value==='offline-qa@example.com'"));
  await navigate('/admin/payments/',"!!document.querySelector('#adminLogin') && document.readyState==='complete'");await delay(200);
  await evaluate("document.querySelector('#adminPassword').value='offline-qa-password';window.fetch=()=>Promise.reject(new TypeError('Offline'));document.querySelector('#adminLogin').requestSubmit()");await delay(200);
  assert(await evaluate("document.querySelector('#adminError').textContent.includes('подключиться') && !document.querySelector('#adminLogin button').disabled"));
  console.log('PASS network errors: user/admin login keep fields, unlock submit, show readable messages');
  for(const width of [320,375,390,430,768,1024,1440]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:812,deviceScaleFactor:1,mobile:width<768});
    await navigate('/course/confirm-payment/',"!!document.querySelector('#receiptForm') && document.readyState==='complete'");
    assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Receipt overflow at '+width);
    assert.equal(await evaluate("document.querySelector('[name=amount]').value"),'30000');
    console.log('PASS receipt form layout '+width+'px');
  }
  const payload={name:'Local Browser QA',phone:'',email:'browser-qa@example.com',password:'local-qa-student-password',amount:30000,paidAt:new Date().toISOString(),transactionId:'LOCAL-BROWSER-QA',screenshotData:'data:image/png;base64,'+fs.readFileSync(path.join(root,'assets/preview.png')).toString('base64'),rulesAccepted:true};
  const paymentResponse=await fetch(base+'/api/payments',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'local-browser-qa-key'},body:JSON.stringify(payload)});
  assert.equal(paymentResponse.status,201);const payment=await paymentResponse.json();
  const cookie=paymentResponse.headers.get('set-cookie').split(';')[0],token=cookie.slice(cookie.indexOf('=')+1);
  await send('Network.setCookie',{name:'silk_session',value:token,url:base+'/',httpOnly:true,sameSite:'Lax'});
  await navigate('/course/my-course/',"document.querySelector('#state')?.textContent.includes('подтверждения оплаты')");
  assert.equal(await evaluate("document.querySelectorAll('.lesson').length"),0);
  const adminResponse=await fetch(base+'/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'local-browser-qa-password'})});assert.equal(adminResponse.status,200);
  const adminCookie=adminResponse.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(base+`/api/admin/payments/${payment.paymentId}/status`,{method:'PATCH',headers:{Cookie:adminCookie,'Content-Type':'application/json'},body:JSON.stringify({status:'Paid'})})).status,200);
  await navigate('/course/my-course/',"document.querySelectorAll('.lesson').length===1");
  for(const width of [320,375,390,430,768,1024,1440]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:812,deviceScaleFactor:1,mobile:width<768});
    assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Account overflow at '+width);
  }
  await navigate('/course/lesson/lesson-1/',"document.querySelector('#lessonVideo')?.readyState>=2");
  const metadata=await evaluate("(()=>{const v=document.querySelector('#lessonVideo');return {duration:v.duration,width:v.videoWidth,height:v.videoHeight,error:v.error?.message}})()");
  assert(metadata.duration>884 && metadata.duration<887,JSON.stringify(metadata));assert.equal(metadata.width,1078);assert.equal(metadata.height,1920);assert(!metadata.error);
  await evaluate("(async()=>{const v=document.querySelector('#lessonVideo');v.currentTime=10;await v.play();return true})()");await delay(1200);
  assert(await evaluate("!document.querySelector('#lessonVideo').paused && document.querySelector('#lessonVideo').currentTime>=10"));
  await evaluate("document.querySelector('#lessonVideo').pause()");assert(await evaluate("document.querySelector('#lessonVideo').paused"));
  for(const width of [320,375,390,430,768,1024,1440]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:812,deviceScaleFactor:1,mobile:width<768});
    assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Lesson overflow at '+width);
    const bounds=await evaluate("(()=>{const v=document.querySelector('#lessonVideo').getBoundingClientRect();return {left:v.left,right:v.right,width:innerWidth}})()");assert(bounds.left>=0 && bounds.right<=bounds.width,'Video clipping at '+width);
  }
  console.log('PASS lesson/video layout at all seven widths');
  const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(os.tmpdir(),'silk-course-video.png'),Buffer.from(screenshot.data,'base64'));
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS real MP4: '+JSON.stringify(metadata));
  console.log('PASS account: Pending denied, Paid opens lesson, real video plays/seeks/pauses, no JS exceptions');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  socket?.close();
  if (child && child.exitCode === null) { child.kill(); await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(2000)]); }
  if(backendChild&&backendChild.exitCode===null){backendChild.kill();await new Promise(resolve=>backendChild.once('exit',resolve));}
  if(server.listening){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  await delay(300);
  try { fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { console.error('Browser profile cleanup pending: ' + temp); }
});
