export interface StreamResponseLifecycle {
  writableEnded: boolean;
  once(event: 'close', listener: () => void): unknown;
}

/** 仅在客户端提前断开 SSE 响应时取消上游请求。 */
export function abortOnPrematureResponseClose(
  response: StreamResponseLifecycle,
  abort: () => void,
): void {
  response.once('close', () => {
    if (!response.writableEnded) abort();
  });
}
