import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkClick, checkUrl } from './desktop.ts'

test('allows broker read pages', () => {
  assert.equal(checkUrl('https://groww.in/mutual-funds/user/investments'), null)
  assert.equal(checkUrl('https://console.zerodha.com/portfolio/holdings'), null)
})

test('blocks other sites, http and trading pages', () => {
  assert.match(checkUrl('https://evil.com/groww.in')!, /only/)
  assert.match(checkUrl('https://groww.in.evil.com/')!, /only/)
  assert.match(checkUrl('http://groww.in/')!, /https/)
  assert.match(checkUrl('https://groww.in/stocks/reliance/buy')!, /blocked/)
  assert.match(checkUrl('https://kite.zerodha.com/orders/new?x=1')!, /blocked/)
  assert.match(checkUrl('https://coin.zerodha.com/redeem/123')!, /blocked/)
})

test('blocks trading clicks, allows reading clicks', () => {
  assert.equal(checkClick('Holdings'), null)
  assert.equal(checkClick('Mutual Funds'), null)
  assert.notEqual(checkClick('Sell'), null)
  assert.notEqual(checkClick('Redeem'), null)
  assert.notEqual(checkClick('Place order'), null)
})
