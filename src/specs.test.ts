import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { loadSpecs } from './specs.ts'

test('puts base.md first, then the rest by name', () => {
  const dir = mkdtempSync(join(tmpdir(), 'specs-'))
  writeFileSync(join(dir, 'alerts.md'), 'A')
  writeFileSync(join(dir, 'base.md'), 'B')
  writeFileSync(join(dir, 'notes.txt'), 'ignored')
  assert.equal(loadSpecs(dir), 'B\n\n---\n\nA')
})

test('real specs include the no-advice rule', () => {
  assert.match(loadSpecs(), /Facts and options only/)
})
