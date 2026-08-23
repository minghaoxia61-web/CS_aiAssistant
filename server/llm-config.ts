import type { ApiConfig } from '../src/shared/types';

const DEFAULT_ALLOWED_HOSTS = new Set([
  'open.bigmodel.cn',
  'api.deepseek.com',
  'api.openai.com',
  'dashscope.aliyuncs.com',
  'api.siliconflow.cn',
  'api.moonshot.cn',
  'gen.pollinations.ai',
]);

function allowedHosts(): Set<string> {
  const extra = (process.env.LLM_ALLOWED_HOSTS || '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_HOSTS, ...extra]);
}

export function validateLlmBaseUrl(baseUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error('模型 API 地址格式无效');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('模型 API 地址必须使用 HTTPS');
  }
  if (parsed.username || parsed.password || !allowedHosts().has(parsed.hostname.toLowerCase())) {
    throw new Error('该模型 API 域名未被服务端允许');
  }
  return parsed;
}

export function resolveLlmConfig(serverConfig: ApiConfig, clientConfig?: ApiConfig): ApiConfig {
  const baseUrl = clientConfig?.baseUrl?.trim() || serverConfig.baseUrl;
  validateLlmBaseUrl(baseUrl);
  const apiKey = serverConfig.apiKey || clientConfig?.apiKey || '';
  if (!apiKey) {
    throw new Error('未配置 API Key，请前往设置页添加，或在部署环境配置 LLM_API_KEY');
  }

  return {
    ...serverConfig,
    ...clientConfig,
    baseUrl,
    apiKey,
    model: clientConfig?.model?.trim() || serverConfig.model,
  };
}
