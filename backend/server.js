const http = require('http');
const fs = require('fs');
const path = require('path');
const { publicConfig, paymentUrl, videos, port } = require('./config');

const root = path.resolve(__dirname, '..');
const orders = new Map();

function sendJson(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  response.end(JSON.stringify(payload));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 10000) request.destroy(new Error('Request too large'));
    });
    request.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch (error) { reject(error); }
    });
    request.on('error', reject);
  });
}

function createOrder(data) {
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  const contact = typeof data.contact === 'string' ? data.contact.trim() : '';
  if (!name || !contact || data.rulesAccepted !== true) return null;
  const order = {
    id: `silk-${Date.now()}`,
    name,
    contact,
    rulesAccepted: true,
    createdAt: new Date().toISOString(),
    paymentUrl,
    videoUrl: videos[0].videoUrl
  };
  orders.set(order.id, order);
  return order;
}

function serveStatic(request, response) {
  const requestedPath = request.url === '/' ? '/index.html' : request.url.split('?')[0];
  if (requestedPath.startsWith('/backend/')) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  const filePath = path.resolve(root, `.${requestedPath}`);
  if (!filePath.startsWith(root) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  const contentTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.MOV': 'video/quicktime', '.mov': 'video/quicktime' };
  response.writeHead(200, { 'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(response);
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    return response.end();
  }
  if (request.method === 'GET' && request.url === '/api/config') return sendJson(response, 200, publicConfig);
  if (request.method === 'POST' && request.url === '/api/orders') {
    try {
      const order = createOrder(await readJson(request));
      if (!order) return sendJson(response, 400, { error: 'Заполните имя, телефон и подтвердите правила.' });
      return sendJson(response, 201, { orderId: order.id, paymentUrl: order.paymentUrl, videoUrl: order.videoUrl });
    } catch (error) {
      return sendJson(response, 400, { error: 'Некорректные данные заказа.' });
    }
  }
  return serveStatic(request, response);
});

server.listen(port, () => console.log(`Silk Styling frontend/backend: http://localhost:${port}`));
