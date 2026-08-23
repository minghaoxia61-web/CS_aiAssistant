import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { chatStructuredJSON } from '../../electron/llm.js'
import { resolveLlmConfig } from '../../server/llm-config.js'
import type { ApiConfig, LlmStreamOptions } from '../../src/shared/types'

interface FunctionRequest extends IncomingMessage { body?: unknown }

function deploymentConfig(): ApiConfig {
  return {
    baseUrl: process.env.LLM_BASE_URL || 'https://api.deepseek.com',
    apiKey: process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || 'deepseek-v4-flash',
    temperature: 0.7,
    maxTokens: 0,
    topP: 1,
  }
}

async function readBody(req: FunctionRequest): Promise<LlmStreamOptions> {
  if (req.body && typeof req.body === 'object') return req.body as LlmStreamOptions
  if (typeof req.body === 'string') return JSON.parse(req.body) as LlmStreamOptions
  let raw = ''
  for await (const chunk of req) raw += String(chunk)
  return JSON.parse(raw || '{}') as LlmStreamOptions
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export default async function handler(req: FunctionRequest, res: ServerResponse): Promise<void> {
  const requestId = randomUUID()
  const startedAt = Date.now()
  try {
    const opts = await readBody(req)
    const config = resolveLlmConfig(deploymentConfig(), opts.config)
    const result = await chatStructuredJSON({
      config,
      messages: opts.messages,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
      stream: false,
      responseKind: opts.responseKind,
      expectedItems: opts.expectedItems,
    })
    res.setHeader('X-LLM-Request-ID', requestId)
    sendJson(res, 200, {
      ok: true,
      content: result.content,
      meta: { requestId, attempts: result.attempts, repaired: result.repaired, latencyMs: Date.now() - startedAt, mode: 'json' },
    })
  } catch (error) {
    const attempts = typeof (error as { attempts?: unknown }).attempts === 'number'
      ? (error as { attempts: number }).attempts
      : 1
    sendJson(res, 400, {
      ok: false,
      error: (error as Error).message,
      meta: { requestId, attempts, repaired: attempts > 1, latencyMs: Date.now() - startedAt, mode: 'json' },
    })
  }
}
