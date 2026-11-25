import { openai } from '@ai-sdk/openai'
import type { KeikiTurnContext } from '@onkeiki/ai-sdk'
import { generateText, stepCountIs, type ModelMessage } from 'ai'
import { checkReply, SAFE_FALLBACK } from './checker.ts'
import { recall, remember } from './memory.ts'
import { loadSpecs } from './specs.ts'
import type { Store } from './store.ts'
import { buildTools } from './tools.ts'

const MODEL = process.env.BRAIN_MODEL ?? 'gpt-5.6-terra'
const MAX_STEPS = 25
// Our OpenAI org has zero data retention: reasoning must travel with the request, not be looked up.
export const OPENAI_OPTIONS = { openai: { store: false, include: ['reasoning.encrypted_content'] } }
const specs = loadSpecs()

// Keiki gives no single "user id" field we can rely on across channels yet: use the conversation,
// and pick a phone/handle out of the channel or context for notices.
export function addressOf(...records: Record<string, unknown>[]): string | null {
  for (const r of records) {
    for (const [k, v] of Object.entries(r ?? {})) {
      if (typeof v !== 'string') continue
      if (/^\+\d{8,15}$/.test(v) || /^(phone|address|handle|from|identity)$/i.test(k)) return v
    }
  }
  return null
}

function systemPrompt(profile: string, holdingsCount: number, files: string[]): string {
  const today = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'short', day: 'numeric' })
  return [
    specs,
    `# This turn\nToday is ${today} (India).\nSaved holdings for this user: ${holdingsCount}.`,
    files.length ? `Files the user sent in this turn (use read_image): ${files.join(', ')}` : '',
    profile ? `# What we remember about this user\n${profile}` : '',
  ].filter(Boolean).join('\n\n---\n\n')
}

export async function runTurn(ctx: KeikiTurnContext, store: Store): Promise<void> {
  const { turn, client, messages, prepareStep, abortSignal } = ctx
  if (turn.heldBack) return
  const userKey = turn.conversationId
  store.touchUser(userKey, addressOf(turn.channel, turn.context), turn.channel.channel)

  const files = turn.messages.flatMap((m) => m.attachments ?? []).map((a) => `${a.id} (${a.mimeType})`)
  const userText = turn.messages.map((m) => m.text).join('\n')
  const { tools, trusted } = buildTools(userKey, store, client)
  const system = systemPrompt(await recall(userKey), store.holdings(userKey).length, files)
  const run = (msgs: ModelMessage[]) => generateText({ model: openai(MODEL), system, messages: msgs, tools, prepareStep, stopWhen: stepCountIs(MAX_STEPS), abortSignal, providerOptions: OPENAI_OPTIONS })

  // Numbers the reply may use: tool outputs, the user's words, and the conversation so far.
  const trustedNow = () => [...trusted, userText, ...turn.history.map((h) => h.content)]
  let result = await run(messages)
  let reply = result.text.trim()
  let check = checkReply(reply, trustedNow())
  if (!check.ok) {
    console.error('checker rejected', turn.turnId, check.problems)
    result = await run([...messages, ...result.response.messages,
      { role: 'user', content: `[Supergrow checker, not the user] Rewrite your last reply. Problems:\n- ${check.problems.join('\n- ')}` }])
    reply = result.text.trim()
    check = checkReply(reply, trustedNow())
  }
  if (!check.ok) {
    console.error('checker rejected twice, sending fallback', turn.turnId, check.problems)
    reply = SAFE_FALLBACK
  }
  if (!reply) return
  const sent = await client.message(reply, { idempotencyKey: `reply-${turn.turnId}` })
  if (!sent.ok) console.error('reply failed', turn.turnId, sent)
  void remember(userKey, turn.turnId, userText, reply)
}
