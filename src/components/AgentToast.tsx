// SOLO Agent 主动推送 Toast：右下角滑入卡片，支持操作/稍后/忽略
// 启动时触发 Agent 检查，多条建议排队展示
import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, X, ChevronRight, Bell } from 'lucide-react'
import { useStore } from '@/lib/store'
import {
  runAgentChecks,
  notifySuggestions,
  type AgentSuggestion,
} from '@/lib/solo-agent'
import { requestNotifyPermission } from '@/lib/notify'
import { cn } from '@/lib/utils'

const DISMISS_KEY = 'solo_agent_dismissed'

/** 加载已忽略的建议 id（本次会话内不再弹出） */
function loadDismissed(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(DISMISS_KEY) || '[]'))
  } catch {
    return new Set()
  }
}

function saveDismissed(set: Set<string>): void {
  try {
    sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...set]))
  } catch {
    // 忽略
  }
}

const typeIcon = (type: AgentSuggestion['type']) => {
  switch (type) {
    case 'weak-drill':
      return '🎯'
    case 'high-freq-wrong':
      return '⚠️'
    case 'daily-report':
      return '📊'
    case 'review-streak':
      return '🔥'
    case 'pending-todo':
      return '📋'
    default:
      return '💡'
  }
}

const priorityBorder = (priority: AgentSuggestion['priority']) => {
  switch (priority) {
    case 'high':
      return 'border-rust/40'
    case 'medium':
      return 'border-amber/30'
    default:
      return 'border-sage/25'
  }
}

export default function AgentToast() {
  const navigate = useNavigate()
  const { subjects } = useStore()
  const [queue, setQueue] = useState<AgentSuggestion[]>([])
  const [current, setCurrent] = useState<AgentSuggestion | null>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(loadDismissed)
  const [visible, setVisible] = useState(false)

  // 首次挂载：请求通知权限
  useEffect(() => {
    requestNotifyPermission().catch(() => {})
  }, [])

  // 科目加载后触发 Agent 检查（延迟 3s，避免与首屏加载竞争）
  useEffect(() => {
    if (subjects.length === 0) return
    const timer = setTimeout(async () => {
      try {
        const suggestions = await runAgentChecks(subjects)
        // 过滤掉本次会话已忽略的
        const filtered = suggestions.filter((s) => !dismissed.has(s.id))
        if (filtered.length > 0) {
          notifySuggestions(filtered)
          setQueue(filtered)
        }
      } catch {
        // Agent 检查失败不影响主流程
      }
    }, 3000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjects.length])

  // 从队列取下一条展示
  useEffect(() => {
    if (!current && queue.length > 0) {
      const next = queue[0]
      setCurrent(next)
      setQueue((q) => q.slice(1))
      // 入场动画
      requestAnimationFrame(() => setVisible(true))
    }
  }, [current, queue])

  const dismiss = useCallback(
    (suggestion: AgentSuggestion) => {
      setVisible(false)
      const newDismissed = new Set(dismissed)
      newDismissed.add(suggestion.id)
      setDismissed(newDismissed)
      saveDismissed(newDismissed)
      // 等退场动画后再切下一条
      setTimeout(() => setCurrent(null), 300)
    },
    [dismissed],
  )

  const handleAction = useCallback(
    (suggestion: AgentSuggestion) => {
      // 先切换科目（若有），再导航
      if (suggestion.subjectId) {
        useStore.getState().selectSubject(suggestion.subjectId)
      }
      if (suggestion.actionPath) {
        navigate(suggestion.actionPath)
      }
      dismiss(suggestion)
    },
    [dismiss, navigate],
  )

  if (!current) return null

  return (
    <div className="fixed bottom-6 right-6 z-50 pointer-events-none">
      <div
        className={cn(
          'pointer-events-auto w-80 rounded-2xl glass border shadow-glow backdrop-blur-xl overflow-hidden transition-all duration-300',
          priorityBorder(current.priority),
          visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
        )}
      >
        {/* 头部 */}
        <div className="flex items-center gap-2 px-4 pt-3 pb-2 bg-amber/5">
          <Sparkles className="w-3.5 h-3.5 text-amber shrink-0" />
          <span className="text-[10px] font-medium text-amber-dim tracking-wider uppercase">
            SOLO Agent
          </span>
          <span className="text-base ml-0.5">{typeIcon(current.type)}</span>
          <button
            onClick={() => dismiss(current)}
            className="ml-auto p-1 rounded-md hover:bg-ink-700/50 text-bone-faint hover:text-bone transition-colors"
            aria-label="关闭"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 正文 */}
        <div className="px-4 py-3 space-y-2.5">
          <h4 className="text-sm font-semibold text-bone leading-snug">{current.title}</h4>
          <p className="text-xs text-bone-dim leading-relaxed line-clamp-3">{current.message}</p>

          {/* 操作按钮 */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => handleAction(current)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber/15 hover:bg-amber/25 text-amber text-xs font-medium transition-colors"
            >
              {current.actionLabel}
              <ChevronRight className="w-3 h-3" />
            </button>
            <button
              onClick={() => dismiss(current)}
              className="px-3 py-1.5 rounded-lg hover:bg-ink-700/50 text-bone-faint hover:text-bone-dim text-xs transition-colors"
            >
              稍后
            </button>
            {queue.length > 0 && (
              <span className="ml-auto text-[10px] text-bone-faint">{queue.length} 条待看</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** 通知权限请求按钮（设置页可用） */
export function NotifyPermissionButton() {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied',
  )

  const handleRequest = async () => {
    const result = await requestNotifyPermission()
    setPermission(result)
  }

  if (permission === 'granted') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-sage-glow">
        <Bell className="w-3.5 h-3.5" />
        <span>通知已开启</span>
      </div>
    )
  }

  return (
    <button
      onClick={handleRequest}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass border border-amber/15 hover:border-amber/30 text-xs text-bone-dim hover:text-bone transition-colors"
    >
      <Bell className="w-3.5 h-3.5" />
      <span>{permission === 'denied' ? '通知已被浏览器拦截' : '开启桌面通知'}</span>
    </button>
  )
}
