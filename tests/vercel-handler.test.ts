import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'

import healthHandler from '../api/llm/health'

test('Vercel 原生健康处理器可独立启动', async (t) => {
  const server = createServer((req, res) => healthHandler(req, res))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())

  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const response = await fetch(`http://127.0.0.1:${address.port}/api/llm/health`)
  assert.equal(response.status, 200)
  const body = await response.json() as { ok?: boolean; byokSupported?: boolean }
  assert.equal(body.ok, true)
  assert.equal(body.byokSupported, true)
})
