import { useState, useEffect, useRef, useCallback } from 'react'
import { BookOpen, Send, Loader2, ChevronRight, ChevronDown, Sparkles, Database, Zap, Code, Cpu, Globe, Table, Layers3, Clock3 } from 'lucide-react'
import { useStore } from '@/lib/store'
import { streamChat } from '@/lib/llm'
import Markdown from '@/components/Markdown'

interface KnowledgeCategory {
  id: string
  name: string
  icon: string
}

interface KnowledgeArticle {
  slug: string
  category: string
  categoryName: string
  title: string
  order: number
}

const ICON_MAP: Record<string, typeof Database> = {
  database: Database,
  zap: Zap,
  code: Code,
  cpu: Cpu,
  globe: Globe,
  table: Table,
}

interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
}

export default function Knowledge() {
  const { config, loadConfig } = useStore()
  const [categories, setCategories] = useState<KnowledgeCategory[]>([])
  const [articles, setArticles] = useState<KnowledgeArticle[]>([])
  const [currentSlug, setCurrentSlug] = useState<string>('')
  const [content, setContent] = useState<string>('')
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set())
  const [loadingContent, setLoadingContent] = useState(false)

  // AI 问答状态
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamAcc, setStreamAcc] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    loadConfig()
    // 加载目录
    fetch('/api/knowledge/catalog')
      .then((r) => r.json())
      .then((data) => {
        setCategories(data.categories || [])
        setArticles(data.articles || [])
        // 默认展开第一个分类，选中第一篇文章
        if (data.articles?.length > 0) {
          setCurrentSlug(data.articles[0].slug)
          setExpandedCats(new Set([data.articles[0].category]))
        }
      })
      .catch(() => {})
  }, [loadConfig])

  // 加载文章内容
  useEffect(() => {
    if (!currentSlug) return
    setLoadingContent(true)
    fetch(`/api/knowledge/${currentSlug}`)
      .then((r) => r.json())
      .then((data) => {
        setContent(data.content || '')
      })
      .catch(() => setContent(''))
      .finally(() => setLoadingContent(false))
  }, [currentSlug])

  const toggleCat = (catId: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev)
      if (next.has(catId)) next.delete(catId)
      else next.add(catId)
      return next
    })
  }

  const handleAsk = useCallback(async () => {
    if (!input.trim() || !config || streaming) return
    const question = input.trim()
    setInput('')
    setChatMsgs((prev) => [...prev, { role: 'user', content: question }, { role: 'assistant', content: '' }])
    setStreaming(true)
    setStreamAcc('')

    const abortController = new AbortController()
    abortRef.current = abortController

    // 以当前文章内容作为上下文
    const context = content ? `以下是当前正在学习的知识文章内容，请基于它回答用户的问题：\n\n${content.slice(0, 8000)}` : ''

    const messages = [
      { role: 'system' as const, content: '你是计算机科学学习助手，帮助大学生理解计算机相关知识。回答要清晰、准确，必要时给出代码示例。如果问题超出当前文章范围，也可以结合你的知识回答，但要说明哪些是文章中的内容、哪些是额外补充。' },
      ...(context ? [{ role: 'user' as const, content: context }, { role: 'assistant' as const, content: '好的，我已了解当前文章内容，请问吧。' }] : []),
      { role: 'user' as const, content: question },
    ]

    try {
      let acc = ''
      await streamChat({
        config,
        messages,
        onToken: (token) => {
          acc += token
          setStreamAcc(acc)
        },
        signal: abortController.signal,
        temperature: 0.7,
      })
      setChatMsgs((prev) => {
        const next = [...prev]
        next[next.length - 1] = { role: 'assistant', content: acc }
        return next
      })
    } catch (e) {
      const errMsg = (e as Error).name === 'AbortError' ? '（已停止）' : `错误：${(e as Error).message}`
      setChatMsgs((prev) => {
        const next = [...prev]
        next[next.length - 1] = { role: 'assistant', content: errMsg }
        return next
      })
    } finally {
      setStreaming(false)
      setStreamAcc('')
    }
  }, [input, config, streaming, content])

  const handleStop = () => {
    abortRef.current?.abort()
  }

  const currentArticle = articles.find((article) => article.slug === currentSlug)

  return (
    <div className="flex h-full bg-[var(--bg-surface)]">
      {/* 左栏：分类树 */}
      <div className="knowledge-tree w-[258px] shrink-0 border-r border-[var(--border)] overflow-y-auto px-3 py-4 bg-[var(--bg-elevated)]/55">
        <div className="px-2.5 pt-1 pb-4">
          <div className="flex items-center gap-2 mb-1.5">
            <Layers3 className="w-4 h-4 text-[var(--accent)]" />
            <span className="text-[13px] font-semibold text-bone">知识目录</span>
          </div>
          <p className="text-[11px] leading-relaxed text-bone-faint">系统化梳理计算机科学核心知识</p>
        </div>
        {categories.map((cat) => {
          const Icon = ICON_MAP[cat.icon] || BookOpen
          const catArticles = articles.filter((a) => a.category === cat.id).sort((a, b) => a.order - b.order)
          const expanded = expandedCats.has(cat.id)
          return (
            <div key={cat.id} className="mb-1.5">
              <button
                className="flex items-center gap-2 w-full px-2.5 py-2 rounded-xl hover:bg-[var(--bg-hover)] text-left transition-all duration-200"
                onClick={() => toggleCat(cat.id)}
              >
                {expanded ? <ChevronDown className="w-3.5 h-3.5 text-bone-faint" /> : <ChevronRight className="w-3.5 h-3.5 text-bone-faint" />}
                <Icon className="w-3.5 h-3.5 text-[var(--accent)]/70" />
                <span className="text-xs font-medium text-bone-muted">{cat.name}</span>
                <span className="text-[10px] text-bone-faint ml-auto bg-[var(--bg-surface)] border border-[var(--border)] rounded-full min-w-5 h-5 px-1 flex items-center justify-center">{catArticles.length}</span>
              </button>
              {expanded && (
                <div className="ml-5 mt-1 space-y-0.5 border-l border-[var(--border)] pl-2">
                  {catArticles.map((art) => (
                    <button
                      key={art.slug}
                      className={`block w-full text-left px-2.5 py-2 rounded-lg text-xs leading-snug transition-all duration-200 ${
                        currentSlug === art.slug
                          ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold shadow-sm border border-[var(--border)]'
                          : 'text-bone-faint hover:bg-[var(--bg-hover)] hover:text-bone-muted'
                      }`}
                      onClick={() => setCurrentSlug(art.slug)}
                    >
                      {art.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 中栏：文章内容 */}
      <div className="knowledge-content flex-1 overflow-y-auto min-w-0">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 px-8 py-4 border-b border-[var(--border)] bg-[var(--glass-strong-bg)] backdrop-blur-xl">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] text-bone-faint mb-1">
              <span className="uppercase tracking-[0.14em] font-mono text-amber">Knowledge base</span>
              <span>·</span>
              <span>{currentArticle?.categoryName || '知识中心'}</span>
            </div>
            <h2 className="font-display text-xl text-bone truncate">{currentArticle?.title || '选择一篇文章开始学习'}</h2>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-bone-faint shrink-0">
            <Clock3 className="w-3.5 h-3.5" />
            <span>沉浸阅读</span>
          </div>
        </div>
        <div className="px-10 py-8">
        {loadingContent ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" />
            <span className="text-xs text-bone-faint">正在整理知识内容…</span>
          </div>
        ) : content ? (
          <article className="max-w-[780px] mx-auto pb-20">
            <Markdown content={content} />
          </article>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-bone-faint">
            <BookOpen className="w-10 h-10 mb-3 opacity-30" />
            <span className="text-sm">选择左侧分类查看知识文章</span>
          </div>
        )}
        </div>
      </div>

      {/* 右栏：AI 问答 */}
      <div className="knowledge-assistant w-[336px] shrink-0 border-l border-[var(--border)] flex flex-col bg-[var(--bg-elevated)]/45">
        <div className="flex items-center gap-3 p-4 border-b border-[var(--border)]">
          <div className="w-9 h-9 rounded-xl bg-amber/10 border border-amber/15 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-[var(--accent)]" />
          </div>
          <div>
            <span className="block text-[13px] font-semibold text-bone">AI 学习伙伴</span>
            <span className="block text-[10px] text-bone-faint mt-0.5">已理解当前文章内容</span>
          </div>
        </div>
        {/* 对话区 */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
          {chatMsgs.length === 0 && (
            <div className="text-center text-bone-faint text-xs mt-6 px-2">
              <div className="w-12 h-12 rounded-2xl bg-amber/8 border border-amber/10 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-5 h-5 text-amber" />
              </div>
              <p className="text-bone-muted mb-1">关于当前文章，尽管问我</p>
              <p className="text-[10px]">你可以从这些问题开始</p>
              <div className="mt-4 space-y-1.5">
                {['这个知识点怎么理解？', '能给我举个例子吗？', '和...有什么区别？'].map((s) => (
                  <button
                    key={s}
                    className="block w-full text-left px-3 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] text-bone-muted hover:border-amber/25 hover:text-[var(--accent)] text-xs transition-all"
                    onClick={() => setInput(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {chatMsgs.map((msg, i) => {
            const isLast = i === chatMsgs.length - 1
            const isStreamingThis = isLast && streaming && msg.role === 'assistant'
            return (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[90%] rounded-xl px-3.5 py-2.5 text-xs transition-all duration-200 ${
                    msg.role === 'user'
                      ? 'msg-bubble-user'
                      : 'msg-bubble-ai'
                  }`}
                >
                  {isStreamingThis ? (
                    <Markdown content={streamAcc || '...'} streaming />
                  ) : msg.role === 'assistant' ? (
                    <Markdown content={msg.content} />
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            )
          })}
        </div>
        {/* 输入区 */}
        <div className="p-3.5 border-t border-[var(--border)] shrink-0 bg-[var(--glass-strong-bg)]">
          <div className="flex gap-2 p-1.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] focus-within:border-amber/35 transition-colors">
            <input
              className="flex-1 min-w-0 bg-transparent outline-none px-2 text-xs text-bone placeholder:text-bone-faint"
              placeholder="输入你的问题..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleAsk()
                }
              }}
              disabled={streaming}
            />
            {streaming ? (
              <button className="icon-button !w-9 !h-9" onClick={handleStop} title="停止">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              </button>
            ) : (
              <button
                className="btn-primary !w-9 !h-9 !min-h-0 !p-0 rounded-lg"
                onClick={handleAsk}
                disabled={!input.trim() || !config}
                title="发送"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {!config && <p className="text-xs text-rust mt-1.5">请先配置 API</p>}
        </div>
      </div>
    </div>
  )
}
