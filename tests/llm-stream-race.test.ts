import assert from 'node:assert/strict'
import test from 'node:test'

import { streamChat } from '../src/lib/llm'
import type { ApiConfig, LlmErrorEvent, LlmStreamOptions } from '../src/shared/types'

test('streamChat receives an error emitted before llmStream resolves its request id', { timeout: 1_000 }, async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  let errorListener: ((payload: LlmErrorEvent) => void) | undefined

  const api = {
    onLlmToken: () => () => undefined,
    onLlmDone: () => () => undefined,
    onLlmError: (listener: (payload: LlmErrorEvent) => void) => {
      errorListener = listener
      return () => {
        errorListener = undefined
      }
    },
    llmStream: async (opts: LlmStreamOptions) => {
      const requestId = opts.requestId || 'unexpected-generated-id'
      errorListener?.({ requestId, message: '未配置 API Key' })
      return requestId
    },
    llmAbort: async () => true,
  }

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { api },
  })

  const config: ApiConfig = {
    baseUrl: 'https://api.deepseek.com',
    apiKey: '',
    model: 'deepseek-v4-flash',
  }

  try {
    await assert.rejects(
      streamChat({
        config,
        messages: [{ role: 'user', content: '你好' }],
        onToken: () => undefined,
      }),
      /API Key/,
    )
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})
