import test from 'node:test';
import assert from 'node:assert/strict';
import { withStatementTimeout } from './statement-timeout.js';

test('timeout is transaction scoped, committed, and released', async () => {
  const calls: string[] = [];
  const client = {query: async (sql:string)=>{calls.push(sql);return 42;},release:()=>calls.push('release')};
  const value = await withStatementTimeout({connect:async()=>client},500,c=>c.query('SELECT 1'));
  assert.equal(value,42);
  assert.deepEqual(calls,['BEGIN','SET LOCAL statement_timeout = 500','SELECT 1','COMMIT','release']);
});
test('query failure rolls back before returning connection to pool', async () => {
  const calls: string[] = [];
  const client = {query: async (sql:string)=>{calls.push(sql);},release:()=>calls.push('release')};
  await assert.rejects(withStatementTimeout({connect:async()=>client},500,async()=>{throw Error('timeout');}),/timeout/);
  assert.deepEqual(calls,['BEGIN','SET LOCAL statement_timeout = 500','ROLLBACK','release']);
});
