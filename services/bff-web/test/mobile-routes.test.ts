import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import Fastify from 'fastify';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { registerMobileRoutes } from '../src/mobile-routes.js';
import { Downstream } from '../src/downstream.js';

async function setup(t: test.TestContext) {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(publicKey), kid: 'test', alg: 'RS256', use: 'sig' };
  let token = ''; let calls = 0;
  const catalog = [{ id: 'real-1', name: 'API Savassi', address: 'Savassi', chargers: [
    { chargerId: 'c1', connector: 'CCS2', status: 'AVAILABLE', powerKw: 60 },
  ] }, { id: 'real-2', name: 'API Pampulha', chargers: [
    { chargerId: 'c2', connector: 'TYPE2', status: 'CHARGING', powerKw: 22 },
  ] }];
  const server = http.createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/certs') return res.end(JSON.stringify({ keys: [jwk] }));
    if (req.url === '/token') {
      let body = ''; for await (const chunk of req) body += chunk;
      const params = new URLSearchParams(body);
      assert.equal(params.get('client_id'), 'volthub-web'); assert.equal(params.get('grant_type'), 'password');
      if (params.get('password') === 'errada') { res.statusCode = 400; return res.end(JSON.stringify({ error: 'invalid_grant' })); }
      if (params.get('password') === 'sem-keycloak') { res.statusCode = 503; return res.end('{}'); }
      return res.end(JSON.stringify({ access_token: token, expires_in: 900 }));
    }
    if (req.url === '/v1/stations') {
      calls++;
      if (req.headers.authorization !== `Bearer ${token}`) { res.statusCode = 401; return res.end('{}'); }
      return res.end(JSON.stringify(catalog));
    }
    res.statusCode = 404; res.end('{}');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
  token = await new SignJWT({ name: 'Motorista Teste', realm_access: { roles: ['driver'] } })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' }).setSubject('driver-1').setIssuer(base).setAudience('bff-web').setExpirationTime('5m').sign(privateKey);
  const app = Fastify();
  await registerMobileRoutes(app, { oidc: { issuer: base, jwksUri: base + '/certs', tokenUri: base + '/token', audience: 'bff-web', clientId: 'volthub-web' }, corsOrigins: ['https://test-8084.app.github.dev'], stations: new Downstream('catalog', base) });
  t.after(async () => { await app.close(); await new Promise<void>(resolve => server.close(() => resolve())); });
  return { app, token, calls: () => calls };
}

test('preflight permite origem configurada e não autoriza origem externa', async t => {
  const { app } = await setup(t);
  const res = await app.inject({ method: 'OPTIONS', url: '/api/v1/auth/login', headers: {
    origin: 'https://test-8084.app.github.dev', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type,authorization',
  } });
  assert.equal(res.statusCode, 204);
  assert.equal(res.headers['access-control-allow-origin'], 'https://test-8084.app.github.dev');
  assert.match(String(res.headers['access-control-allow-headers']), /Authorization/i);
  const blocked = await app.inject({ method: 'OPTIONS', url: '/api/v1/auth/login', headers: { origin: 'https://other.example', 'access-control-request-method': 'POST' } });
  assert.equal(blocked.headers['access-control-allow-origin'], undefined);
});
test('login valida assinatura do token e devolve identidade sem cache', async t => {
  const { app, token } = await setup(t);
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'driver@test.local', password: 'correta' } });
  assert.equal(res.statusCode, 200); assert.equal(res.json().accessToken, token);
  assert.deepEqual(res.json().user, { sub: 'driver-1', name: 'Motorista Teste', roles: ['driver'] });
  assert.equal(res.headers['cache-control'], 'no-store'); assert.ok(!res.body.includes('correta'));
});
test('login distingue credenciais inválidas, corpo inválido e serviço indisponível', async t => {
  const { app } = await setup(t);
  for (const [password, expected] of [['errada', 401], ['sem-keycloak', 502]] as const) {
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'driver@test.local', password } })).statusCode, expected);
  }
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: {} })).statusCode, 400);
});
test('lista e detalhe exigem JWT e encaminham Bearer ao catálogo HTTP', async t => {
  const { app, token, calls } = await setup(t);
  assert.equal((await app.inject('/api/v1/stations')).statusCode, 401);
  assert.equal((await app.inject({ url: '/api/v1/stations/real-1', headers: { authorization: 'Bearer falso' } })).statusCode, 401);
  assert.equal(calls(), 0);
  const headers = { authorization: `Bearer ${token}` };
  const list = await app.inject({ url: '/api/v1/stations', headers });
  assert.equal(list.statusCode, 200); assert.equal(list.json().length, 2);
  const detail = await app.inject({ url: '/api/v1/stations/real-1', headers });
  assert.equal(detail.statusCode, 200); assert.equal(detail.json().name, 'API Savassi');
  assert.equal((await app.inject({ url: '/api/v1/stations/inexistente', headers })).statusCode, 404);
});
test('filtros combinados usam catálogo remoto e preservam resultado vazio', async t => {
  const { app, token } = await setup(t);
  const headers = { authorization: `Bearer ${token}` };
  const found = await app.inject({ url: '/api/v1/stations?status=AVAILABLE&connector=CCS2&fastOnly=true&q=savassi', headers });
  assert.deepEqual(found.json().map((s: { id: string }) => s.id), ['real-1']);
  const empty = await app.inject({ url: '/api/v1/stations?status=AVAILABLE&connector=TYPE2', headers });
  assert.equal(empty.statusCode, 200); assert.deepEqual(empty.json(), []);
});
