import { fetchNavs } from './prices.ts'
import type { Store } from './store.ts'

// Maritime wakes the box and POSTs the prompt to /chat on these schedules (GET /schedules).
export const SCHEDULES = [
  { id: 'prices', cron: '30 22 * * 1-5', tz: 'Asia/Kolkata', prompt: 'JOB:prices', enabled: true },
  { id: 'weekly', cron: '0 10 * * 0', tz: 'Asia/Kolkata', prompt: 'JOB:weekly', enabled: true },
]

export const ALERT_DROP_PERCENT = 5

const inr = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`

type SendNotice = (address: string, text: string) => Promise<void>

// Notice text is written for the agent (Keiki starts a turn), and its numbers are computed here.
export async function runPriceJob(store: Store, sendNotice: SendNotice): Promise<{ navs: number; alerts: number }> {
  const navs = await fetchNavs()
  store.saveNavs(navs)
  let alerts = 0
  for (const u of store.users()) {
    const holdings = store.holdings(u.userKey)
    if (!holdings.length) continue
    const now = store.revalue(u.userKey, holdings)
    const before = u.lastAlertValue
    store.setLastAlertValue(u.userKey, now)
    if (!before || !u.address) continue
    const change = ((now - before) / before) * 100
    if (change <= -ALERT_DROP_PERCENT) {
      alerts++
      await sendNotice(u.address, `ALERT for this user: their saved portfolio is now ${inr(now)}, down ${Math.abs(change).toFixed(1)}% from ${inr(before)} at the last check (mutual funds valued at today's AMFI NAV). Tell them the facts briefly. No advice.`)
    }
  }
  return { navs: navs.length, alerts }
}

export async function runWeeklyNote(store: Store, sendNotice: SendNotice): Promise<{ notes: number }> {
  let notes = 0
  for (const u of store.users()) {
    const holdings = store.holdings(u.userKey)
    if (!holdings.length || !u.address) continue
    const total = store.revalue(u.userKey, holdings)
    const top = [...holdings].sort((a, b) => b.value - a.value).slice(0, 3).map((h) => `${h.name} ${inr(h.value)}`).join('; ')
    await sendNotice(u.address, `WEEKLY NOTE for this user: saved portfolio value ${inr(total)} across ${holdings.length} holdings. Largest: ${top}. Write a short friendly weekly note with these facts only. No advice.`)
    notes++
  }
  return { notes }
}
