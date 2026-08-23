import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { chatJSON, streamChat } from '../../electron/llm'
import { resolveLlmConfig } from '../../server/llm-config'
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

export default async function handler(req: FunctionRequest, res: ServerResponse): Promise<void> {
  let handle: { abort: () => void } | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined
  try {
    const opts = await readBody(req)
    const requestId = opts.requestId || randomUUID()
    const config = resolveLlmConfig(deploymentConfig(), opts.config)
    const startedAt = Date.now()
    let emittedToken = false
    let fallbackStarted = false

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    res.flushHeaders()
    res.write(`data: ${JSON.stringify({ type: 'init', requestId })}\n\n`)
    heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15_000)

    const fail = (message: string) => {
      if (heartbeat) clearInterval(heartbeat)
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'error', requestId, message })}\n\n`)
        res.end()
      }
    }

    handle = streamChat(
      { config, messages: opts.messages, temperature: opts.temperature, maxTokens: opts.maxTokens, stream: true },
      {
        onToken: (token) => {
          emittedToken = true
          if (!res.writableEnded) res.write(`data: ${JSON.stringify({ type: 'token', requestId, token })}\n\n`)
        },
        onDone: (full) => {
          if (heartbeat) clearInterval(heartbeat)
          if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ type: 'done', requestId, full })}\n\n`)
            res.end()
          }
        },
        onError: (message) => {
          const retryable = /socket hang up|ECONNRESET|fetch failed|timeout|timed out|429|502|503|504/i.test(message)
          if (!fallbackStarted && !emittedToken && retryable) {
            fallbackStarted = true
            void chatJSON({ config, messages: opts.messages, temperature: opts.temperature, maxTokens: opts.maxTokens, stream: false })
              .then((content) => {
                if (heartbeat) clearInterval(heartbeat)
                if (res.writableEnded) return
                res.write(`data: ${JSON.stringify({ type: 'token', requestId, token: content })}\n\n`)
                res.write(`data: ${JSON.stringify({
                  type: 'done', requestId, full: content,
                  meta: { requestId, attempts: 2, repaired: false, latencyMs: Date.now() - startedAt, mode: 'stream_fallback' },
                })}\n\n`)
                res.end()
              })
              .catch((error: Error) => fail(error.message))
            return
          }
          fail(message)
        },
      },
    )

    res.once('close', () => {
      if (heartbeat) clearInterval(heartbeat)
      if (!res.writableEnded) handle?.abort()
    })
  } catch (error) {
    if (heartbeat) clearInterval(heartbeat)
    if (!res.headersSent) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ error: (error as Error).message }))
    } else if (!res.writableEnded) {
      res.end()
    }
  }
}
