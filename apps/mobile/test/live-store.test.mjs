import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// Usa stores e repositórios reais; substitui apenas plataforma/storage, HTTP e WS externos.
const built = await build({
  stdin: { contents: `export { useLiveChargingStore } from './src/presentation/state/useLiveChargingStore'; export { useAuthStore } from './src/presentation/state/useAuthStore'; export { User } from './src/domain/entities/User';`, resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'ts' },
  bundle: true, platform: 'node', format: 'cjs', write: false,
  plugins: [{ name: 'test-platform', setup(b) {
    b.onResolve({ filter: /^@\/core\/config\/env$/ }, () => ({ path: 'env', namespace: 'test' }));
    b.onResolve({ filter: /^@react-native-async-storage\/async-storage$/ }, () => ({ path: 'storage', namespace: 'test' }));
    b.onLoad({ filter: /.*/, namespace: 'test' }, args => ({ contents: args.path === 'env'
      ? `export const env = { apiUrl: 'http://backend', wsUrl: 'ws://backend/ws' };`
      : `export default { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} };` }));
  } }],
});
const module = { exports: {} };
new Function('require', 'module', 'exports', built.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { useLiveChargingStore: live, useAuthStore: auth, User } = module.exports;

function setup(t, { demo = false, failStart = false } = {}) {
  live.getState().reset();
  auth.setState({ user: demo ? User.offlineDemo() : new User({ sub: 'driver', name: 'Driver', roles: ['driver'], token: 'signed-token' }) });
  const calls = [], sockets = [];
  const oldWs = globalThis.WebSocket;
  globalThis.WebSocket = class {
    constructor() { sockets.push(this); }
    receive(msg) { this.onmessage?.({ data: JSON.stringify(msg) }); }
    close() { if (this.closed) return; this.closed = true; this.onclose?.(); }
  };
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, token: options.headers.Authorization });
    if (url.endsWith('/start') && failStart) return new Response('{"title":"Unavailable"}', { status: 503 });
    return new Response(JSON.stringify(url.endsWith('/reservations') ? { id: 'reservation-1' } : url.endsWith('/dashboard') ? { invoices: [] } : {}));
  });
  t.mock.timers.enable({ apis: ['setInterval'] });
  t.after(() => { live.getState().reset(); auth.setState({ user: null }); globalThis.WebSocket = oldWs; });
  return { calls, sockets };
}

test('sessão real aguarda hello, usa Bearer e não inventa energia quando WS fica sem leituras', async t => {
  const { calls, sockets } = setup(t);
  const starting = live.getState().startCharging('API Station', 'charger-1', 150, 2.19);
  assert.equal(calls.length, 0);
  sockets[0].receive({ type: 'hello' });
  await starting;
  assert.equal(live.getState().reservationId, 'reservation-1');
  assert.ok(calls.every(c => c.token === 'Bearer signed-token'));
  t.mock.timers.tick(10000);
  assert.equal(live.getState().energyKwh, 0);
  assert.equal(live.getState().lastInvoice, null);
  sockets[0].receive({ type: 'session-started', chargerId: 'charger-1', reservationId: 'reservation-1', sessionId: 'session-1' });
  sockets[0].receive({ type: 'meter', chargerId: 'charger-1', sessionId: 'other', energyKwh: 99 });
  assert.equal(live.getState().energyKwh, 0);
  sockets[0].receive({ type: 'meter', chargerId: 'charger-1', sessionId: 'session-1', energyKwh: 2.5, powerKw: 140 });
  assert.equal(live.getState().energyKwh, 2.5);
  sockets[0].receive({ type: 'session-ended', chargerId: 'charger-1', sessionId: 'session-1' });
  assert.equal(live.getState().pendingInvoice, true); assert.equal(live.getState().lastInvoice, null);
  sockets[0].receive({ type: 'invoice', chargerId: 'charger-1', sessionId: 'session-1', energyKwh: 2.5, pricePerKwh: 2.19, amount: 5.48 });
  assert.equal(live.getState().lastInvoice.source, 'BILLING');
  assert.equal(live.getState().lastInvoice.totalAmount, 5.48);
  assert.equal(live.getState().pendingInvoice, false);
  await new Promise(setImmediate);
});
test('falha no start não produz recarga nem fatura local e compensa a reserva', async t => {
  const { calls, sockets } = setup(t, { failStart: true });
  const starting = live.getState().startCharging('API Station', 'charger-1', 150, 2.19);
  sockets[0].receive({ type: 'hello' }); await starting;
  assert.equal(live.getState().isCharging, false); assert.equal(live.getState().lastInvoice, null);
  assert.ok(live.getState().error); assert.ok(calls.some(c => c.url.endsWith('/cancel')));
});
test('falha ao conectar WS não cria reserva nem entra em demonstração', async t => {
  const { calls, sockets } = setup(t);
  const starting = live.getState().startCharging('API Station', 'charger-1', 150, 2.19);
  sockets[0].close(); await starting;
  assert.equal(calls.length, 0); assert.equal(live.getState().isCharging, false);
  assert.equal(live.getState().lastInvoice, null); assert.ok(live.getState().error);
});
test('demonstração explícita calcula resumo identificado e não chama serviços', async t => {
  const { calls, sockets } = setup(t, { demo: true });
  await live.getState().startCharging('Demo', 'demo-1', 150, 2.19);
  t.mock.timers.tick(60000);
  assert.equal(live.getState().lastInvoice.source, 'DEMO');
  assert.equal(live.getState().lastInvoice.totalAmount, 105.12);
  assert.equal(calls.length, 0); assert.equal(sockets.length, 0);
});
