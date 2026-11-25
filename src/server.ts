import { serve } from '@hono/node-server'
import { createKeikiHandler } from '@onkeiki/ai-sdk'
import { Hono } from 'hono'
import { runTurn } from './brain.ts'
import { runPriceJob, runWeeklyNote, SCHEDULES } from './jobs.ts'
import { openStore } from './store.ts'

const PORT = Number(process.env.PORT ?? 8080)
const HOUR = 3_600_000

for (const k of ['OPENAI_API_KEY', 'MARITIME_API_KEY', 'KEIKI_API_KEY', 'KEIKI_AGENT_ID']) {
  if (!process.env[k]) throw new Error(`${k} not configured`)
}

const store = openStore()

async function sendNotice(phone: string, text: string): Promise<void> {
  const res = await fetch(`https://onkeiki.com/api/v1/developer/agents/${process.env.KEIKI_AGENT_ID}/notice`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.KEIKI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, phone }),
  })
  if (!res.ok) console.error('notice failed', res.status, (await res.text()).slice(0, 200))
}

// No KEIKI_SIGNING_SECRET set → the SDK checks Keiki's Ed25519 signature, so we hold no secret.
const keikiTurn = createKeikiHandler({ onTurn: (ctx) => runTurn(ctx, store) })

// Jobs are public-URL reachable via /chat, so each one can run at most once per gap.
const JOBS: Record<string, { gapMs: number; run: () => Promise<unknown> }> = {
  'JOB:prices': { gapMs: 6 * HOUR, run: () => runPriceJob(store, sendNotice) },
  'JOB:weekly': { gapMs: 6 * 24 * HOUR, run: () => runWeeklyNote(store, sendNotice) },
}

const app = new Hono()
app.get('/health', (c) => c.json({ ok: true }))
app.get('/schedules', (c) => c.json(SCHEDULES))
app.post('/keiki/turn', (c) => keikiTurn(c.req.raw))
app.post('/chat', async (c) => {
  const { message } = await c.req.json<{ message?: string }>().catch(() => ({ message: '' }))
  const job = JOBS[String(message).trim()]
  if (!job) return c.json({ response: 'Supergrow brain is running. Users talk to it through Keiki.' })
  if (!store.claimJob(String(message).trim(), job.gapMs)) return c.json({ response: 'skipped: ran recently' })
  try {
    return c.json({ response: JSON.stringify(await job.run()) })
  } catch (err) {
    console.error('job failed', message, err)
    return c.json({ response: `job failed: ${String(err)}` }, 500)
  }
})

serve({ fetch: app.fetch, port: PORT }, () => console.log(`brain listening on :${PORT}`))
