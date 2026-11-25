import assert from 'node:assert/strict'
import { test } from 'node:test'
import { arithmetic, equityCapitalGainsTax, exitLoad, isLongTerm, lumpsumFutureValue, sipFutureValue } from './calc.ts'

test('arithmetic handles commas, percent and brackets', () => {
  assert.equal(arithmetic('1,50,000 + 25,000'), 175000)
  assert.equal(arithmetic('(300000 - 250000) * 12.5%'), 6250)
})

test('arithmetic refuses anything that is not a number expression', () => {
  assert.throws(() => arithmetic('process.exit()'))
  assert.throws(() => arithmetic('2 ** 1000'))
  assert.throws(() => arithmetic('1/0'))
})

test('long term means held more than 12 months', () => {
  assert.equal(isLongTerm('2025-01-10', '2026-01-10'), false)
  assert.equal(isLongTerm('2025-01-10', '2026-01-11'), true)
})

test('LTCG under the ₹1.25 lakh exemption is tax free', () => {
  const r = equityCapitalGainsTax([{ buyDate: '2023-01-01', buyValue: 200000, sellValue: 300000 }], '2026-11-25')
  assert.equal(r.longTermGain, 100000)
  assert.equal(r.totalTax, 0)
})

test('LTCG above the exemption: 12.5% plus 4% cess', () => {
  const r = equityCapitalGainsTax([{ buyDate: '2023-01-01', buyValue: 100000, sellValue: 325000 }], '2026-11-25')
  assert.equal(r.taxableLongTermGain, 100000)
  assert.equal(r.longTermTax, 12500)
  assert.equal(r.cess, 500)
  assert.equal(r.totalTax, 13000)
})

test('STCG at 20% plus cess', () => {
  const r = equityCapitalGainsTax([{ buyDate: '2026-06-01', buyValue: 100000, sellValue: 150000 }], '2026-11-25')
  assert.equal(r.shortTermTax, 10000)
  assert.equal(r.totalTax, 10400)
})

test('a short-term loss reduces long-term gains', () => {
  const r = equityCapitalGainsTax([
    { buyDate: '2023-01-01', buyValue: 100000, sellValue: 300000 },
    { buyDate: '2026-06-01', buyValue: 100000, sellValue: 50000 },
  ], '2026-11-25')
  assert.equal(r.longTermGain, 150000)
  assert.equal(r.taxableLongTermGain, 25000)
})

test('exemption already used this year is respected', () => {
  const r = equityCapitalGainsTax([{ buyDate: '2023-01-01', buyValue: 100000, sellValue: 200000 }], '2026-11-25', 125000)
  assert.equal(r.taxableLongTermGain, 100000)
})

test('exit load and future values', () => {
  assert.deepEqual(exitLoad(300000, 1), { load: 3000, youGet: 297000 })
  assert.deepEqual(sipFutureValue(10000, 0, 1), { invested: 120000, futureValue: 120000, gain: 0 })
  assert.equal(sipFutureValue(10000, 12, 10).futureValue, 2323390.76)
  assert.equal(lumpsumFutureValue(100000, 10, 2).futureValue, 121000)
})
