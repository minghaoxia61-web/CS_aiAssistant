import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

test('LLM 代理提供脱敏健康检查并在无密钥时安全拒绝', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'cs-assistant-llm-'))
  const previousDataDir = process.env.DATA_DIR
  const previousKey = process.env.LLM_API_KEY
  process.env.DATA_DIR = directory
  delete process.env.LLM_API_KEY

  const { default: app } = await import('../server/app')
  const server = app.listen(0)
  await new Promise<void>((resolveReady) => server.once('listening', resolveReady))
  t.after(() => {
    server.close()
    if (previousDataDir === undefined) delete process.env.DATA_DIR
    else process.env.DATA_DIR = previousDataDir
    if (previousKey === undefined) delete process.env.LLM_API_KEY
    else process.env.LLM_API_KEY = previousKey
    const absolute = resolve(directory)
    if (resolve(absolute, '..') === resolve(tmpdir())) rmSync(absolute, { recursive: true, force: true })
  })

  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const origin = `http://127.0.0.1:${address.port}`
  const healthResponse = await fetch(`${origin}/api/llm/health`)
  const health = await healthResponse.json() as Record<string, unknown>
  assert.equal(healthResponse.status, 200)
  assert.deepEqual(health, {
    ok: true,
    provider: 'api.deepseek.com',
    model: 'deepseek-v4-flash',
    deploymentKeyConfigured: false,
    byokSupported: true,
    structuredRepair: true,
    streaming: true,
  })
  assert.equal(JSON.stringify(health).includes('apiKey'), false)

  const response = await fetch(`${origin}/api/llm/json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      config: {
        baseUrl: 'https://api.deepseek.com',
        apiKey: '',
        model: 'deepseek-v4-flash',
        temperature: 0.7,
        maxTokens: 32,
        topP: 1,
      },
      messages: [{ role: 'user', content: 'test' }],
    }),
  })
  const result = await response.json() as { error?: string }
  assert.equal(response.status, 400)
  assert.match(result.error || '', /未配置 API Key/)
})
