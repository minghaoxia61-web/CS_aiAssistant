import type { IncomingMessage, ServerResponse } from 'node:http'

// 断开流式 fetch 会触发同一 Function 的 response.close 并取消上游请求；
// 独立 abort Function 只作为兼容确认端点。
export default function handler(_req: IncomingMessage, res: ServerResponse): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify({ ok: true }))
}
