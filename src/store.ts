import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

// ponytail: SQLite on the brain box's persistent /data disk. One box, ~1,000 users: plenty.
// Move to Postgres (Neon) if we ever run more than one brain box.
const DATA_DIR = process.env.DATA_DIR ?? '/data'

export interface Holding {
  name: string
  isin?: string | null
  units?: number | null
  value: number // ₹ current value as read from the broker or screenshot
  invested?: number | null // ₹ cost, if shown
}

export interface User {
  userKey: string
  address: string | null // phone / handle Keiki uses for notices
  channel: string | null
  lastAlertValue: number | null
}

export function openStore(dir: string = DATA_DIR) {
  mkdirSync(dir, { recursive: true })
  const db = new DatabaseSync(join(dir, 'supergrow.db'))
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (user_key TEXT PRIMARY KEY, address TEXT, channel TEXT,
      last_alert_value REAL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, last_seen TEXT);
    CREATE TABLE IF NOT EXISTS holdings (user_key TEXT, source TEXT, name TEXT, isin TEXT, units REAL,
      value REAL, invested REAL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS navs (isin TEXT PRIMARY KEY, scheme_code TEXT, name TEXT, nav REAL, nav_date TEXT);
    CREATE TABLE IF NOT EXISTS job_runs (job TEXT PRIMARY KEY, ran_at INTEGER);
  `)

  const api = {
    touchUser(userKey: string, address: string | null, channel: string | null): void {
      db.prepare(`INSERT INTO users (user_key, address, channel, last_seen) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_key) DO UPDATE SET address = COALESCE(excluded.address, address),
        channel = COALESCE(excluded.channel, channel), last_seen = CURRENT_TIMESTAMP`).run(userKey, address, channel)
    },
    users(): User[] {
      return db.prepare('SELECT user_key, address, channel, last_alert_value FROM users').all().map((r: any) => ({
        userKey: r.user_key, address: r.address, channel: r.channel, lastAlertValue: r.last_alert_value,
      }))
    },
    setLastAlertValue(userKey: string, value: number): void {
      db.prepare('UPDATE users SET last_alert_value = ? WHERE user_key = ?').run(value, userKey)
    },
    // Replaces everything from one source (e.g. "groww") so a re-read never double counts.
    saveHoldings(userKey: string, source: string, holdings: Holding[]): void {
      db.exec('BEGIN')
      try {
        db.prepare('DELETE FROM holdings WHERE user_key = ? AND source = ?').run(userKey, source)
        const ins = db.prepare('INSERT INTO holdings (user_key, source, name, isin, units, value, invested) VALUES (?, ?, ?, ?, ?, ?, ?)')
        for (const h of holdings) ins.run(userKey, source, h.name, h.isin ?? null, h.units ?? null, h.value, h.invested ?? null)
        db.exec('COMMIT')
      } catch (err) {
        db.exec('ROLLBACK')
        throw err
      }
    },
    holdings(userKey: string): (Holding & { source: string; updatedAt: string })[] {
      return db.prepare('SELECT source, name, isin, units, value, invested, updated_at FROM holdings WHERE user_key = ?')
        .all(userKey).map((r: any) => ({ source: r.source, name: r.name, isin: r.isin, units: r.units, value: r.value, invested: r.invested, updatedAt: r.updated_at }))
    },
    saveNavs(rows: { isin: string; schemeCode: string; name: string; nav: number; navDate: string }[]): void {
      db.exec('BEGIN')
      const up = db.prepare('INSERT OR REPLACE INTO navs (isin, scheme_code, name, nav, nav_date) VALUES (?, ?, ?, ?, ?)')
      for (const r of rows) up.run(r.isin, r.schemeCode, r.name, r.nav, r.navDate)
      db.exec('COMMIT')
    },
    nav(isin: string): { nav: number; navDate: string; name: string } | null {
      const r: any = db.prepare('SELECT nav, nav_date, name FROM navs WHERE isin = ?').get(isin)
      return r ? { nav: r.nav, navDate: r.nav_date, name: r.name } : null
    },
    searchNavs(query: string, limit = 5): { isin: string; name: string; nav: number; navDate: string }[] {
      const words = query.trim().split(/\s+/).filter(Boolean).slice(0, 6)
      if (!words.length) return []
      const where = words.map(() => 'name LIKE ?').join(' AND ')
      return db.prepare(`SELECT isin, name, nav, nav_date FROM navs WHERE ${where} LIMIT ?`)
        .all(...words.map((w) => `%${w}%`), limit).map((r: any) => ({ isin: r.isin, name: r.name, nav: r.nav, navDate: r.nav_date }))
    },
    // Returns false if the job ran less than minGapMs ago (stops /chat replays from spamming users).
    claimJob(job: string, minGapMs: number, now = Date.now()): boolean {
      const r: any = db.prepare('SELECT ran_at FROM job_runs WHERE job = ?').get(job)
      if (r && now - r.ran_at < minGapMs) return false
      db.prepare('INSERT OR REPLACE INTO job_runs (job, ran_at) VALUES (?, ?)').run(job, now)
      return true
    },
    // Units × latest NAV where we know both; else the last value read from the broker.
    revalue(userKey: string, holdingsList?: Holding[]): number {
      return (holdingsList ?? api.holdings(userKey)).reduce((sum: number, h: Holding) => {
        const n = h.isin && h.units ? api.nav(h.isin) : null
        return sum + (n ? n.nav * (h.units as number) : h.value)
      }, 0)
    },
  }
  return api
}

export type Store = ReturnType<typeof openStore>
