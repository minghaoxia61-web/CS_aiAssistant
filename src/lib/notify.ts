// 网页通知：封装 Notification API，权限请求 + 发送 + 点击跳转
// 场景：待背诵卡片到期、未完成测验、SOLO Agent 主动推送
// 降级：权限被拒时回退到应用内 Toast（由调用方处理）

/** 是否支持网页通知 */
export function isNotifySupported(): boolean {
  return typeof Notification !== 'undefined'
}

/** 当前权限状态 */
export function getNotifyPermission(): NotificationPermission {
  if (!isNotifySupported()) return 'denied'
  return Notification.permission
}

/** 请求通知权限（用户首次打开时调用） */
export async function requestNotifyPermission(): Promise<NotificationPermission> {
  if (!isNotifySupported()) return 'denied'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  try {
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}

export interface NotifyOptions {
  title: string
  body: string
  /** 点击通知后跳转的路径（如 /analytics） */
  onClickPath?: string
  /** 标签（同标签通知会替换，避免堆积） */
  tag?: string
}

/** 发送桌面通知（权限不足时静默失败，调用方应同时显示应用内 Toast） */
export function notify(opts: NotifyOptions): void {
  if (!isNotifySupported() || Notification.permission !== 'granted') return
  try {
    const n = new Notification(opts.title, {
      body: opts.body,
      tag: opts.tag,
      icon: '/favicon.ico',
    })
    if (opts.onClickPath) {
      n.onclick = () => {
        window.focus()
        window.location.hash = opts.onClickPath!
        n.close()
      }
    }
    // 5 秒后自动关闭（避免堆积）
    setTimeout(() => n.close(), 5000)
  } catch {
    // 部分浏览器在 Worker/iframe 中不可用，静默失败
  }
}
