import test from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { PgSessionStore } from '../src/infrastructure/db.js';

test('histórico do motorista conserva data de emissão para o app', async () => {
  const pool = { query: async (_sql: string, values: unknown[]) => {
    assert.deepEqual(values, ['driver-1']);
    return { rows: [{ invoice_id: 'invoice-1', session_id: 'session-1', driver_id: 'driver-1', charger_id: 'charger-1', station_id: 'station-1', energy_kwh: '2.500', price_per_kwh: '2.19', amount: '5.48', issued_at: new Date('2026-11-02T18:00:00Z') }] };
  } } as unknown as pg.Pool;
  const [invoice] = await new PgSessionStore(pool).invoicesOf('driver-1');
  assert.equal(invoice.issuedAt, '2026-11-02T18:00:00.000Z');
  assert.equal(invoice.invoiceId, 'invoice-1'); assert.equal(invoice.amount, 5.48);
});
