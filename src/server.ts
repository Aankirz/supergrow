import { openai } from '@ai-sdk/openai'
import { serve } from '@hono/node-server'
import { createKeikiHandler } from '@onkeiki/ai-sdk'
import { stepCountIs, streamText } from 'ai'
import { Hono } from 'hono'
import { loadSpecs } from './specs.ts'

const PORT = Number(process.env.PORT ?? 8080)
const MODEL = process.env.BRAIN_MODEL ?? 'gpt-5.6-terra'
const MAX_STEPS = 25

if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured')

const specs = loadSpecs()

// Our specs lead; Keiki's channel instructions (threading, tools) follow.
function systemPrompt(keikiInstructions: string | undefined): string {
  return keikiInstructions ? `${specs}\n\n---\n\n# Channel notes\n\n${keikiInstructions}` : specs
}

// No KEIKI_SIGNING_SECRET set → the SDK checks Keiki's Ed25519 signature, so we hold no secret.
const keikiTurn = createKeikiHandler({
  onTurn: async ({ instructions, messages, tools, prepareStep, abortSignal }) =>
    streamText({
      model: openai(MODEL),
      system: systemPrompt(instructions),
      messages,
      tools: await tools(),
      prepareStep,
      stopWhen: stepCountIs(MAX_STEPS),
      abortSignal,
    }),
})

const app = new Hono()
app.get('/health', (c) => c.json({ ok: true, model: MODEL }))
app.post('/keiki/turn', (c) => keikiTurn(c.req.raw))

serve({ fetch: app.fetch, port: PORT }, () => console.log(`brain listening on :${PORT} model=${MODEL}`))
