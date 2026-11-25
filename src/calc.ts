import { readFileSync } from 'node:fs'

// Every rupee number the model says must come from here. Pure functions, tested in calc.test.ts.
export const TAX = JSON.parse(readFileSync(new URL('../rules/india-tax.json', import.meta.url), 'utf8'))

const round2 = (n: number): number => Math.round(n * 100) / 100

// ponytail: whitelist regex makes Function() safe (digits and operators only, no identifiers).
const ARITHMETIC = /^[\d+\-*/().,%\s]+$/
export function arithmetic(expression: string): number {
  const expr = expression.replace(/,/g, '').replace(/(\d+(?:\.\d+)?)%/g, '($1/100)')
  if (!ARITHMETIC.test(expression) || /\*\*/.test(expr)) throw new Error('only numbers and + - * / ( ) % are allowed')
  const value = Function(`"use strict"; return (${expr})`)()
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('result is not a finite number')
  return round2(value)
}

export interface Lot {
  buyDate: string // YYYY-MM-DD
  buyValue: number // total ₹ paid for this lot
  sellValue: number // total ₹ received (or current value if not sold yet)
}

export interface EquityTaxResult {
  shortTermGain: number
  longTermGain: number
  exemptionUsed: number
  taxableLongTermGain: number
  shortTermTax: number
  longTermTax: number
  cess: number
  totalTax: number
  rules: { taxYear: string; checkedOn: string; notHandled: string[] }
}

export function isLongTerm(buyDate: string, sellDate: string): boolean {
  const limit = new Date(buyDate)
  limit.setMonth(limit.getMonth() + TAX.equity.longTermAfterMonths)
  return new Date(sellDate) > limit
}

export function equityCapitalGainsTax(lots: Lot[], sellDate: string, exemptionAlreadyUsed = 0): EquityTaxResult {
  const e = TAX.equity
  let st = 0
  let lt = 0
  for (const lot of lots) {
    const gain = lot.sellValue - lot.buyValue
    if (isLongTerm(lot.buyDate, sellDate)) lt += gain
    else st += gain
  }
  // A short-term loss can reduce long-term gains; a long-term loss cannot reduce short-term gains.
  if (st < 0) { lt += st; st = 0 }
  if (lt < 0) lt = 0
  const exemptionLeft = Math.max(0, e.ltcgExemptionPerYear - exemptionAlreadyUsed)
  const exemptionUsed = Math.min(lt, exemptionLeft)
  const taxableLt = lt - exemptionUsed
  const stTax = st * e.stcgRate
  const ltTax = taxableLt * e.ltcgRate
  const cess = (stTax + ltTax) * TAX.cessRate
  return {
    shortTermGain: round2(st),
    longTermGain: round2(lt),
    exemptionUsed: round2(exemptionUsed),
    taxableLongTermGain: round2(taxableLt),
    shortTermTax: round2(stTax),
    longTermTax: round2(ltTax),
    cess: round2(cess),
    totalTax: round2(stTax + ltTax + cess),
    rules: { taxYear: TAX.taxYear, checkedOn: TAX.checkedOn, notHandled: TAX.notHandled },
  }
}

export function exitLoad(amount: number, loadPercent: number): { load: number; youGet: number } {
  const load = (amount * loadPercent) / 100
  return { load: round2(load), youGet: round2(amount - load) }
}

// Monthly SIP paid at the start of each month. The return rate is an assumption the user picks.
export function sipFutureValue(monthly: number, annualRatePercent: number, years: number) {
  const n = Math.round(years * 12)
  const i = annualRatePercent / 100 / 12
  const value = i === 0 ? monthly * n : monthly * ((Math.pow(1 + i, n) - 1) / i) * (1 + i)
  const invested = monthly * n
  return { invested: round2(invested), futureValue: round2(value), gain: round2(value - invested) }
}

export function lumpsumFutureValue(amount: number, annualRatePercent: number, years: number) {
  const value = amount * Math.pow(1 + annualRatePercent / 100, years)
  return { futureValue: round2(value), gain: round2(value - amount) }
}
