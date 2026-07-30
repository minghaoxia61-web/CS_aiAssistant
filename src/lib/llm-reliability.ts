export type LlmErrorKind =
  | 'aborted'
  | 'auth'
  | 'rate_limit'
  | 'timeout'
  | 'network'
  | 'provider'
  | 'config'
  | 'unknown'

export interface LlmErrorInfo {
  kind: LlmErrorKind
  message: string
  retryable: boolean
}

const RETRYABLE_PATTERNS = [
  /socket hang up/i,
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /fetch failed/i,
  /network/i,
  /timeout/i,
  /timed out/i,
  /429/,
  /502/,
  /503/,
  /504/,
]

export function classifyLlmError(error: unknown): LlmErrorInfo {
  const raw = error instanceof Error ? error.message : String(error || '未知错误')
  const text = raw.trim()

  if (error instanceof DOMException && error.name === 'AbortError') {
    return { kind: 'aborted', message: '请求已取消', retryable: false }
  }
  if (/未配置.*API Key|API Key.*未配置|missing.*api.?key/i.test(text)) {
    return { kind: 'config', message: '尚未配置可用的 API Key，请前往设置页完成模型连接。', retryable: false }
  }
  if (/\b401\b|\b403\b|unauthorized|invalid.*api.?key|authentication/i.test(text)) {
    return { kind: 'auth', message: 'API Key 无效或没有访问该模型的权限。', retryable: false }
  }
  if (/\b429\b|rate.?limit|请求过于频繁/i.test(text)) {
    return { kind: 'rate_limit', message: '模型服务当前请求较多，已尝试重试，请稍后再试。', retryable: true }
  }
  if (/timeout|timed out|超时/i.test(text)) {
    return { kind: 'timeout', message: '模型响应超时，请检查网络后重试。', retryable: true }
  }
  if (/socket hang up|ECONNRESET|ECONNREFUSED|fetch failed|network|网络/i.test(text)) {
    return { kind: 'network', message: '暂时无法连接模型服务，请检查网络后重试。', retryable: true }
  }
  if (/\b5\d\d\b|provider|上游/i.test(text)) {
    return { kind: 'provider', message: '模型服务暂时不可用，请稍后重试。', retryable: true }
  }

  return {
    kind: 'unknown',
    message: text || '模型调用失败，请稍后重试。',
    retryable: RETRYABLE_PATTERNS.some((pattern) => pattern.test(text)),
  }
}

export function toLlmError(error: unknown): Error {
  const info = classifyLlmError(error)
  const normalized = new Error(info.message)
  normalized.name = info.kind === 'aborted' ? 'AbortError' : 'LlmError'
  return normalized
}

export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
