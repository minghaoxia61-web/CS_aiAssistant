// 智能对话页：基于资料的流式聊天
import { useEffect, useState, useRef, useCallback } from 'react'
import { MessagesSquare, Plus, Send, Square, FileText, History, Paperclip, Trash2 } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'
import Markdown from '@/components/Markdown'
import { useStore } from '@/lib/store'
import { confirmDialog } from '@/lib/dialog'
import { streamChat, buildContext, SYSTEM_PROMPTS } from '@/lib/llm'
import { formatTime, cn } from '@/lib/utils'
import type { ChatSession, ChatMessage, Material } from '@/shared/types'
import { v4 as uuidv4 } from 'uuid'

const QUICK_CMDS = [
  '总结这章的核心知识点',
  '解释这个概念并举例',
  '对比这两个概念的异同',
  '这道题的解题思路是什么？',
]

export default function Chat() {
  const { subjects, currentSubjectId, config } = useStore()
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null)
  const [materials, setMaterials] = useState<Material[]>([])
  const [selectedMatIds, setSelectedMatIds] = useState<Set<string>>(new Set())
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const subject = subjects.find((s) => s.id === currentSubjectId)

  const loadSessions = useCallback(async () => {
    if (!currentSubjectId) return
    const list = await window.api.listChatSessions(currentSubjectId)
    setSessions(list)
    if (list.length > 0 && !currentSession) setCurrentSession(list[0])
  }, [currentSubjectId, currentSession])

  const loadMaterials = useCallback(async () => {
    if (!currentSubjectId) return
    const list = await window.api.getMaterials(currentSubjectId)
    setMaterials(list)
  }, [currentSubjectId])

  useEffect(() => {
    loadSessions()
    loadMaterials()
  }, [loadSessions, loadMaterials])

  // 切换科目时重置
  useEffect(() => {
    setCurrentSession(null)
    setSelectedMatIds(new Set())
  }, [currentSubjectId])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [currentSession?.messages])

  const readyMaterials = materials.filter((m) => m.status === 'ready')

  const newSession = (): ChatSession => ({
    id: uuidv4(),
    title: '新对话',
    subject_id: currentSubjectId!,
    material_ids: [],
    messages: [],
    created_at: Date.now(),
  })

  const handleNewChat = () => {
    const s = newSession()
    setCurrentSession(s)
    setSelectedMatIds(new Set())
  }

  const toggleMaterial = (id: string) => {
    setSelectedMatIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const persistSession = async (s: ChatSession) => {
    await window.api.saveChatSession(s)
    setSessions((prev) => {
      const idx = prev.findIndex((x) => x.id === s.id)
      if (idx >= 0) {
        const copy = [...prev]
        copy[idx] = s
        return copy
      }
      return [s, ...prev]
    })
  }

  const send = async (text: string) => {
    if (!text.trim() || streaming || !config?.apiKey) return
    // 没有会话时自动创建一个，并继续发送（不再 return 丢消息）
    let session = currentSession
    if (!session) {
      session = newSession()
      setCurrentSession(session)
    }
    const userMsg: ChatMessage = {
      id: uuidv4(),
      session_id: session.id,
      role: 'user',
      content: text.trim(),
      created_at: Date.now(),
    }
    const assistantMsg: ChatMessage = {
      id: uuidv4(),
      session_id: session.id,
      role: 'assistant',
      content: '',
      created_at: Date.now(),
    }

    const updatedMessages = [...session.messages, userMsg, assistantMsg]
    const title = session.messages.length === 0 ? text.trim().slice(0, 24) : session.title
    const updated: ChatSession = {
      ...session,
      title,
      material_ids: Array.from(selectedMatIds),
      messages: updatedMessages,
    }
    setCurrentSession(updated)

    // 构建上下文
    const ctxMaterials = readyMaterials.filter((m) => selectedMatIds.has(m.id))
    const context = buildContext(ctxMaterials)
    const systemContent = context
      ? `${SYSTEM_PROMPTS.chat}\n\n以下是用户提供的课程资料，请优先基于这些内容回答：\n${context}`
      : SYSTEM_PROMPTS.chat

    const apiMessages = [
      { role: 'system' as const, content: systemContent },
      ...updatedMessages
        .filter((m) => m.id !== assistantMsg.id)
        .map((m) => ({ role: m.role, content: m.content })),
    ]

    setStreaming(true)
    abortRef.current = new AbortController()
    let acc = ''
    try {
      await streamChat({
        config,
        messages: apiMessages,
        signal: abortRef.current.signal,
        onToken: (t) => {
          acc += t
          setCurrentSession((prev) => {
            if (!prev) return prev
            const msgs = prev.messages.map((m) =>
              m.id === assistantMsg.id ? { ...m, content: acc } : m
            )
            return { ...prev, messages: msgs }
          })
        },
      })
      const finalMessages = updatedMessages.map((m) =>
        m.id === assistantMsg.id ? { ...m, content: acc } : m
      )
      const finalSession = { ...updated, messages: finalMessages }
      setCurrentSession(finalSession)
      await persistSession(finalSession)
    } catch (e) {
      const errText = (e as Error).name === 'AbortError' ? '（已停止）' : `⚠️ ${(e as Error).message}`
      const finalMessages = updatedMessages.map((m) =>
        m.id === assistantMsg.id ? { ...m, content: acc + '\n\n' + errText } : m
      )
      const finalSession = { ...updated, messages: finalMessages }
      setCurrentSession(finalSession)
      await persistSession(finalSession)
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }

  const stop = () => abortRef.current?.abort()

  const handleDeleteSession = async (id: string) => {
    if (!(await confirmDialog('删除该对话？', { danger: true }))) return
    await window.api.deleteChatSession(id)
    setSessions((prev) => prev.filter((s) => s.id !== id))
    if (currentSession?.id === id) setCurrentSession(null)
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
                  onClick={() => {
                    setCurrentSession(s)
                    setSelectedMatIds(new Set(s.material_ids))
                  }}
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
            <div className="flex items-center gap-2 px-2 mb-2">
              <Paperclip className="w-3.5 h-3.5 text-bone-muted" />
              <span className="label !mb-0">引用资料</span>
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
          </div>
        </div>

        {/* 主对话区 */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* 消息列表 */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-8 py-6">
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
                      onClick={() => send(cmd)}
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

          {/* 输入区 */}
          <div className="border-t border-amber/8 px-8 py-4 bg-ink-850/40">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-end gap-2 bg-ink-850/80 border border-amber/12 rounded-2xl p-2 focus-within:border-amber/35 transition-colors">
                <textarea
                  className="flex-1 bg-transparent resize-none outline-none text-sm text-bone placeholder:text-bone-faint px-2 py-2 max-h-32 min-h-[40px]"
                  placeholder={config?.apiKey ? '输入你的问题，回车发送，Shift+回车换行' : '请先在设置页配置 API'}
                  value={input}
                  disabled={!config?.apiKey}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      send(input)
                      setInput('')
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
                    disabled={!input.trim() || !config?.apiKey}
                    onClick={() => {
                      send(input)
                      setInput('')
                    }}
                  >
                    <Send className="w-4 h-4" />
                  </button>
                )}
              </div>
              {selectedMatIds.size > 0 && (
                <div className="flex items-center gap-1.5 mt-2 text-xs text-bone-muted">
                  <FileText className="w-3 h-3" />
                  引用 {selectedMatIds.size} 份资料作为上下文
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MessageBubble({ message, streaming }: { message: ChatMessage; streaming: boolean }) {
  const isUser = message.role === 'user'
  const isEmpty = !message.content && !isUser
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
          'rounded-2xl px-4 py-3 max-w-[85%]',
          isUser ? 'bg-amber/12 border border-amber/20' : 'bg-ink-850/70 border border-amber/8'
        )}
      >
        {isEmpty ? (
          <span className="stream-cursor text-bone-muted text-sm">思考中</span>
        ) : isUser ? (
          <p className="text-sm text-bone whitespace-pre-wrap">{message.content}</p>
        ) : (
          <Markdown content={message.content} className={streaming ? 'stream-cursor' : ''} />
        )}
      </div>
    </div>
  )
}
