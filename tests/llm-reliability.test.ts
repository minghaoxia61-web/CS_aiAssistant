import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyLlmError } from '../src/lib/llm-reliability'
import { resolveLlmConfig, validateLlmBaseUrl } from '../server/llm-config'
import type { ApiConfig } from '../src/shared/types'

const serverConfig: ApiConfig = {
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: '',
  model: 'deepseek-chat',
  temperature: 0.7,
  maxTokens: 0,
  topP: 1,
}

test('BYOK is used when the deployment has no server key', () => {
  const resolved = resolveLlmConfig(serverConfig, { ...serverConfig, apiKey: 'user-key' })
  assert.equal(resolved.apiKey, 'user-key')
})

test('deployment key takes precedence over a browser key', () => {
  const resolved = resolveLlmConfig(
    { ...serverConfig, apiKey: 'deployment-key' },
    { ...serverConfig, apiKey: 'user-key' },
  )
  assert.equal(resolved.apiKey, 'deployment-key')
})

test('all current providers require a key, including migrated Pollinations', () => {
  assert.throws(() => resolveLlmConfig(serverConfig, {
    ...serverConfig,
    baseUrl: 'https://gen.pollinations.ai/v1',
    apiKey: '',
    model: 'openai',
  }), /未配置 API Key/)
})

test('unknown or unsafe model proxy targets are rejected', () => {
  assert.throws(() => validateLlmBaseUrl('http://localhost:11434/v1'), /HTTPS/)
  assert.throws(() => validateLlmBaseUrl('https://example.com/v1'), /未被服务端允许/)
})

test('LLM errors are classified into actionable messages', () => {
  assert.deepEqual(classifyLlmError(new Error('API 请求失败 (401)')), {
    kind: 'auth',
    message: 'API Key 无效或没有访问该模型的权限。',
    retryable: false,
  })
  assert.equal(classifyLlmError(new Error('socket hang up')).retryable, true)
  assert.equal(classifyLlmError(new Error('模型响应超时')).kind, 'timeout')
})
