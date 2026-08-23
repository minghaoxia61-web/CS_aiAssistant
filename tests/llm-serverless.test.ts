import assert from 'node:assert/strict'
import test from 'node:test'

test('最小 Serverless LLM 应用可独立冷启动', async (t) => {
  const { default: app } = await import('../server/llm-app')
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  t.after(() => server.close())

  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const response = await fetch(`http://127.0.0.1:${address.port}/api/llm/health`)
  assert.equal(response.status, 200)
  const health = await response.json() as { ok?: boolean; streaming?: boolean }
  assert.equal(health.ok, true)
  assert.equal(health.streaming, true)
})
