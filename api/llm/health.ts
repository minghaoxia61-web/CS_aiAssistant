import type { IncomingMessage, ServerResponse } from 'node:http'

// 独立健康检查不加载任何业务模块，用于验证 Vercel Function 冷启动状态。
export default function handler(_req: IncomingMessage, res: ServerResponse): void {
  let provider = 'invalid'
  const baseUrl = process.env.LLM_BASE_URL || 'https://api.deepseek.com'
  try {
    provider = new URL(baseUrl).hostname
  } catch {
    // 只返回脱敏状态。
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify({
    ok: true,
    provider,
    model: process.env.LLM_MODEL || 'deepseek-v4-flash',
    deploymentKeyConfigured: Boolean(process.env.LLM_API_KEY),
    byokSupported: true,
    structuredRepair: true,
    streaming: true,
  }))
}
