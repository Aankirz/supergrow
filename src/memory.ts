import { Supermemory } from 'supermemory'

// One supermemory namespace per user. Memory is best effort: if it fails, the turn still runs.
const client = process.env.SUPERMEMORY_API_KEY ? new Supermemory() : null
const ns = (userKey: string): string => `sg_${userKey.replace(/[^A-Za-z0-9_:-]/g, '_')}`.slice(0, 100)

export async function recall(userKey: string): Promise<string> {
  if (!client) return ''
  try {
    return (await client.profileMarkdown(ns(userKey))).trim()
  } catch (err) {
    console.error('memory recall failed', String(err))
    return ''
  }
}

export async function remember(userKey: string, turnId: string, userText: string, reply: string): Promise<void> {
  if (!client || !userText) return
  try {
    await client.add(ns(userKey), { content: `User: ${userText}\nSupergrow: ${reply}`, id: `turn_${turnId}`, dreaming: 'instant' })
  } catch (err) {
    console.error('memory save failed', String(err))
  }
}

export async function forgetUser(userKey: string): Promise<void> {
  await client?.namespaces.delete(ns(userKey))
}
