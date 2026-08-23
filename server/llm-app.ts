import express, { type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { chatJSON, chatStructuredJSON, streamChat } from '../electron/llm';
import type { ApiConfig, LlmStreamOptions } from '../src/shared/types';
import { getConfig } from './config';
import { resolveLlmConfig } from './llm-config';
import { abortOnPrematureResponseClose } from './stream-lifecycle';

// Vercel Function 只加载模型代理依赖，避免冷启动时引入文件解析、知识库种子和本地数据层。
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '12mb' }));

const activeStreams = new Map<string, { abort: () => void }>();

app.get('/api/llm/health', (_req: Request, res: Response) => {
  const config = getConfig();
  let provider = 'invalid';
  try {
    provider = new URL(config.baseUrl).hostname;
  } catch {
    // 健康检查只返回脱敏信息。
  }
  res.json({
    ok: true,
    provider,
    model: config.model,
    deploymentKeyConfigured: Boolean(process.env.LLM_API_KEY),
    byokSupported: true,
    structuredRepair: true,
    streaming: true,
  });
});

app.post('/api/llm/stream', (req: Request, res: Response) => {
  const opts = req.body as LlmStreamOptions;
  const requestId = opts.requestId || uuidv4();
  let config: ApiConfig;
  try {
    config = resolveLlmConfig(getConfig(), opts.config);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
    return;
  }

  console.log(`[LLM] 流式请求 ${requestId.slice(0, 8)}, model=${config.model}, baseUrl=${config.baseUrl}, hasKey=${!!config.apiKey}`);
  req.setTimeout(0);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write(`data: ${JSON.stringify({ type: 'init', requestId })}\n\n`);

  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15_000);
  const startedAt = Date.now();
  let emittedToken = false;
  let fallbackStarted = false;

  const closeWithError = (message: string) => {
    clearInterval(heartbeat);
    activeStreams.delete(requestId);
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type: 'error', requestId, message })}\n\n`);
      res.end();
    }
  };

  const handle = streamChat(
    { config, messages: opts.messages, temperature: opts.temperature, maxTokens: opts.maxTokens, stream: true },
    {
      onToken: (token) => {
        emittedToken = true;
        if (!res.writableEnded) res.write(`data: ${JSON.stringify({ type: 'token', requestId, token })}\n\n`);
      },
      onDone: (full) => {
        clearInterval(heartbeat);
        activeStreams.delete(requestId);
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ type: 'done', requestId, full })}\n\n`);
          res.end();
        }
      },
      onError: (message) => {
        const retryable = /socket hang up|ECONNRESET|fetch failed|timeout|timed out|429|502|503|504/i.test(message);
        if (!fallbackStarted && !emittedToken && retryable) {
          fallbackStarted = true;
          void chatJSON({ config, messages: opts.messages, temperature: opts.temperature, maxTokens: opts.maxTokens, stream: false })
            .then((content) => {
              clearInterval(heartbeat);
              activeStreams.delete(requestId);
              if (res.writableEnded) return;
              res.write(`data: ${JSON.stringify({ type: 'token', requestId, token: content })}\n\n`);
              res.write(`data: ${JSON.stringify({
                type: 'done', requestId, full: content,
                meta: { requestId, attempts: 2, repaired: false, latencyMs: Date.now() - startedAt, mode: 'stream_fallback' },
              })}\n\n`);
              res.end();
            })
            .catch((error: Error) => closeWithError(error.message));
          return;
        }
        closeWithError(message);
      },
    },
  );

  activeStreams.set(requestId, handle);
  abortOnPrematureResponseClose(res, () => {
    clearInterval(heartbeat);
    handle.abort();
    activeStreams.delete(requestId);
  });
});

app.post('/api/llm/json', async (req: Request, res: Response) => {
  const opts = req.body as LlmStreamOptions;
  const requestId = uuidv4();
  const startedAt = Date.now();
  try {
    const config = resolveLlmConfig(getConfig(), opts.config);
    const result = await chatStructuredJSON({
      config,
      messages: opts.messages,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
      stream: false,
      responseKind: opts.responseKind,
      expectedItems: opts.expectedItems,
    });
    res.setHeader('X-LLM-Request-ID', requestId);
    res.json({
      ok: true,
      content: result.content,
      meta: { requestId, attempts: result.attempts, repaired: result.repaired, latencyMs: Date.now() - startedAt, mode: 'json' },
    });
  } catch (error) {
    const attempts = typeof (error as { attempts?: unknown }).attempts === 'number'
      ? (error as { attempts: number }).attempts
      : 1;
    res.status(400).json({
      ok: false,
      error: (error as Error).message,
      meta: { requestId, attempts, repaired: attempts > 1, latencyMs: Date.now() - startedAt, mode: 'json' },
    });
  }
});

app.post(['/api/llm/abort', '/api/llm/abort/:requestId'], (req: Request, res: Response) => {
  const requestId = req.params.requestId || String((req.body as { requestId?: unknown })?.requestId || '');
  activeStreams.get(requestId)?.abort();
  activeStreams.delete(requestId);
  res.json({ ok: true });
});

export default app;
