// 复习中心页：生成总结 / 大纲 / 速记卡
import { useEffect, useState, useCallback, useRef } from 'react'
import { BookOpen, Sparkles, FileText, ListTree, Layers, Trash2, Copy, Check, Loader2, Download, RefreshCw } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'
import Markdown from '@/components/Markdown'
import { useStore } from '@/lib/store'
import { streamChat, chatJSON, buildContext, SYSTEM_PROMPTS, extractJSON } from '@/lib/llm'
import { formatTime, cn } from '@/lib/utils'
import type { Material, ReviewDoc, ReviewDocType } from '@/shared/types'
import { v4 as uuidv4 } from 'uuid'

interface Flashcard { q: string; a: string }

const GEN_TYPES: { type: ReviewDocType; label: string; desc: string; icon: typeof FileText }[] = [
  { type: 'summary', label: '章节总结', desc: '结构化梳理核心知识点', icon: FileText },
  { type: 'outline', label: '复习大纲', desc: '层级知识结构与考点', icon: ListTree },
  { type: 'flashcards', label: '速记卡片', desc: '关键术语问答卡', icon: Layers },
]

export default function Review() {
  const { subjects, currentSubjectId, config } = useStore()
  const [materials, setMaterials] = useState<Material[]>([])
  const [docs, setDocs] = useState<ReviewDoc[]>([])
  const [selectedMatIds, setSelectedMatIds] = useState<Set<string>>(new Set())
  const [generating, setGenerating] = useState(false)
  const [currentDoc, setCurrentDoc] = useState<ReviewDoc | null>(null)
  const [streamText, setStreamText] = useState('')
  const [flashcards, setFlashcards] = useState<Flashcard[]>([])
  const [flippedIdx, setFlippedIdx] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  const subject = subjects.find((s) => s.id === currentSubjectId)

  const refresh = useCallback(async () => {
    if (!currentSubjectId) return
    const [mats, ds] = await Promise.all([
      window.api.getMaterials(currentSubjectId),
      window.api.listReviewDocs(currentSubjectId),
    ])
    setMaterials(mats)
    setDocs(ds)
  }, [currentSubjectId])

  useEffect(() => {
    refresh()
    setCurrentDoc(null)
    setStreamText('')
    setFlashcards([])
  }, [refresh])

  const readyMaterials = materials.filter((m) => m.status === 'ready')

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

  const generate = async (type: ReviewDocType) => {
    if (!config?.apiKey || !currentSubjectId) return
    const ctxMaterials = readyMaterials.filter((m) => selectedMatIds.has(m.id))
    if (ctxMaterials.length === 0) {
      setError('请至少选择一份资料')
      return
    }
    setError('')
    setGenerating(true)
    setStreamText('')
    setFlashcards([])
    setCurrentDoc(null)
    abortRef.current = new AbortController()

    const context = buildContext(ctxMaterials)
    const userContent = `以下是课程资料，请基于这些内容生成${type === 'summary' ? '章节总结' : type === 'outline' ? '复习大纲' : '速记卡片'}：\n${context}`

    try {
      if (type === 'flashcards') {
        const raw = await chatJSON({
          config,
          messages: [
            { role: 'system', content: SYSTEM_PROMPTS.flashcards },
            { role: 'user', content: userContent },
          ],
          signal: abortRef.current.signal,
          temperature: 0.5,
        })
        const arr = extractJSON(raw) as Flashcard[]
        setFlashcards(arr)
        const doc: ReviewDoc = {
          id: uuidv4(),
          subject_id: currentSubjectId,
          type,
          title: `速记卡片 · ${formatTime(Date.now())}`,
          content: JSON.stringify(arr),
          created_at: Date.now(),
        }
        await window.api.saveReviewDoc(doc)
        setCurrentDoc(doc)
        refresh()
      } else {
        const prompt = type === 'summary' ? SYSTEM_PROMPTS.summary : SYSTEM_PROMPTS.outline
        let acc = ''
        await streamChat({
          config,
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: userContent },
          ],
          signal: abortRef.current.signal,
          onToken: (t) => {
            acc += t
            setStreamText(acc)
          },
        })
        const doc: ReviewDoc = {
          id: uuidv4(),
          subject_id: currentSubjectId,
          type,
          title: `${type === 'summary' ? '章节总结' : '复习大纲'} · ${formatTime(Date.now())}`,
          content: acc,
          created_at: Date.now(),
        }
        await window.api.saveReviewDoc(doc)
        setCurrentDoc(doc)
        refresh()
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGenerating(false)
      abortRef.current = null
    }
  }

  const openDoc = (doc: ReviewDoc) => {
    setCurrentDoc(doc)
    setStreamText(doc.type === 'flashcards' ? '' : doc.content)
    setFlashcards(doc.type === 'flashcards' ? (safeParse(doc.content)) : [])
    setError('')
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('删除该复习资料？')) return
    await window.api.deleteReviewDoc(id)
    if (currentDoc?.id === id) {
      setCurrentDoc(null)
      setStreamText('')
      setFlashcards([])
    }
    refresh()
  }

  const copyContent = () => {
    const text = currentDoc?.type === 'flashcards'
      ? flashcards.map((c, i) => `Q${i + 1}: ${c.q}\nA: ${c.a}`).join('\n\n')
      : currentDoc?.content || streamText
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!currentSubjectId) {
    return (
      <div className="h-full overflow-y-auto">
        <PageHeader title="复习中心" subtitle="AI 生成知识点总结、复习大纲与速记卡" icon={<BookOpen className="w-5 h-5" />} />
        <EmptyState
          icon={<BookOpen className="w-7 h-7" />}
          title="请先选择或创建科目"
          desc="在左侧选择一个考试科目后，即可生成复习资料。"
        />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="复习中心"
        subtitle={subject ? `当前科目：${subject.name}` : 'AI 生成知识点总结、复习大纲与速记卡'}
        icon={<BookOpen className="w-5 h-5" />}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* 左侧历史 */}
        <div className="w-64 shrink-0 border-r border-amber/8 overflow-y-auto px-3 py-4 bg-ink-900/30">
          <span className="label px-2">已生成资料</span>
          <div className="space-y-1 mt-2">
            {docs.length === 0 && <p className="px-2 text-xs text-bone-faint">暂无生成记录</p>}
            {docs.map((d) => {
              const meta = GEN_TYPES.find((t) => t.type === d.type)
              return (
                <div
                  key={d.id}
                  className={cn(
                    'group flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-all',
                    currentDoc?.id === d.id ? 'bg-amber/10 text-amber' : 'text-bone-dim hover:bg-ink-800/50'
                  )}
                  onClick={() => openDoc(d)}
                >
                  <meta.icon className="w-4 h-4 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{d.title}</div>
                    <div className="text-[10px] text-bone-faint">{formatTime(d.created_at)}</div>
                  </div>
                  <button
                    className="opacity-0 group-hover:opacity-100 text-bone-faint hover:text-rust"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(d.id)
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* 主区 */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {/* 资料选择 + 生成按钮 */}
          <div className="panel p-5 mb-6">
            <div className="flex items-center justify-between mb-3">
              <span className="label !mb-0">选择资料</span>
              <button className="text-xs text-amber hover:text-amber-glow" onClick={selectAll}>
                {selectedMatIds.size === readyMaterials.length && readyMaterials.length > 0 ? '取消全选' : '全选'}
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mb-5">
              {readyMaterials.length === 0 && (
                <p className="text-xs text-bone-faint">暂无可用资料，请先到资料库上传</p>
              )}
              {readyMaterials.map((m) => (
                <button
                  key={m.id}
                  className={cn(
                    'chip',
                    selectedMatIds.has(m.id)
                      ? 'border-amber/50 bg-amber/12 text-amber'
                      : 'border-amber/15 text-bone-dim hover:border-amber/30'
                  )}
                  onClick={() => toggleMaterial(m.id)}
                >
                  <FileText className="w-3 h-3" />
                  {m.filename}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2.5">
              {GEN_TYPES.map((t) => (
                <button
                  key={t.type}
                  className="btn-outline group"
                  disabled={generating}
                  onClick={() => generate(t.type)}
                >
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <t.icon className="w-4 h-4" />}
                  生成{t.label}
                </button>
              ))}
            </div>
            {error && <p className="text-xs text-rust mt-3">{error}</p>}
          </div>

          {/* 生成结果 */}
          {generating && !currentDoc && streamText === '' && (
            <div className="flex items-center justify-center py-16 text-bone-muted">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> AI 正在生成...
            </div>
          )}

          {streamText && (
            <div className="panel p-6 animate-fade-in">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-xl text-bone">
                  {currentDoc?.title || '生成中...'}
                </h3>
                {currentDoc && (
                  <button className="btn-ghost !px-2 !py-1 text-xs" onClick={copyContent}>
                    {copied ? <Check className="w-3.5 h-3.5 text-sage-glow" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? '已复制' : '复制'}
                  </button>
                )}
              </div>
              <Markdown content={streamText} className={generating ? 'stream-cursor' : ''} />
            </div>
          )}

          {flashcards.length > 0 && (
            <div className="animate-fade-in">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-xl text-bone">{currentDoc?.title || '速记卡片'}</h3>
                <button className="btn-ghost !px-2 !py-1 text-xs" onClick={copyContent}>
                  {copied ? <Check className="w-3.5 h-3.5 text-sage-glow" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? '已复制' : '复制全部'}
                </button>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                {flashcards.map((card, i) => (
                  <div
                    key={i}
                    className={cn('flip-card h-44 cursor-pointer', flippedIdx === i && 'flipped')}
                    onClick={() => setFlippedIdx(flippedIdx === i ? null : i)}
                  >
                    <div className="flip-card-inner">
                      <div className="flip-card-front rounded-2xl bg-ink-850/70 border border-amber/15 p-5 flex flex-col">
                        <span className="text-[10px] uppercase tracking-wider text-amber-dim mb-2">问题 {i + 1}</span>
                        <p className="text-sm text-bone leading-relaxed flex-1">{card.q}</p>
                        <span className="text-[10px] text-bone-faint mt-2">点击翻转查看答案</span>
                      </div>
                      <div className="flip-card-back rounded-2xl bg-sage/10 border border-sage/25 p-5 flex flex-col">
                        <span className="text-[10px] uppercase tracking-wider text-sage-glow mb-2">答案</span>
                        <p className="text-sm text-bone leading-relaxed flex-1 overflow-y-auto">{card.a}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!generating && !streamText && flashcards.length === 0 && !currentDoc && (
            <EmptyState
              icon={<Sparkles className="w-7 h-7" />}
              title="选择资料并生成复习内容"
              desc="勾选上方资料，点击生成按钮，AI 将自动总结知识点、梳理大纲或制作速记卡。"
            />
          )}
        </div>
      </div>
    </div>
  )
}

function safeParse(s: string): Flashcard[] {
  try {
    return JSON.parse(s) as Flashcard[]
  } catch {
    return []
  }
}
