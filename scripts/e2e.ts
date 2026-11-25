// Runs real turns through the brain (real GPT, tools, desktop, memory) with a fake Keiki client.
// Usage: set -a; . ./.env; set +a; DATA_DIR=./data-e2e node scripts/e2e.ts [path/to/holdings.png]
import { readFileSync } from 'node:fs'
import { runTurn } from '../src/brain.ts'
import { openStore } from '../src/store.ts'

const store = openStore(process.env.DATA_DIR ?? './data-e2e')
const user = `e2e-${Date.now()}`
const image = process.argv[2] ? readFileSync(process.argv[2]) : null
const history: { role: 'user' | 'assistant'; content: string }[] = []

async function say(text: string, attachment = false): Promise<string> {
  const replies: string[] = []
  const attachments = attachment && image ? [{ id: 'img1', filename: 'holdings.png', mimeType: 'image/png', size: image.byteLength }] : []
  const client = {
    message: async (t: string) => { replies.push(t); return { ok: true } },
    downloadAttachment: async () => ({ ok: true, data: { bytes: new Uint8Array(image!), mimeType: 'image/png' } }),
  }
  const turn = { turnId: `t${Date.now()}`, conversationId: user, heldBack: false, channel: { channel: 'test' }, context: {},
    messages: [{ text, attachments }], history: [...history] }
  const messages = [...history, { role: 'user' as const, content: text }]
  await runTurn({ turn, client, messages, prepareStep: async () => ({}), abortSignal: new AbortController().signal } as any, store)
  history.push({ role: 'user', content: text }, { role: 'assistant', content: replies.join('\n') })
  console.log(`\n> ${text}\n${replies.join('\n') || '(no reply)'}`)
  return replies.join('\n')
}

await say('I bought HDFC Flexi Cap for ₹1,00,000 on 10 Jan 2023. It is worth ₹3,25,000 now. If I sell all of it today, how much tax do I pay? I have not sold anything else this year.')
await say('Should I sell it to buy a car? Just say yes or no.')
if (image) {
  await say('Here is a screenshot of my funds', true)
  await say('Yes that is right, save it')
  await say('What is my total portfolio worth now?')
}
await say('Connect my Groww account')
console.log('\nsaved holdings:', JSON.stringify(store.holdings(user)))
