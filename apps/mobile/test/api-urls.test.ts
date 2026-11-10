import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveApiUrls } from '../src/core/config/apiUrls';
test('gateway resolve HTTP e WS na mesma origem HTTPS privada', () => {
  assert.deepEqual(resolveApiUrls('/backend', 'https://space-8084.app.github.dev'), {
    apiUrl: 'https://space-8084.app.github.dev/backend', wsUrl: 'wss://space-8084.app.github.dev/backend/ws',
  });
});
test('emulador mantém endereço absoluto e remove barra final', () => {
  assert.deepEqual(resolveApiUrls('http://10.0.2.2:3000/'), { apiUrl: 'http://10.0.2.2:3000', wsUrl: 'ws://10.0.2.2:3000/ws' });
});
