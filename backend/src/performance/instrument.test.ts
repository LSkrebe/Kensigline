import test from 'node:test'
import assert from 'node:assert/strict'
import { instrumentFromSecurityTitle } from './instrument.js'

test('Class A/B Common Stock counts as ordinary shares', () => {
  assert.equal(instrumentFromSecurityTitle('Class A Common Stock'), 'shares')
  assert.equal(instrumentFromSecurityTitle('Class B Common Stock'), 'shares')
  assert.equal(instrumentFromSecurityTitle('Common Stock'), 'shares')
})

test('preferred / warrants stay unclassified', () => {
  assert.equal(instrumentFromSecurityTitle('Class A Preferred Stock'), 'unclassified')
  assert.equal(instrumentFromSecurityTitle('Convertible Note'), 'unclassified')
  assert.equal(instrumentFromSecurityTitle('Warrant'), 'unclassified')
  assert.equal(instrumentFromSecurityTitle(null, true), 'derivative')
})
