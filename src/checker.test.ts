import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkReply, rupeeAmounts } from './checker.ts'

test('reads Indian rupee formats', () => {
  assert.deepEqual(rupeeAmounts('₹1,50,000 and Rs. 2 lakh and ₹1.5 cr and INR 500'), [150000, 200000, 15000000, 500])
})

test('blocks picks', () => {
  assert.equal(checkReply('You should sell it now.', []).ok, false)
  assert.equal(checkReply('I would recommend the index fund.', []).ok, false)
  assert.equal(checkReply('Option 1: sell. Option 2: keep. The choice is yours.', []).ok, true)
})

test('blocks rupee numbers that no tool or user gave', () => {
  const r = checkReply('Your tax would be ₹13,000.', ['user: I sold for 3 lakh'])
  assert.equal(r.ok, false)
  assert.match(r.problems[0], /13000/)
})

test('allows numbers from calc output, rounded for display', () => {
  const calc = JSON.stringify({ totalTax: 13000, futureValue: 2323390.76 })
  assert.equal(checkReply('Tax: ₹13,000. In 10 years: about ₹23.2 lakh.', [calc]).ok, true)
})

test("allows the user's own amounts", () => {
  assert.equal(checkReply('You said you have ₹3 lakh in the fund.', ['I have 3 lakh in HDFC Flexi Cap']).ok, true)
})
