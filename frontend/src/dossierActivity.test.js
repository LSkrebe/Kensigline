import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDossierActivity, tradeDollars } from './dossierActivity.test-helpers.js'

test('tradeDollars ignores share-count labels', () => {
  assert.equal(tradeDollars({ value: '591K sh' }), 0)
  assert.equal(tradeDollars({ value: '−$4.8M' }), 4.8e6)
  assert.equal(tradeDollars({ amountUsd: 12000 }), 12000)
})

test('sell-only Form 4 window still yields trade filings', () => {
  const rows = [
    {
      type: 'trade',
      layout: 'txnCompany',
      ticker: 'META',
      companyName: 'Meta Platforms',
      code: 'S',
      codeTone: 'sell',
      acquiredDisposed: 'D',
      amountUsd: 5_000_000,
      shares: 20_000,
      sharesAfter: 340_000_000,
      performanceMeta: { price: 250, sharesAfter: 340_000_000, securityTitle: 'Class A Common Stock' },
      value: '−$5.0M',
      ts: '2026-06-01',
      tradeTs: '2026-06-01',
      filedAt: '2026-06-02',
    },
    {
      type: 'trade',
      layout: 'txnCompany',
      ticker: 'META',
      companyName: 'Meta Platforms',
      code: 'S',
      codeTone: 'sell',
      acquiredDisposed: 'D',
      amountUsd: 3_000_000,
      shares: 12_000,
      sharesAfter: 339_988_000,
      performanceMeta: { price: 250, sharesAfter: 339_988_000, securityTitle: 'Class A Common Stock' },
      value: '−$3.0M',
      ts: '2026-06-10',
      tradeTs: '2026-06-10',
      filedAt: '2026-06-11',
    },
  ]
  const activity = buildDossierActivity(rows)
  assert.ok(activity)
  assert.ok(activity.filings.length >= 1, 'expected filings from sells')
  assert.equal(activity.holdings.length, 1)
  assert.equal(activity.holdings[0].ticker, 'META')
  assert.ok(activity.holdings[0].dollars > 1e9)
  assert.notEqual(activity.aum, '—')
  assert.equal(activity.positions, '1')
})

test('buy-then-sell politician-style dollar book still works', () => {
  const rows = [
    {
      type: 'trade',
      layout: 'txnCompany',
      ticker: 'NVDA',
      companyName: 'NVIDIA',
      code: 'P',
      codeTone: 'buy',
      amountUsd: 1_000_000,
      value: '+$1.0M',
      ts: '2025-01-01',
      tradeTs: '2025-01-01',
      filedAt: '2025-01-02',
    },
    {
      type: 'trade',
      layout: 'txnCompany',
      ticker: 'NVDA',
      companyName: 'NVIDIA',
      code: 'S',
      codeTone: 'sell',
      amountUsd: 400_000,
      value: '−$400K',
      ts: '2025-02-01',
      tradeTs: '2025-02-01',
      filedAt: '2025-02-02',
    },
  ]
  const activity = buildDossierActivity(rows)
  assert.equal(activity.holdings.length, 1)
  assert.ok(activity.filings.length >= 1)
  assert.match(activity.aum, /\$/)
})

test('politician dollar books keep holdings when sharesAfter is absent', () => {
  const rows = [
    {
      type: 'trade',
      layout: 'txnCompany',
      ticker: 'NVDA',
      companyName: 'NVIDIA',
      code: 'P',
      codeTone: 'buy',
      amountUsd: 1_000_000,
      value: '+$1.0M',
      ts: '2025-01-01',
      tradeTs: '2025-01-01',
      filedAt: '2025-01-02',
    },
    {
      type: 'trade',
      layout: 'txnCompany',
      ticker: 'NVDA',
      companyName: 'NVIDIA',
      code: 'P',
      codeTone: 'buy',
      amountUsd: 500_000,
      sharesAfter: null,
      value: '+$500K',
      ts: '2025-03-01',
      tradeTs: '2025-03-01',
      filedAt: '2025-03-02',
    },
  ]
  const activity = buildDossierActivity(rows)
  assert.equal(activity.holdings.length, 1)
  assert.equal(activity.holdings[0].ticker, 'NVDA')
  assert.match(activity.aum, /\$1\.5M/)
})
