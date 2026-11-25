import type { KeikiTurn } from '@onkeiki/channels'

// Step 1 reply: repeat the user's last message. The harness loop replaces this in step 2.
export function echoReply(turn: Pick<KeikiTurn, 'messages'>): string | null {
  const last = turn.messages.at(-1)?.text?.trim()
  return last ? `Supergrow heard: ${last}` : null
}
