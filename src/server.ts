import { serve } from '@hono/node-server'
import { createKeikiHandler } from '@onkeiki/ai-sdk'
import { Hono } from 'hono'
import { echoReply } from './echo.ts'

const PORT = Number(process.env.PORT ?? 8080)

// No KEIKI_SIGNING_SECRET set → the SDK checks Keiki's Ed25519 signature, so we hold no secret.
const keikiTurn = createKeikiHandler({
  onTurn: async ({ turn, client }) => {
    const text = echoReply(turn)
    if (!text) return
    const result = await client.message(text, { idempotencyKey: `echo-${turn.turnId}` })
    if (!result.ok) console.error('reply failed', turn.turnId, result)
  },
})

const app = new Hono()
app.get('/health', (c) => c.json({ ok: true }))
app.post('/keiki/turn', (c) => keikiTurn(c.req.raw))

serve({ fetch: app.fetch, port: PORT }, () => console.log(`brain listening on :${PORT}`))
