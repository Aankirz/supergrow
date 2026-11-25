// Runs on every reply before it is sent. Deterministic: no model call.

const PICK_PATTERNS: RegExp[] = [
  /\byou should (?:definitely |probably )?(?:buy|sell|redeem|switch|invest|exit|hold|stop|start)\b/i,
  /\bi(?:'d| would)? (?:recommend|suggest|advise)\b/i,
  /\bmy (?:recommendation|advice|pick) is\b/i,
  /\b(?:best|right) (?:fund|stock|option|choice) for you\b/i,
  /\bgo (?:ahead and )?(?:buy|sell|redeem)\b/i,
]

const UNIT: Record<string, number> = { k: 1e3, thousand: 1e3, lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, l: 1e5, cr: 1e7, crore: 1e7, crores: 1e7 }
const RUPEE = /(?:₹|\brs\.?|\binr)\s*([\d,]+(?:\.\d+)?)\s*(k|thousand|lakhs?|lacs?|l|cr|crores?)?\b/gi

export function rupeeAmounts(text: string): number[] {
  const out: number[] = []
  for (const m of text.matchAll(RUPEE)) {
    const n = Number(m[1].replace(/,/g, ''))
    if (Number.isFinite(n)) out.push(n * (m[2] ? UNIT[m[2].toLowerCase()] : 1))
  }
  return out
}

// Every number found anywhere in trusted text (calc results, saved holdings, the user's own words).
const WITH_UNIT = /([\d,]+(?:\.\d+)?)\s*(k|thousand|lakhs?|lacs?|cr|crores?)\b/gi
export function numbersIn(text: string): number[] {
  const withUnit = [...text.matchAll(WITH_UNIT)].map((m) => Number(m[1].replace(/,/g, '')) * UNIT[m[2].toLowerCase()])
  const plain = [...text.matchAll(/-?[\d,]*\.?\d+/g)].map((m) => Number(m[0].replace(/,/g, '')))
  return [...rupeeAmounts(text), ...withUnit, ...plain].filter(Number.isFinite)
}

// ₹ values are shown rounded (₹1.5 lakh for 1,49,800), so allow 1% or ₹1, whichever is larger.
function isKnown(n: number, known: number[]): boolean {
  return known.some((k) => Math.abs(k - n) <= Math.max(1, Math.abs(k) * 0.01))
}

export interface CheckResult { ok: boolean; problems: string[] }

export function checkReply(reply: string, trustedTexts: string[]): CheckResult {
  const problems: string[] = []
  for (const p of PICK_PATTERNS) {
    const m = reply.match(p)
    if (m) problems.push(`gives a pick ("${m[0]}"). Give facts and options only; the choice is the user's.`)
  }
  const known = trustedTexts.flatMap(numbersIn)
  for (const amount of rupeeAmounts(reply)) {
    if (!isKnown(amount, known)) problems.push(`₹${amount} did not come from a calc tool, saved data or the user. Calculate it with a tool or remove it.`)
  }
  return { ok: problems.length === 0, problems }
}

export const SAFE_FALLBACK =
  "Sorry, I couldn't put together an answer I'm sure is right. Could you ask again, maybe with a bit more detail?"
