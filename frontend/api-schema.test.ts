// @vitest-environment node
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'

const TIMEOUT = 30_000

let root: string
let yamlPath: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'api-schema-'))
  mkdirSync(join(root, 'frontend/src/api'), { recursive: true })
  mkdirSync(join(root, 'openapi'))
  yamlPath = join(root, 'openapi/v3.yaml')
  cpSync('package.json', join(root, 'frontend/package.json'))
  cpSync('src/api/schema.d.ts', join(root, 'frontend/src/api/schema.d.ts'))
  cpSync('../openapi/v3.yaml', yamlPath)
  symlinkSync(resolve('node_modules'), join(root, 'frontend/node_modules'))
})

afterEach(() => {
  rmSync(root, { recursive: true })
})

function checkApi() {
  return spawnSync('npm', ['run', '--silent', 'check:api'], {
    cwd: join(root, 'frontend'),
    encoding: 'utf8',
  })
}

it('passes when the types match the schema', { timeout: TIMEOUT }, () => {
  expect(checkApi().status).toBe(0)
})

it('fails when the schema has moved on', { timeout: TIMEOUT }, () => {
  const operation = 'operationId: categories_list'
  const yaml = readFileSync(yamlPath, 'utf8')
  expect(yaml).toContain(operation)
  writeFileSync(
    yamlPath,
    yaml.replace(operation, `${operation}\n      deprecated: true`),
  )

  const result = checkApi()

  expect(result.status).toBe(1)
  // Without this, a crashing generator would also pass as "stale".
  expect(result.stdout + result.stderr).toContain('not up-to-date')
})
