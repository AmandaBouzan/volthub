import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { createDevGateway } from '../scripts/dev-gateway.mjs';

async function listen(server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
async function close(server) {
  server.closeAllConnections?.();
  await new Promise(resolve => server.close(resolve));
}

test('gateway roteia página ao Expo e POST autenticado ao BFF sem cookie do GitHub', async t => {
  const backend = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ path: req.url, method: req.method, token: req.headers.authorization, cookie: req.headers.cookie ?? null, body }));
  });
  const expo = http.createServer((_req, res) => res.end('Expo'));
  const apiTarget = await listen(backend), expoTarget = await listen(expo);
  const gateway = createDevGateway({ apiTarget, expoTarget });
  const origin = await listen(gateway);
  t.after(async () => { await close(gateway); await close(backend); await close(expo); });
  assert.equal(await (await fetch(origin + '/login')).text(), 'Expo');
  const result = await fetch(origin + '/backend/api/v1/auth/login', { method: 'POST', headers: { authorization: 'Bearer test', cookie: 'github=private', 'content-type': 'application/json' }, body: '{"email":"demo"}' });
  assert.deepEqual(await result.json(), { path: '/api/v1/auth/login', method: 'POST', token: 'Bearer test', cookie: null, body: '{"email":"demo"}' });
});

test('gateway encaminha WebSocket com query token, sem requisição HTTP anterior', async t => {
  const backend = http.createServer();
  const wss = new WebSocketServer({ server: backend });
  wss.on('connection', (socket, req) => socket.send(JSON.stringify({ path: req.url })));
  const apiTarget = await listen(backend);
  const gateway = createDevGateway({ apiTarget });
  const origin = await listen(gateway);
  const client = new WebSocket(origin.replace('http:', 'ws:') + '/backend/ws?access_token=test');
  t.after(async () => { client.terminate(); for (const ws of wss.clients) ws.terminate(); wss.close(); await close(gateway); await close(backend); });
  const message = await new Promise((resolve, reject) => {
    client.once('message', data => resolve(JSON.parse(data.toString())));
    client.once('error', reject);
  });
  assert.deepEqual(message, { path: '/ws?access_token=test' });
});
