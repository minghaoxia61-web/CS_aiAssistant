// 智能对话页：基于资料的流式聊天
// 使用全局 chat-store，切换页面不丢失正在生成的回复
import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessagesSquare, Plus, Send, Square, FileText, History, Paperclip, Trash2, Copy, Check } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'
import Markdown from '@/components/Markdown'
import { useStore } from '@/lib/store'
import { useChatStore } from '@/lib/chat-store'
import { confirmDialog } from '@/lib/dialog'
import { estimateMaterialsTokens } from '@/lib/llm'
import { cn } from '@/lib/utils'
import type { Material } from '@/shared/types'

const QUICK_CMDS = [
  '总结这章的核心知识点',
  '解释这个概念并举例',
  '对比这两个概念的异同',
  '这道题的解题思路是什么？',
]

export default function Chat() {
  const { subjects, currentSubjectId, config, profile } = useStore()
  const {
    sessions, currentSession, streaming, streamPhase, error, localOnly,
    loadSessions, selectSession, send, stop, deleteSession, newSession, clearError, setLocalOnly,
  } = useChatStore()
  const [materials, setMaterials] = useState<Material[]>([])
  const [selectedMatIds, setSelectedMatIds] = useState<Set<string>>(new Set())
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
  const loadedSubjectRef = useRef<string | null>(null) // 避免重复加载同一科目

  const subject = subjects.find((s) => s.id === currentSubjectId)

  const loadMaterials = useCallback(async () => {
    if (!currentSubjectId) return
    const list = await window.api.getMaterials(currentSubjectId)
    setMaterials(list)
  }, [currentSubjectId])

  useEffect(() => {
    // 只在科目变化时加载（切换页面回来不重复加载，避免覆盖内存状态）
    if (currentSubjectId && loadedSubjectRef.current !== currentSubjectId) {
      loadedSubjectRef.current = currentSubjectId
      loadSessions(currentSubjectId)
      loadMaterials()
    }
  }, [currentSubjectId, loadSessions, loadMaterials])

  // 切换科目时重置选中
  useEffect(() => {
    setSelectedMatIds(new Set())
  }, [currentSubjectId])

  // 切换会话时同步选中资料
  useEffect(() => {
    if (currentSession) {
      setSelectedMatIds(new Set(currentSession.material_ids))
    }
  }, [currentSession?.id]) // eslint-disable-line

  // 智能滚动：只在用户已在底部时自动滚动
  // 流式输出时用 instant（避免高频 smooth 动画叠加抖动），非流式用 smooth
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const threshold = 80
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
  }, [])

  useEffect(() => {
    if (atBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: streaming ? 'auto' : 'smooth' })
    }
  }, [currentSession?.messages, streaming])

  const readyMaterials = materials.filter((m) => m.status === 'ready')
  const selectedMaterials = readyMaterials.filter((m) => selectedMatIds.has(m.id))
  const estimatedTokens = estimateMaterialsTokens(selectedMaterials)

  const toggleMaterial = (id: string) => {
    setSelectedMatIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    if (selectedMatIds.size === readyMaterials.length) setSelectedMatIds(new Set())
    else setSelectedMatIds(new Set(readyMaterials.map((m) => m.id)))
  }

  const handleNewChat = () => {
    if (currentSubjectId) {
      newSession(currentSubjectId)
      setSelectedMatIds(new Set())
    }
  }

  const handleSend = (text: string) => {
    if (!text.trim() || streaming || !config || !currentSubjectId) return
    send(text, config, currentSubjectId, selectedMatIds, readyMaterials, profile)
    setInput('')
    atBottomRef.current = true
  }

  const handleDeleteSession = async (id: string) => {
    if (!(await confirmDialog('删除该对话？', { danger: true }))) return
    deleteSession(id)
  }

  if (!currentSubjectId) {
    return (
      <div className="h-full overflow-y-auto">
        <PageHeader title="智能对话" subtitle="基于你的课程资料进行多轮问答复习" icon={<MessagesSquare className="w-5 h-5" />} />
        <EmptyState
          icon={<MessagesSquare className="w-7 h-7" />}
          title="请先选择或创建科目"
          desc="在左侧选择一个考试科目后，即可开始基于资料的智能对话。"
        />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="智能对话"
        subtitle={subject ? `当前科目：${subject.name}` : '基于你的课程资料进行多轮问答复习'}
        icon={<MessagesSquare className="w-5 h-5" />}
        actions={
          <button className="btn-outline" onClick={handleNewChat}>
            <Plus className="w-4 h-4" /> 新对话
          </button>
        }
      />

      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：会话 + 上下文 */}
        <div className="w-64 shrink-0 border-r border-amber/8 flex flex-col bg-ink-850/40">
          {/* 会话历史 */}
          <div className="flex-1 overflow-y-auto px-3 py-4">
            <div className="flex items-center gap-2 px-2 mb-2 text-bone-muted">
              <History className="w-3.5 h-3.5" />
              <span className="label !mb-0">对话历史</span>
            </div>
            <div className="space-y-1">
              {sessions.length === 0 && <p className="px-2 text-xs text-bone-faint">暂无对话</p>}
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className={cn(
                    'group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-all',
                    currentSession?.id === s.id ? 'bg-amber/10 text-amber' : 'text-bone-dim hover:bg-ink-800/50'
                  )}
                  onClick={() => selectSession(s)}
                >
                  <span className="flex-1 text-sm truncate">{s.title}</span>
                  <button
                    className="opacity-0 group-hover:opacity-100 text-bone-faint hover:text-rust text-xs"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteSession(s.id)
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 上下文资料 */}
          <div className="border-t border-amber/8 px-3 py-4 max-h-[45%] flex flex-col">
            <div className="flex items-center justify-between px-2 mb-2">
              <div className="flex items-center gap-2">
                <Paperclip className="w-3.5 h-3.5 text-bone-muted" />
                <span className="label !mb-0">引用资料</span>
              </div>
              {readyMaterials.length > 0 && (
                <button className="text-xs text-amber hover:text-amber-glow" onClick={selectAll}>
                  {selectedMatIds.size === readyMaterials.length ? '取消全选' : '全选'}
                </button>
              )}
            </div>
            <div className="overflow-y-auto flex-1 space-y-1">
              {readyMaterials.length === 0 && (
                <p className="px-2 text-xs text-bone-faint">暂无可用资料</p>
              )}
              {readyMaterials.map((m) => (
                <label
                  key={m.id}
                  className="flex items-start gap-2 px-2.5 py-1.5 rounded-lg hover:bg-ink-800/50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedMatIds.has(m.id)}
                    onChange={() => toggleMaterial(m.id)}
                    className="mt-0.5 accent-amber"
                  />
                  <span className="text-xs text-bone-dim leading-snug flex-1">{m.filename}</span>
                </label>
              ))}
            </div>
            {/* Token 估算提示 */}
            {selectedMatIds.size > 0 && (
              <div className={cn('mt-2 px-2 py-1.5 rounded text-[10px]', estimatedTokens > 30000 ? 'text-moss bg-moss/8' : 'text-bone-faint bg-ink-850/60')}>
                ≈ {estimatedTokens.toLocaleString()} tokens
                {estimatedTokens > 30000 ? ' · RAG 检索模式（仅发送相关片段）' : ' · 全量发送'}
              </div>
            )}
          </div>
        </div>

        {/* 主对话区 */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* 消息列表 */}
          <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-8 py-6">
            {!currentSession || currentSession.messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 rounded-2xl bg-amber/8 border border-amber/15 flex items-center justify-center text-amber/60 mb-5">
                  <MessagesSquare className="w-7 h-7" />
                </div>
                <h3 className="font-display text-2xl text-bone mb-2">开始你的复习对话</h3>
                <p className="text-sm text-bone-muted max-w-md mb-6">
                  {selectedMatIds.size > 0
                    ? `已引用 ${selectedMatIds.size} 份资料，AI 将基于这些内容回答`
                    : '勾选左侧资料作为上下文，AI 会优先基于资料内容作答'}
                </p>
                <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                  {QUICK_CMDS.map((cmd) => (
                    <button
                      key={cmd}
                      className="chip border-amber/20 text-bone-dim hover:border-amber/40 hover:text-amber"
                      onClick={() => handleSend(cmd)}
                    >
                      {cmd}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto space-y-5">
                {currentSession.messages.map((m) => (
                  <MessageBubble key={m.id} message={m} streaming={streaming} />
                ))}
              </div>
            )}
          </div>

          {/* 流式阶段提示 */}
          {streaming && streamPhase !== 'idle' && (
            <div className="px-8 py-1.5 text-xs text-amber flex items-center gap-2 animate-fade-in">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber animate-pulse-soft" />
              {streamPhase === 'retrieving' ? '检索知识点中…' : 'AI 推理中…'}
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div className="px-8 py-2 text-xs text-rust flex items-center gap-2">
              <span className="flex-1">{error}</span>
              <button className="text-bone-faint hover:text-bone" onClick={clearError}>×</button>
            </div>
          )}

          {/* 输入区 */}
          <div className="border-t border-amber/8 px-8 py-4 bg-ink-850/40">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-end gap-2 bg-ink-850/80 border border-amber/12 rounded-2xl p-2 focus-within:border-amber/35 transition-colors">
                <textarea
                  className="flex-1 bg-transparent resize-none outline-none text-sm text-bone placeholder:text-bone-faint px-2 py-2 max-h-32 min-h-[40px]"
                  placeholder={config ? '输入你的问题，回车发送，Shift+回车换行' : '请先在设置页配置 API'}
                  value={input}
                  disabled={!config || streaming}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend(input)
                    }
                  }}
                  rows={1}
                />
                {streaming ? (
                  <button className="btn-ghost !px-3 text-rust" onClick={stop}>
                    <Square className="w-4 h-4" /> 停止
                  </button>
                ) : (
                  <button
                    className="btn-primary !px-3 !py-2 disabled:opacity-40 disabled:cursor-not-allowed"
                    disabled={!input.trim() || !config}
                    onClick={() => handleSend(input)}
                  >
                    <Send className="w-4 h-4" />
                  </button>
                )}
              </div>
              {selectedMatIds.size > 0 && (
                <div className="flex items-center gap-1.5 mt-2 text-xs text-bone-muted">
                  <FileText className="w-3 h-3" />
                  引用 {selectedMatIds.size} 份资料 · ≈{estimatedTokens.toLocaleString()} tokens{estimatedTokens > 30000 ? ' · RAG' : ''}
                </div>
              )}
              <div className="flex items-center gap-3 mt-2">
                <button
                  className={cn('flex items-center gap-1.5 text-xs transition-colors', localOnly ? 'text-amber' : 'text-bone-faint hover:text-bone-muted')}
                  onClick={() => setLocalOnly(!localOnly)}
                  title="开启后AI仅基于已选资料回答，不引入外部知识"
                >
                  <span className={cn('inline-flex items-center justify-center w-7 h-3.5 rounded-full transition-colors', localOnly ? 'bg-amber' : 'bg-ink-700')}>
                    <span className={cn('inline-block w-2.5 h-2.5 rounded-full bg-white transition-transform', localOnly && 'translate-x-3.5')} />
                  </span>
                  仅用本地资料
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MessageBubble({ message, streaming }: { message: { id: string; role: string; content: string }; streaming: boolean }) {
  const isUser = message.role === 'user'
  const isEmpty = !message.content && !isUser
  const [copied, setCopied] = useState(false)
  const [showActions, setShowActions] = useState(false)
  const navigate = useNavigate()

  const copyContent = () => {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // 快捷操作：将AI回答内容传递到复习/测验页面
  const goToReview = () => {
    sessionStorage.setItem('ai_content_for_review', message.content)
    navigate('/review')
  }
  const goToQuiz = () => {
    sessionStorage.setItem('ai_content_for_quiz', message.content)
    navigate('/quiz')
  }
  const copyConcise = () => {
    navigator.clipboard.writeText(message.content)
    // 触发一个精简请求
    sessionStorage.setItem('ai_content_concise', message.content)
    navigate('/chat')
  }

  return (
    <div className={cn('flex gap-3 animate-slide-up', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-medium',
          isUser ? 'bg-amber text-white' : 'bg-sage/20 text-sage-glow border border-sage/25'
        )}
      >
        {isUser ? '我' : 'AI'}
      </div>
      <div
        className={cn(
          'rounded-2xl px-4 py-3 max-w-[85%] group relative',
          isUser ? 'bg-amber/12 border border-amber/20' : 'bg-ink-850/70 border border-amber/8'
        )}
      >
        {isEmpty ? (
          <span className="stream-cursor text-bone-muted text-sm">思考中</span>
        ) : isUser ? (
          <p className="text-sm text-bone whitespace-pre-wrap">{message.content}</p>
        ) : (
          <>
            <Markdown content={message.content} className={streaming ? 'stream-cursor' : ''} streaming={streaming} />
            {!streaming && message.content && (
              <div className="absolute top-1 right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={copyContent}
                  className="text-bone-faint hover:text-amber p-1 rounded transition-colors"
                  title="复制"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-sage-glow" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={goToReview}
                  className="text-bone-faint hover:text-amber p-1 rounded transition-colors text-[10px]"
                  title="生成复习卡片"
                >
                  卡片
                </button>
                <button
                  onClick={goToQuiz}
                  className="text-bone-faint hover:text-amber p-1 rounded transition-colors text-[10px]"
                  title="生成自测题"
                >
                  测验
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
