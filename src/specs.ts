import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const SPECS_DIR = new URL('../specs/', import.meta.url).pathname

// Behaviour lives in specs/*.md. base.md first, the rest by name.
export function loadSpecs(dir: string = SPECS_DIR): string {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort((a, b) => (a === 'base.md' ? -1 : b === 'base.md' ? 1 : a.localeCompare(b)))
  if (files.length === 0) throw new Error(`no spec files in ${dir}`)
  return files.map((f) => readFileSync(join(dir, f), 'utf8').trim()).join('\n\n---\n\n')
}
