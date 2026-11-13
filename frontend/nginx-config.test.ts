// @vitest-environment node
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const html = readFileSync('index.html', 'utf8')
const headers = readFileSync('nginx/security-headers.conf', 'utf8')

it('allows the inline theme script in the CSP by its hash', () => {
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? ''
  expect(script).not.toBe('')
  const hash = createHash('sha256').update(script, 'utf8').digest('base64')
  const source = `'sha256-${hash}'`

  expect(
    headers.includes(`script-src 'self' ${source};`),
    `The theme script in index.html changed. Put ${source} in script-src ` +
      'in nginx/security-headers.conf.',
  ).toBe(true)
})
