import * as fs from 'node:fs';
import * as path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { CATALOG, CATEGORIES } from '../server/knowledge/catalog';

interface VercelRequest extends IncomingMessage {
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
}

interface ModelConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

const ALLOWED_HOSTS = new Set([
  'open.bigmodel.cn', 'api.deepseek.com', 'api.openai.com', 'dashscope.aliyuncs.com',
  'api.siliconflow.cn', 'api.moonshot.cn', 'text.pollinations.ai',
]);
const activeStreams = new Map<string, AbortController>();

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(value));
}

function serverConfig(): ModelConfig {
  return {
    baseUrl: process.env.LLM_BASE_URL || 'https://api.deepseek.com',
    apiKey: process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || 'deepseek-v4-flash',
    temperature: 0.7, maxTokens: 0, topP: 1,
  };
}

function readArticle(slug: string): string | null {
  if (!CATALOG.some((article) => article.slug === slug)) return null;
  try {
    return fs.readFileSync(path.join(process.cwd(), 'server', 'knowledge', `${slug}.md`), 'utf-8');
  } catch {
    return null;
  }
}

async function readBody(req: VercelRequest): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === 'object') return req.body as Record<string, unknown>;
  if (typeof req.body === 'string') return JSON.parse(req.body) as Record<string, unknown>;
  let raw = '';
  for await (const chunk of req) raw += String(chunk);
  return raw ? JSON.parse(raw) as Record<string, unknown> : {};
}

function resolveConfig(client?: Partial<ModelConfig>): ModelConfig {
  const deployed = serverConfig();
  const config = { ...deployed, ...client, apiKey: deployed.apiKey || client?.apiKey || '' };
  const parsed = new URL(config.baseUrl);
  const extra = (process.env.LLM_ALLOWED_HOSTS || '').split(',').map((item) => item.trim()).filter(Boolean);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !new Set([...ALLOWED_HOSTS, ...extra]).has(parsed.hostname)) {
    throw new Error('该模型 API 地址未被服务端允许');
  }
  if (!config.apiKey && parsed.hostname !== 'text.pollinations.ai') {
    throw new Error('未配置 API Key，请前往设置页添加，或在部署环境配置 LLM_API_KEY');
  }
  return config;
}

function completionUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/$/, '');
  return normalized.endsWith('/chat/completions') ? normalized : `${normalized}/chat/completions`;
}

function modelPayload(body: Record<string, unknown>, config: ModelConfig, stream: boolean): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    model: config.model, messages: body.messages, stream,
    temperature: body.temperature ?? config.temperature, top_p: config.topP,
  };
  const maxTokens = Number(body.maxTokens ?? config.maxTokens ?? 0);
  if (maxTokens > 0) payload.max_tokens = maxTokens;
  return payload;
}

async function callModel(body: Record<string, unknown>, config: ModelConfig, stream: boolean, signal?: AbortSignal): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  return fetch(completionUrl(config.baseUrl), {
    method: 'POST', headers, body: JSON.stringify(modelPayload(body, config, stream)), signal,
  });
}

async function handleLlmJson(req: VercelRequest, res: ServerResponse): Promise<void> {
  try {
    const body = await readBody(req);
    const config = resolveConfig(body.config as Partial<ModelConfig> | undefined);
    const upstream = await callModel(body, config, false);
    const data = await upstream.json() as { choices?: Array<{ message?: { content?: string } }>; error?: unknown };
    if (!upstream.ok) {
      sendJson(res, upstream.status, { ok: false, error: data.error || `模型请求失败 (${upstream.status})` });
      return;
    }
    sendJson(res, 200, { ok: true, content: data.choices?.[0]?.message?.content || '' });
  } catch (error) {
    sendJson(res, 400, { ok: false, error: (error as Error).message });
  }
}

async function handleLlmStream(req: VercelRequest, res: ServerResponse): Promise<void> {
  let requestId = '';
  try {
    const body = await readBody(req);
    requestId = typeof body.requestId === 'string' ? body.requestId : crypto.randomUUID();
    const config = resolveConfig(body.config as Partial<ModelConfig> | undefined);
    const controller = new AbortController();
    activeStreams.set(requestId, controller);
    const upstream = await callModel(body, config, true, controller.signal);
    if (!upstream.ok || !upstream.body) {
      sendJson(res, upstream.status, { error: await upstream.text() || `模型请求失败 (${upstream.status})` });
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no',
    });
    res.write(`data: ${JSON.stringify({ type: 'init', requestId })}\n\n`);
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const event = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
          const token = event.choices?.[0]?.delta?.content;
          if (token) {
            full += token;
            res.write(`data: ${JSON.stringify({ type: 'token', requestId, token })}\n\n`);
          }
        } catch { /* 忽略上游的不完整事件。 */ }
      }
    }
    res.write(`data: ${JSON.stringify({ type: 'done', requestId, full })}\n\n`);
    res.end();
  } catch (error) {
    if (!res.headersSent) sendJson(res, 400, { error: (error as Error).message });
    else {
      res.write(`data: ${JSON.stringify({ type: 'error', requestId, message: (error as Error).message })}\n\n`);
      res.end();
    }
  } finally {
    if (requestId) activeStreams.delete(requestId);
  }
}

export default async function handler(req: VercelRequest, res: ServerResponse): Promise<void> {
  const requestUrl = new URL(req.url || '/', 'http://localhost');
  const queryRoute = typeof req.query?.route === 'string' ? req.query.route : requestUrl.searchParams.get('route');
  const route = `/${(queryRoute || '').replace(/^\/+/, '')}`;

  if (req.method === 'GET' && route === '/config') {
    const config = serverConfig();
    sendJson(res, 200, { ...config, apiKey: '', hasKey: Boolean(config.apiKey) });
    return;
  }
  if (req.method === 'GET' && route === '/knowledge/catalog') {
    sendJson(res, 200, { categories: CATEGORIES, articles: CATALOG });
    return;
  }
  if (req.method === 'GET' && route === '/knowledge') {
    sendJson(res, 200, CATALOG.flatMap((article) => {
      const content = readArticle(article.slug);
      return content ? [{ ...article, content }] : [];
    }));
    return;
  }
  if (req.method === 'GET' && route.startsWith('/knowledge/')) {
    const slug = route.slice('/knowledge/'.length);
    const article = CATALOG.find((item) => item.slug === slug);
    const content = article ? readArticle(slug) : null;
    sendJson(res, article && content ? 200 : 404, article && content
      ? { article, content, materialId: `knowledge:${slug}` }
      : { error: '文章不存在' });
    return;
  }
  if (req.method === 'POST' && route === '/llm/json') {
    await handleLlmJson(req, res);
    return;
  }
  if (req.method === 'POST' && route === '/llm/stream') {
    await handleLlmStream(req, res);
    return;
  }
  if (req.method === 'POST' && route.startsWith('/llm/abort/')) {
    const requestId = route.slice('/llm/abort/'.length);
    activeStreams.get(requestId)?.abort();
    activeStreams.delete(requestId);
    sendJson(res, 200, { ok: true });
    return;
  }
  sendJson(res, 404, { error: 'API 路由不存在' });
}
