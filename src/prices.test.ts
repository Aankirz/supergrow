import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseAmfi } from './prices.ts'

const SAMPLE = `Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date

Axis Mutual Fund

135762;INF846K01WO1;-;Axis Children's Fund;Direct Plan;Growth Option;31.2861;23-Nov-2026
135763;INF846K01WS2;INF846K01WQ6;Axis Children's Fund;Direct Plan;IDCW Option;28.8746;23-Nov-2026
999999;INF000000001;-;Closed Fund;Direct Plan;Growth Option;N.A.;23-Nov-2026`

test('parses NAV rows by header, both ISINs, skips bad values', () => {
  const rows = parseAmfi(SAMPLE)
  assert.equal(rows.length, 3)
  assert.deepEqual(rows[0], { isin: 'INF846K01WO1', schemeCode: '135762', name: "Axis Children's Fund", nav: 31.2861, navDate: '23-Nov-2026' })
  assert.equal(rows[2].isin, 'INF846K01WQ6')
})

test('fails loudly if AMFI changes the format', () => {
  assert.throws(() => parseAmfi('a;b;c\n1;2;3'), /format changed/)
})
