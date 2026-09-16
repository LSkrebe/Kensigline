import test from 'node:test';
import assert from 'node:assert/strict';
import { createWebhookDeliveryProcessor } from './webhook-delivery.js';

test('failed payment delivery can retry successfully', async () => {
  const process = createWebhookDeliveryProcessor();
  await assert.rejects(process('delivery', async () => { throw Error('database unavailable'); }));
  let calls = 0;
  assert.equal(await process('delivery', async () => { calls++; }), false);
  assert.equal(await process('delivery', async () => { calls++; }), true);
  assert.equal(calls, 1);
});
test('concurrent duplicates wait for successful processing', async () => {
  const process = createWebhookDeliveryProcessor();
  let release!: () => void;
  let calls = 0;
  const work = new Promise<void>(r => { release = r; });
  const a = process('delivery', async () => { calls++; await work; });
  const b = process('delivery', async () => { calls++; });
  release();
  assert.deepEqual(await Promise.all([a,b]), [false,true]);
  assert.equal(calls,1);
});
test('failed concurrent duplicates all fail and stay retryable', async () => {
  const process = createWebhookDeliveryProcessor();
  const a = process('delivery', async () => { throw Error('failure'); });
  const b = process('delivery', async () => {});
  assert.deepEqual((await Promise.allSettled([a,b])).map(r=>r.status),['rejected','rejected']);
  assert.equal(await process('delivery', async () => {}), false);
});
