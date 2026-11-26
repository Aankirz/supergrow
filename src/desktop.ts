import { readFileSync } from 'node:fs'

// One Maritime Linux desktop per user. The model never gets raw computer/shell access:
// only these functions, and every URL and click passes the read-only fence first.

const API = 'https://api.maritime.sh/api/v1/computers'
const CDP_SCRIPT = readFileSync(new URL('../desktop/cdp.mjs', import.meta.url), 'utf8')
const START_SCRIPT = readFileSync(new URL('../desktop/start-browser.sh', import.meta.url), 'utf8')
const SIGN_IN_LINK_SECONDS = 600

export const BROKERS: Record<string, string> = {
  groww: 'https://groww.in/login',
  zerodha: 'https://kite.zerodha.com/',
}
const SITE_HOSTS = ['groww.in', 'zerodha.com']
// The user needs Google sign-in pages during takeover (Groww offers "Continue with Google").
const NETWORK_ALLOW = ['groww.in', '*.groww.in', 'zerodha.com', '*.zerodha.com', '*.kite.trade',
  'accounts.google.com', '*.gstatic.com', '*.googleapis.com', '*.googleusercontent.com']

const BLOCKED_PATH = /\/(order|orders\/new|buy|sell|redeem|withdraw|payment|pay|transfer|mandate|checkout|cart|add-funds|funds\/add)(\/|$|\?)/i
const BLOCKED_CLICK = /\b(buy|sell|redeem|withdraw|invest now|place order|confirm|pay|add money|add funds|transfer|start sip|modify|cancel order|exit|switch|stp|swp)\b/i

export function checkUrl(raw: string): string | null {
  let u: URL
  try { u = new URL(raw) } catch { return 'not a valid URL' }
  if (u.protocol !== 'https:') return 'only https pages'
  if (!SITE_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`))) return `only ${SITE_HOSTS.join(', ')} are allowed`
  if (BLOCKED_PATH.test(u.pathname)) return 'order, payment and withdrawal pages are blocked (read-only)'
  return null
}

export function checkClick(text: string): string | null {
  return BLOCKED_CLICK.test(text) ? `clicking "${text}" is blocked: Supergrow is read-only` : null
}

async function call(path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${process.env.MARITIME_API_KEY}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`maritime ${path} ${res.status}: ${data.message ?? data.detail ?? 'error'}`)
  return data
}

async function computerFor(userKey: string): Promise<string> {
  const c = await call('', { externalUserId: userKey, os: 'linux', network: { internet: { mode: 'list', allow: NETWORK_ALLOW } } })
  return c.id
}

async function shell(computerId: string, command: string): Promise<string> {
  const r = await call(`/${computerId}/exec`, { command })
  return String(r.stdout ?? '').trim()
}

const b64 = (s: string): string => Buffer.from(s).toString('base64')

async function ready(userKey: string): Promise<string> {
  const id = await computerFor(userKey)
  const setup = `mkdir -p /data/sg && echo ${b64(CDP_SCRIPT)} | base64 -d > /data/sg/cdp.mjs && echo ${b64(START_SCRIPT)} | base64 -d | bash`
  const out = await shell(id, setup)
  if (!out.endsWith('ready')) throw new Error(`browser not ready: ${out.slice(-200)}`)
  return id
}

export interface Page { url?: string; title?: string; text?: string; error?: string }

async function cdp(id: string, ...args: string[]): Promise<Page> {
  const quoted = args.map((a) => `'${a.replace(/'/g, `'\\''`)}'`).join(' ')
  const out = await shell(id, `node --experimental-websocket /data/sg/cdp.mjs ${quoted} 2>/dev/null`)
  try { return JSON.parse(out) } catch { return { error: `could not read the page: ${out.slice(0, 200)}` } }
}

// After every step, re-check where the browser ended up (a click can navigate anywhere).
function fenced(page: Page): Page {
  const problem = page.url ? checkUrl(page.url) : null
  return problem && !page.url?.startsWith('about:') ? { url: page.url, error: `landed on a blocked page: ${problem}` } : page
}

export async function openSite(userKey: string, url: string): Promise<Page> {
  const problem = checkUrl(url)
  if (problem) return { error: problem }
  return fenced(await cdp(await ready(userKey), 'open', url))
}

export async function readPage(userKey: string): Promise<Page> {
  return fenced(await cdp(await ready(userKey), 'text'))
}

export async function clickText(userKey: string, text: string): Promise<Page> {
  const problem = checkClick(text)
  if (problem) return { error: problem }
  return fenced(await cdp(await ready(userKey), 'click', text))
}

// Opens the broker login page on the user's desktop and returns a one-time link they open to sign in.
export async function signInLink(userKey: string, broker: string): Promise<{ link?: string; expiresInMinutes?: number; error?: string }> {
  const loginUrl = BROKERS[broker]
  if (!loginUrl) return { error: `unknown broker; supported: ${Object.keys(BROKERS).join(', ')}` }
  const id = await ready(userKey)
  await cdp(id, 'signin', loginUrl)
  const v = await call(`/${id}/viewer`, { mode: 'control', ttlSeconds: SIGN_IN_LINK_SECONDS })
  return { link: v.url, expiresInMinutes: SIGN_IN_LINK_SECONDS / 60 }
}
