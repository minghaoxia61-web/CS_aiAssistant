import express, { type Request, type Response } from 'express';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { chatJSON, streamChat } from '../electron/llm';
import { resolveLlmConfig } from '../server/llm-config';
import { CATALOG, CATEGORIES } from '../server/knowledge/catalog';
import type { ApiConfig, LlmStreamOptions } from '../src/shared/types';

const app = express();
const activeStreams = new Map<string, { abort: () => void }>();

app.disable('x-powered-by');
app.use(express.json({ limit: '12mb' }));

// Vercel 将 /api/* 重写到此函数，并用 route 查询参数保留原始路径。
app.use((req, _res, next) => {
  const route = typeof req.query.route === 'string' ? req.query.route : '';
  if (route) req.url = `/${route}`;
  next();
});

function serverConfig(): ApiConfig {
  return {
    baseUrl: process.env.LLM_BASE_URL || 'https://api.deepseek.com',
    apiKey: process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || 'deepseek-v4-flash',
    temperature: 0.7,
    maxTokens: 0,
    topP: 1,
  };
}

function readArticle(slug: string): string | null {
  if (!CATALOG.some((article) => article.slug === slug)) return null;
  const file = path.join(process.cwd(), 'server', 'knowledge', `${slug}.md`);
  try {
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return null;
  }
}

app.get('/config', (_req, res) => {
  const config = serverConfig();
  res.json({ ...config, apiKey: '', hasKey: Boolean(config.apiKey) });
});

app.get('/knowledge/catalog', (_req, res) => {
  res.json({ categories: CATEGORIES, articles: CATALOG });
});

app.get('/knowledge', (_req, res) => {
  res.json(CATALOG.flatMap((article) => {
    const content = readArticle(article.slug);
    return content ? [{ ...article, content }] : [];
  }));
});

app.get('/knowledge/*', (req, res) => {
  const slug = req.params[0];
  const article = CATALOG.find((item) => item.slug === slug);
  const content = article ? readArticle(slug) : null;
  if (!article || !content) {
    res.status(404).json({ error: '文章不存在' });
    return;
  }
  res.json({ article, content, materialId: `knowledge:${slug}` });
});

app.post('/llm/json', async (req: Request, res: Response) => {
  const opts = req.body as LlmStreamOptions;
  try {
    const config = resolveLlmConfig(serverConfig(), opts.config);
    const content = await chatJSON({
      config,
      messages: opts.messages,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
      stream: false,
    });
    res.json({ ok: true, content });
  } catch (error) {
    res.status(400).json({ ok: false, error: (error as Error).message });
  }
});

app.post('/llm/stream', (req: Request, res: Response) => {
  const opts = req.body as LlmStreamOptions & { requestId?: string };
  const requestId = opts.requestId || crypto.randomUUID();
  let config: ApiConfig;
  try {
    config = resolveLlmConfig(serverConfig(), opts.config);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`data: ${JSON.stringify({ type: 'init', requestId })}\n\n`);

  const handle = streamChat(
    { config, messages: opts.messages, temperature: opts.temperature, maxTokens: opts.maxTokens, stream: true },
    {
      onToken: (token) => res.write(`data: ${JSON.stringify({ type: 'token', requestId, token })}\n\n`),
      onDone: (full) => {
        activeStreams.delete(requestId);
        res.write(`data: ${JSON.stringify({ type: 'done', requestId, full })}\n\n`);
        res.end();
      },
      onError: (message) => {
        activeStreams.delete(requestId);
        res.write(`data: ${JSON.stringify({ type: 'error', requestId, message })}\n\n`);
        res.end();
      },
    },
  );
  activeStreams.set(requestId, handle);
  req.on('close', () => {
    handle.abort();
    activeStreams.delete(requestId);
  });
});

app.post('/llm/abort/:requestId', (req, res) => {
  activeStreams.get(req.params.requestId)?.abort();
  activeStreams.delete(req.params.requestId);
  res.json({ ok: true });
});

export default app;
