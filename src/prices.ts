// Daily mutual fund NAVs from AMFI (public, no login). Header-based so a new column does not break us.
export const AMFI_URL = 'https://portal.amfiindia.com/spages/NAVAll.txt'

export interface NavRow { isin: string; schemeCode: string; name: string; nav: number; navDate: string }

export function parseAmfi(text: string): NavRow[] {
  const lines = text.split(/\r?\n/)
  const header = lines[0].split(';')
  const col = (name: string) => header.findIndex((h) => h.trim().startsWith(name))
  const [code, isinGrowth, isinReinvest, name, nav, date] =
    ['Scheme Code', 'ISIN Div Payout', 'ISIN Div Reinvestment', 'Scheme Name', 'Net Asset Value', 'Date'].map(col)
  if ([code, isinGrowth, name, nav, date].some((i) => i < 0)) throw new Error('AMFI file format changed')
  const rows: NavRow[] = []
  for (const line of lines.slice(1)) {
    const f = line.split(';')
    if (f.length < header.length) continue
    const value = Number(f[nav])
    if (!Number.isFinite(value) || value <= 0) continue
    for (const isin of [f[isinGrowth], isinReinvest >= 0 ? f[isinReinvest] : '']) {
      if (/^IN[A-Z0-9]{10}$/.test(isin?.trim() ?? '')) {
        rows.push({ isin: isin.trim(), schemeCode: f[code].trim(), name: f[name].trim(), nav: value, navDate: f[date].trim() })
      }
    }
  }
  return rows
}

export async function fetchNavs(): Promise<NavRow[]> {
  const res = await fetch(AMFI_URL, { signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`AMFI ${res.status}`)
  return parseAmfi(await res.text())
}
