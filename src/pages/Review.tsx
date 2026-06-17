// 复习中心页：生成总结 / 大纲 / 速记卡
// 生成状态提升到全局 store，切换页面不打断生成
import { useEffect, useState, useCallback } from 'react'
import { BookOpen, Sparkles, FileText, ListTree, Layers, Trash2, Copy, Check, Download, RefreshCw } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'
import Markdown from '@/components/Markdown'
import { useStore } from '@/lib/store'
import { useReviewStore } from '@/lib/review-store'
import { confirmDialog } from '@/lib/dialog'
import { formatTime, cn } from '@/lib/utils'
import type { Material, ReviewDoc, ReviewDocType } from '@/shared/types'

const GEN_TYPES: { type: ReviewDocType; label: string; desc: string; icon: typeof FileText }[] = [
  { type: 'summary', label: '章节总结', desc: '结构化梳理核心知识点', icon: FileText },
  { type: 'outline', label: '复习大纲', desc: '层级知识结构与考点', icon: ListTree },
  { type: 'flashcards', label: '速记卡片', desc: '关键术语问答卡', icon: Layers },
]

export default function Review() {
  const { subjects, currentSubjectId, config } = useStore()
  const {
    generating, generatingType, streamText, currentDoc, flashcards, error,
    generate, openDoc, clearError, resetView,
  } = useReviewStore()

  const [materials, setMaterials] = useState<Material[]>([])
  const [docs, setDocs] = useState<ReviewDoc[]>([])
  const [selectedMatIds, setSelectedMatIds] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState(false)

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
    resetView()
  }, [refresh, resetView])

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

  const handleGenerate = (type: ReviewDocType) => {
    if (!config?.apiKey || !currentSubjectId) return
    const ctxMaterials = readyMaterials.filter((m) => selectedMatIds.has(m.id))
    if (ctxMaterials.length === 0) {
      useReviewStore.setState({ error: '请至少选择一份资料' })
      return
    }
    generate(type, ctxMaterials, config, currentSubjectId)
  }

  const handleDelete = async (id: string) => {
    if (!(await confirmDialog('删除该复习资料？', { danger: true }))) return
    await window.api.deleteReviewDoc(id)
    if (currentDoc?.id === id) resetView()
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
        <div className="w-64 shrink-0 border-r border-amber/8 overflow-y-auto px-3 py-4 bg-ink-850/40">
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
                  {meta && <meta.icon className="w-4 h-4 shrink-0" />}
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
                  onClick={() => handleGenerate(t.type)}
                >
                  <t.icon className={cn('w-4 h-4', generating && generatingType === t.type && 'opacity-50')} />
                  生成{t.label}
                </button>
              ))}
            </div>
            {error && <p className="text-xs text-rust mt-3">{error}</p>}
          </div>

          {/* 生成中提示（独立于按钮，切换页面后仍可见） */}
          {generating && !currentDoc && streamText === '' && flashcards.length === 0 && (
            <div className="flex items-center justify-center py-16 text-bone-muted animate-pulse-soft">
              <Sparkles className="w-5 h-5 mr-2 text-amber" />
              AI 正在生成{generatingType === 'summary' ? '章节总结' : generatingType === 'outline' ? '复习大纲' : '速记卡片'}...
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
                  <FlipCard key={i} index={i} card={card} />
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

// 速记卡翻转组件（独立出来避免重渲染整个列表）
function FlipCard({ index, card }: { index: number; card: { q: string; a: string } }) {
  const [flipped, setFlipped] = useState(false)
  return (
    <div
      className={cn('flip-card h-44 cursor-pointer', flipped && 'flipped')}
      onClick={() => setFlipped(!flipped)}
    >
      <div className="flip-card-inner">
        <div className="flip-card-front rounded-2xl bg-ink-850/70 border border-amber/15 p-5 flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-amber-dim mb-2">问题 {index + 1}</span>
          <p className="text-sm text-bone leading-relaxed flex-1">{card.q}</p>
          <span className="text-[10px] text-bone-faint mt-2">点击翻转查看答案</span>
        </div>
        <div className="flip-card-back rounded-2xl bg-sage/10 border border-sage/25 p-5 flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-sage-glow mb-2">答案</span>
          <p className="text-sm text-bone leading-relaxed flex-1 overflow-y-auto">{card.a}</p>
        </div>
      </div>
    </div>
  )
}
