// 主进程 LLM 客户端：通过 Node https 调用 OpenAI 兼容接口
// 在主进程发起请求，避免渲染进程的 CORS 问题，且 API Key 不暴露到前端
import * as https from 'https';
import * as http from 'http';
import * as url from 'url';
import type { ApiConfig, LlmMessage } from '../src/shared/types';

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onDone: (full: string) => void;
  onError: (message: string) => void;
}

export interface ChatRequestOptions {
  config: ApiConfig;
  messages: LlmMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

/** 构建请求体 */
function buildBody(opts: ChatRequestOptions): string {
  const { config, messages, temperature, maxTokens, stream } = opts;
  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    stream: stream ?? false,
    temperature: temperature ?? config.temperature,
    top_p: config.topP,
  };
  // maxTokens: 0 表示不限制（不传 max_tokens 参数），由模型自行决定最大输出长度
  const effectiveMax = maxTokens ?? config.maxTokens;
  if (effectiveMax && effectiveMax > 0) {
    body.max_tokens = effectiveMax;
  }
  return JSON.stringify(body);
}

/** 发起请求，返回 { req, abort }。abort 用于中止请求。 */
function createRequest(
  config: ApiConfig,
  body: string,
  onData: (chunk: Buffer) => void,
  onEnd: () => void,
  onError: (message: string) => void,
): { abort: () => void } {
  // 兼容 Pollinations 等完整端点：若 baseUrl 已含路径（如 /openai），直接用作请求 URL；
  // 若为版本前缀（/v1, /v4 等）或纯域名，按 OpenAI 标准拼接 /chat/completions
  const trimmedBase = config.baseUrl.replace(/\/$/, '');
  const hasEndpointPath = /\/[^/]+\.[^/]+\/.+/.test(trimmedBase) && !/\/v\d+$/.test(trimmedBase);
  const requestUrl = hasEndpointPath ? trimmedBase : `${trimmedBase}/chat/completions`;
  const target = url.parse(requestUrl);
  const isHttps = target.protocol === 'https:';
  const lib = isHttps ? https : http;

  const headers: Record<string, string | number> = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  };
  // 仅当配置了 API Key 时才携带 Authorization 头（Pollinations 免费层无需鉴权）
  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  const options: https.RequestOptions = {
    hostname: target.hostname,
    port: target.port || (isHttps ? 443 : 80),
    path: target.path,
    method: 'POST',
    headers,
  };

  const req = lib.request(options, (res) => {
    // 非 2xx 状态码：收集错误信息
    if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
      let errBuf = '';
      res.setEncoding('utf-8');
      res.on('data', (c) => (errBuf += c));
      res.on('end', () => {
        const snippet = errBuf.slice(0, 400) || res.statusMessage || '';
        onError(`API 请求失败 (${res.statusCode})：${snippet}`);
      });
      return;
    }

    res.on('data', onData);
    res.on('end', onEnd);
  });

  req.on('error', (e) => {
    onError(e.message);
  });

  req.write(body);
  req.end();

  return { abort: () => req.destroy() };
}

/**
 * 流式调用：逐 token 回调，返回 abort 函数
 */
export function streamChat(
  opts: ChatRequestOptions,
  cb: StreamCallbacks,
): { abort: () => void } {
  const body = buildBody({ ...opts, stream: true });
  let buffer = '';
  let full = '';
  let aborted = false;

  return createRequest(
    opts.config,
    body,
    (chunk: Buffer) => {
      if (aborted) return;
      buffer += chunk.toString('utf-8');
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          const token = json.choices?.[0]?.delta?.content;
          if (token) {
            full += token;
            cb.onToken(token);
          }
        } catch {
          // 忽略不完整 JSON
        }
      }
    },
    () => {
      if (!aborted) cb.onDone(full);
    },
    (msg) => {
      if (!aborted) cb.onError(msg);
    },
  );
}

/**
 * 非流式调用：返回完整内容字符串
 */
export function chatJSON(opts: ChatRequestOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = buildBody({ ...opts, stream: false });
    let data = '';

    createRequest(
      opts.config,
      body,
      (chunk: Buffer) => {
        data += chunk.toString('utf-8');
      },
      () => {
        try {
          const json = JSON.parse(data);
          resolve(json.choices?.[0]?.message?.content || '');
        } catch (e) {
          reject(new Error(`解析 API 响应失败：${(e as Error).message}`));
        }
      },
      (msg) => reject(new Error(msg)),
    );
  });
}

// ---------- 多模态视觉调用（用于图片 OCR） ----------
/** 多模态消息内容片段：文本或图片 */
export type VisionContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface VisionMessage {
  role: 'system' | 'user' | 'assistant';
  content: VisionContentPart[];
}

export interface VisionRequestOptions {
  config: ApiConfig;
  messages: VisionMessage[];
  temperature?: number;
  maxTokens?: number;
}

/**
 * 多模态非流式调用：发送含图片的消息，返回完整文本内容。
 * 用于图片 OCR：将图片以 base64 data URL 形式发送给视觉模型。
 */
export function visionJSON(opts: VisionRequestOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const { config, messages, temperature, maxTokens } = opts;
    const bodyObj: Record<string, unknown> = {
      model: config.model,
      messages,
      stream: false,
      temperature: temperature ?? config.temperature,
      top_p: config.topP,
    };
    const effectiveMax = maxTokens ?? config.maxTokens;
    if (effectiveMax && effectiveMax > 0) {
      bodyObj.max_tokens = effectiveMax;
    }
    const body = JSON.stringify(bodyObj);
    let data = '';

    createRequest(
      config,
      body,
      (chunk: Buffer) => {
        data += chunk.toString('utf-8');
      },
      () => {
        try {
          const json = JSON.parse(data);
          resolve(json.choices?.[0]?.message?.content || '');
        } catch (e) {
          reject(new Error(`解析视觉 API 响应失败：${(e as Error).message}`));
        }
      },
      (msg) => reject(new Error(msg)),
    );
  });
}
