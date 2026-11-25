import assert from 'node:assert/strict'
import { test } from 'node:test'
import { echoReply } from './echo.ts'

test('echoes the last message', () => {
  const turn = { messages: [{ text: 'hi' }, { text: ' my SIP? ' }] } as any
  assert.equal(echoReply(turn), 'Supergrow heard: my SIP?')
})

test('returns null when there is nothing to answer', () => {
  assert.equal(echoReply({ messages: [] } as any), null)
  assert.equal(echoReply({ messages: [{ text: '  ' }] } as any), null)
})
