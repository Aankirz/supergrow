import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { openStore } from './store.ts'

const fresh = () => openStore(mkdtempSync(join(tmpdir(), 'sg-')))

test('saving holdings from one source replaces the old read', () => {
  const s = fresh()
  s.saveHoldings('u1', 'groww', [{ name: 'A', value: 100 }, { name: 'B', value: 200 }])
  s.saveHoldings('u1', 'groww', [{ name: 'A', value: 150 }])
  s.saveHoldings('u1', 'zerodha', [{ name: 'C', value: 50 }])
  assert.equal(s.holdings('u1').length, 2)
  assert.equal(s.revalue('u1'), 200)
})

test('revalue uses units × latest NAV when the ISIN is known', () => {
  const s = fresh()
  s.saveHoldings('u1', 'groww', [{ name: 'Fund', isin: 'INF000', units: 10, value: 1000 }])
  s.saveNavs([{ isin: 'INF000', schemeCode: '1', name: 'Fund', nav: 120, navDate: '24-Nov-2026' }])
  assert.equal(s.revalue('u1'), 1200)
})

test('a job cannot run twice inside its gap', () => {
  const s = fresh()
  assert.equal(s.claimJob('weekly', 1000, 0), true)
  assert.equal(s.claimJob('weekly', 1000, 500), false)
  assert.equal(s.claimJob('weekly', 1000, 1500), true)
})

test('finds funds by words in the name', () => {
  const s = fresh()
  s.saveNavs([{ isin: 'INF1', schemeCode: '1', name: 'HDFC Flexi Cap Fund', nav: 10, navDate: 'd' },
    { isin: 'INF2', schemeCode: '2', name: 'HDFC Mid Cap Fund', nav: 20, navDate: 'd' }])
  assert.deepEqual(s.searchNavs('hdfc flexi').map((r) => r.isin), ['INF1'])
})

test('users keep their address once known', () => {
  const s = fresh()
  s.touchUser('u1', '+911234567890', 'whatsapp')
  s.touchUser('u1', null, null)
  assert.equal(s.users()[0].address, '+911234567890')
})
