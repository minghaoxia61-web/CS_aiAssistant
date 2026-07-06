import { useState, useEffect, useRef, useCallback } from 'react'
import { BookOpen, Send, Loader2, ChevronRight, ChevronDown, Sparkles, Database, Zap, Code, Cpu, Globe, Table } from 'lucide-react'
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
  const [materialId, setMaterialId] = useState<string>('')
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
        setMaterialId(data.materialId || '')
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

  return (
    <div className="flex h-full gap-0">
      {/* 左栏：分类树 */}
      <div className="w-64 shrink-0 border-r border-amber/10 overflow-y-auto p-3 glass-sidebar">
        <div className="flex items-center gap-2 mb-4 px-2">
          <BookOpen className="w-4 h-4 text-amber" />
          <span className="text-sm font-medium text-bone">知识分类</span>
        </div>
        {categories.map((cat) => {
          const Icon = ICON_MAP[cat.icon] || BookOpen
          const catArticles = articles.filter((a) => a.category === cat.id).sort((a, b) => a.order - b.order)
          const expanded = expandedCats.has(cat.id)
          return (
            <div key={cat.id} className="mb-1">
              <button
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg hover:bg-amber/5 text-left transition-colors"
                onClick={() => toggleCat(cat.id)}
              >
                {expanded ? <ChevronDown className="w-3.5 h-3.5 text-bone-faint" /> : <ChevronRight className="w-3.5 h-3.5 text-bone-faint" />}
                <Icon className="w-3.5 h-3.5 text-amber/70" />
                <span className="text-xs font-medium text-bone-muted">{cat.name}</span>
                <span className="text-xs text-bone-faint ml-auto">{catArticles.length}</span>
              </button>
              {expanded && (
                <div className="ml-6 mt-0.5 space-y-0.5">
                  {catArticles.map((art) => (
                    <button
                      key={art.slug}
                      className={`block w-full text-left px-2 py-1 rounded text-xs transition-colors ${
                        currentSlug === art.slug
                          ? 'bg-amber/10 text-amber font-medium'
                          : 'text-bone-faint hover:bg-amber/5 hover:text-bone-muted'
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
      <div className="flex-1 overflow-y-auto p-6 min-w-0">
        {loadingContent ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-5 h-5 animate-spin text-amber" />
          </div>
        ) : content ? (
          <article className="max-w-3xl mx-auto">
            <Markdown content={content} />
          </article>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-bone-faint">
            <BookOpen className="w-10 h-10 mb-3 opacity-30" />
            <span className="text-sm">选择左侧分类查看知识文章</span>
          </div>
        )}
      </div>

      {/* 右栏：AI 问答 */}
      <div className="w-80 shrink-0 border-l border-amber/10 flex flex-col glass-sidebar">
        <div className="flex items-center gap-2 p-3 border-b border-amber/10">
          <Sparkles className="w-4 h-4 text-amber" />
          <span className="text-sm font-medium text-bone">AI 学习助手</span>
        </div>
        {/* 对话区 */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {chatMsgs.length === 0 && (
            <div className="text-center text-bone-faint text-xs mt-8 px-4">
              <p className="mb-2">基于当前文章内容智能问答</p>
              <p>试着问：</p>
              <div className="mt-2 space-y-1">
                {['这个知识点怎么理解？', '能给我举个例子吗？', '和...有什么区别？'].map((s) => (
                  <button
                    key={s}
                    className="block w-full text-left px-2 py-1 rounded text-bone-muted hover:bg-amber/5 text-xs"
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
                  className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-xs transition-all duration-300 ${
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
        <div className="p-3 border-t border-amber/10">
          <div className="flex gap-2">
            <input
              className="input flex-1 text-xs"
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
              <button className="btn-ghost px-2.5" onClick={handleStop} title="停止">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              </button>
            ) : (
              <button
                className="btn-primary px-2.5"
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
