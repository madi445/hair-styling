const fs = require('node:fs');
const path = require('node:path');
const config = require('../frontend/site-config');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
fs.mkdirSync(path.join(output, 'frontend'), { recursive: true });
fs.mkdirSync(path.join(output, 'assets'), { recursive: true });
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const buy = config.whatsapp + '?text=' + encodeURIComponent(config.purchaseMessage);
const question = config.whatsapp + '?text=' + encodeURIComponent(config.questionMessage);
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  .replace(/(data-buy href=")[^"]*"/g, (_, prefix) => prefix + escape(buy) + '"')
  .replace(/(data-question href=")[^"]*"/g, (_, prefix) => prefix + escape(question) + '"')
  .replace(/(data-price>)[^<]*/g, (_, prefix) => prefix + config.price.toLocaleString('ru-KZ') + ' ₸');
html = html.replace(/(<span class="old-price" id="oldPrice">)[^<]*/, (_, prefix) => prefix + (config.promotionActive && config.price < config.regularPrice ? config.regularPrice.toLocaleString('ru-KZ') + ' ₸' : ''));
if (config.receiptUrl) html = html.replace(/(data-receipt href=")[^"]*"/g, (_, prefix) => prefix + escape(config.receiptUrl) + '"');
const modules = config.modules.map((module, index) => '<article class="module"><span class="module-number">0' + (index + 1) + '</span><h3>' + escape(module.title) + '</h3><p>' + escape(module.text) + '</p></article>').join('');
html = html.replace('<div class="modules" id="modules"></div>', '<div class="modules" id="modules">' + modules + '</div>');
if (config.courseUrl) html = html.replace('data-course hidden href="/course/my-course/"', 'data-course href="' + escape(config.courseUrl) + '"');
else html = html.replace(/<a[^>]*data-course[^>]*>.*?<\/a>/g, '');
fs.writeFileSync(path.join(output, 'index.html'), html);
for (const file of ['frontend/site-config.js', 'frontend/landing.js', 'frontend/landing.css', 'assets/favicon.svg']) fs.copyFileSync(path.join(root, file), path.join(output, file));
const redirects = ['/course/payment/', '/course/payment', '/course/payment/success/', '/course/payment/pending/', '/frontend/payment.html', '/frontend/success.html', '/frontend/pending.html'].map(route => route + ' ' + buy + ' 302');
redirects.push('/course/ /index.html 200');
if (config.receiptUrl) redirects.push('/course/confirm-payment/ ' + config.receiptUrl + ' 302');
if (config.courseUrl) redirects.push('/course/my-course/ ' + config.courseUrl + ' 302');
fs.writeFileSync(path.join(output, '_redirects'), redirects.join('\n') + '\n');
fs.writeFileSync(path.join(output, '_headers'), '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: DENY\n  Content-Security-Policy: default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\'; object-src \'none\'; base-uri \'self\'; frame-ancestors \'none\'\n  Cache-Control: public, max-age=0, must-revalidate\n');
console.log('Netlify site prepared: dist/ (public files only)');
