// 错题本页：管理错题、筛选、复习标记、生成专项试卷、手动录入
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookX, Trash2, Check, X, ChevronDown, ChevronRight, Sparkles, Plus, Filter, CheckCircle2, Circle, Loader2, BookMarked, Bug, Zap, Gauge } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'
import { useStore } from '@/lib/store'
import { confirmDialog } from '@/lib/dialog'
import { formatTime, cn } from '@/lib/utils'
import type { WrongQuestion, QuizQuestion, QuizQuestionType, QuizDifficulty, QuizSession } from '@/shared/types'
import { v4 as uuidv4 } from 'uuid'

const TYPE_OPTIONS: { type: QuizQuestionType; label: string }[] = [
  { type: 'single', label: '单选题' },
  { type: 'multiple', label: '多选题' },
  { type: 'short', label: '简答题' },
  { type: 'code', label: '代码计算题' },
]

const DIFFICULTIES: QuizDifficulty[] = ['基础', '中档', '综合大题']

const TYPE_LABEL: Record<QuizQuestionType, string> = {
  single: '单选题',
  multiple: '多选题',
  short: '简答题',
  code: '代码计算题',
}

export default function WrongBook() {
  const { subjects, currentSubjectId } = useStore()
  const navigate = useNavigate()
  const [wrongQuestions, setWrongQuestions] = useState<WrongQuestion[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<QuizQuestionType | 'all'>('all')
  const [filterDifficulty, setFilterDifficulty] = useState<QuizDifficulty | 'all'>('all')
  const [filterReviewed, setFilterReviewed] = useState<'all' | 'unreviewed' | 'reviewed'>('all')
  const [showManual, setShowManual] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [quizCount, setQuizCount] = useState(5)

  const subject = subjects.find((s) => s.id === currentSubjectId)

  const refresh = useCallback(async () => {
    if (!currentSubjectId) return
    const list = await window.api.listWrongQuestions(currentSubjectId)
    setWrongQuestions(list)
  }, [currentSubjectId])

  useEffect(() => {
    refresh()
  }, [refresh])

  // 筛选
  const filtered = useMemo(() => {
    return wrongQuestions.filter((w) => {
      if (filterType !== 'all' && w.question.type !== filterType) return false
      if (filterDifficulty !== 'all' && w.difficulty !== filterDifficulty) return false
      if (filterReviewed === 'unreviewed' && w.reviewed) return false
      if (filterReviewed === 'reviewed' && !w.reviewed) return false
      return true
    })
  }, [wrongQuestions, filterType, filterDifficulty, filterReviewed])

  const stats = useMemo(() => {
    const total = wrongQuestions.length
    const reviewed = wrongQuestions.filter((w) => w.reviewed).length
    const byType: Record<string, number> = {}
    for (const w of wrongQuestions) {
      byType[w.question.type] = (byType[w.question.type] || 0) + 1
    }
    return { total, reviewed, unreviewed: total - reviewed, byType }
  }, [wrongQuestions])

  const handleDelete = async (id: string) => {
    if (!(await confirmDialog('删除该错题？', { danger: true }))) return
    await window.api.deleteWrongQuestion(id)
    refresh()
  }

  const handleToggleReviewed = async (wq: WrongQuestion) => {
    await window.api.markWrongReviewed(wq.id, !wq.reviewed)
    refresh()
  }

  const handleGenerateQuiz = async () => {
    if (!currentSubjectId || wrongQuestions.length === 0) return
    setGenerating(true)
    try {
      const picked = await window.api.generateWrongQuiz(currentSubjectId, quizCount)
      if (picked.length === 0) return
      // 将错题转换为可作答的 QuizQuestion（重置作答状态）
      const questions: QuizQuestion[] = picked.map((w) => ({
        ...w.question,
        id: uuidv4(),
        session_id: '',
        user_answer: '',
        correct: false,
      }))
      const session: QuizSession = {
        id: uuidv4(),
        subject_id: currentSubjectId,
        title: `错题专项测验 · ${formatTime(Date.now())}`,
        score: 0,
        total: questions.length,
        questions,
        created_at: Date.now(),
        saved: true,
        attempts: 0,
      }
      await window.api.saveQuizSession(session)
      navigate('/quiz', { state: { startSessionId: session.id } })
    } finally {
      setGenerating(false)
    }
  }

  const handleAddManual = async (data: ManualEntryData) => {
    if (!currentSubjectId) return
    const question: QuizQuestion = {
      id: uuidv4(),
      session_id: '',
      type: data.type,
      question: data.question,
      options: data.options,
      answer: data.answer,
      user_answer: data.userAnswer,
      correct: false,
      explanation: data.explanation || '',
      chapter: data.chapter,
    }
    const wq: WrongQuestion = {
      id: uuidv4(),
      subject_id: currentSubjectId,
      quiz_session_id: 'manual',
      question,
      user_answer: data.userAnswer,
      correct_answer: data.answer,
      explanation: data.explanation,
      source: data.source || '线下录入',
      created_at: Date.now(),
      reviewed: false,
      review_count: 0,
      difficulty: data.difficulty,
    }
    await window.api.addWrongQuestion(wq)
    setShowManual(false)
    refresh()
  }

  if (!currentSubjectId) {
    return (
      <div className="h-full overflow-y-auto">
        <PageHeader title="错题本" subtitle="管理错题、生成专项试卷、手动录入" icon={<BookX className="w-5 h-5" />} />
        <EmptyState
          icon={<BookX className="w-7 h-7" />}
          title="请先选择或创建科目"
          desc="在左侧选择一个考试科目后，即可查看错题本。"
        />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="错题本"
        subtitle={subject ? `当前科目：${subject.name}` : '管理错题、生成专项试卷、手动录入'}
        icon={<BookX className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-2">
            <button className="btn-outline" onClick={() => setShowManual(true)}>
              <Plus className="w-4 h-4" /> 手动录入
            </button>
            <button
              className="btn-primary"
              onClick={handleGenerateQuiz}
              disabled={generating || wrongQuestions.length === 0}
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              生成专项试卷
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto px-8 py-6">
        {/* 统计概览 */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <div className="panel p-4">
            <div className="text-xs text-bone-faint mb-1">错题总数</div>
            <div className="font-display text-2xl text-bone">{stats.total}</div>
          </div>
          <div className="panel p-4">
            <div className="text-xs text-bone-faint mb-1">未复习</div>
            <div className="font-display text-2xl text-rust">{stats.unreviewed}</div>
          </div>
          <div className="panel p-4">
            <div className="text-xs text-bone-faint mb-1">已复习</div>
            <div className="font-display text-2xl text-sage-glow">{stats.reviewed}</div>
          </div>
          <div className="panel p-4">
            <div className="text-xs text-bone-faint mb-1">题型分布</div>
            <div className="text-sm text-bone-dim flex flex-wrap gap-x-2">
              {TYPE_OPTIONS.map((t) => (
                <span key={t.type}>
                  {t.label.slice(0, 2)} <span className="font-mono text-amber">{stats.byType[t.type] || 0}</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* 筛选栏 */}
        <div className="panel p-4 mb-4 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-bone-faint">
            <Filter className="w-3.5 h-3.5" /> 筛选
          </div>
          {/* 题型筛选 */}
          <div className="flex items-center gap-1.5">
            <button
              className={cn('chip text-xs', filterType === 'all' ? 'border-amber/50 bg-amber/12 text-amber' : 'border-amber/15 text-bone-dim')}
              onClick={() => setFilterType('all')}
            >
              全部题型
            </button>
            {TYPE_OPTIONS.map((t) => (
              <button
                key={t.type}
                className={cn('chip text-xs', filterType === t.type ? 'border-amber/50 bg-amber/12 text-amber' : 'border-amber/15 text-bone-dim')}
                onClick={() => setFilterType(t.type)}
              >
                {t.label}
              </button>
            ))}
          </div>
          {/* 难度筛选 */}
          <div className="flex items-center gap-1.5">
            <button
              className={cn('chip text-xs', filterDifficulty === 'all' ? 'border-amber/50 bg-amber/12 text-amber' : 'border-amber/15 text-bone-dim')}
              onClick={() => setFilterDifficulty('all')}
            >
              全部难度
            </button>
            {DIFFICULTIES.map((d) => (
              <button
                key={d}
                className={cn('chip text-xs', filterDifficulty === d ? 'border-amber/50 bg-amber/12 text-amber' : 'border-amber/15 text-bone-dim')}
                onClick={() => setFilterDifficulty(d)}
              >
                {d}
              </button>
            ))}
          </div>
          {/* 复习状态筛选 */}
          <div className="flex items-center gap-1.5">
            {(['all', 'unreviewed', 'reviewed'] as const).map((r) => (
              <button
                key={r}
                className={cn('chip text-xs', filterReviewed === r ? 'border-amber/50 bg-amber/12 text-amber' : 'border-amber/15 text-bone-dim')}
                onClick={() => setFilterReviewed(r)}
              >
                {r === 'all' ? '全部' : r === 'unreviewed' ? '未复习' : '已复习'}
              </button>
            ))}
          </div>
          {/* 抽题数量 */}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-bone-faint">抽题数</span>
            <input
              type="range"
              min={3}
              max={20}
              step={1}
              value={quizCount}
              onChange={(e) => setQuizCount(parseInt(e.target.value))}
              className="w-24 accent-amber"
            />
            <span className="font-mono text-amber text-sm w-6 text-right">{quizCount}</span>
          </div>
        </div>

        {/* 错题列表 */}
        {filtered.length === 0 ? (
          <EmptyState
            icon={<BookX className="w-7 h-7" />}
            title={wrongQuestions.length === 0 ? '暂无错题' : '无符合条件的错题'}
            desc={wrongQuestions.length === 0 ? '完成测验后，错题会自动加入错题本。也可点击"手动录入"添加线下错题。' : '尝试调整筛选条件。'}
          />
        ) : (
          <div className="space-y-2.5">
            {filtered.map((wq, i) => (
              <WrongQuestionCard
                key={wq.id}
                wq={wq}
                index={i}
                expanded={expandedId === wq.id}
                onToggle={() => setExpandedId(expandedId === wq.id ? null : wq.id)}
                onDelete={() => handleDelete(wq.id)}
                onToggleReviewed={() => handleToggleReviewed(wq)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 手动录入弹窗 */}
      {showManual && (
        <ManualEntryModal
          onClose={() => setShowManual(false)}
          onSubmit={handleAddManual}
        />
      )}
    </div>
  )
}

/** 单条错题卡片 */
function WrongQuestionCard({
  wq,
  index,
  expanded,
  onToggle,
  onDelete,
  onToggleReviewed,
}: {
  wq: WrongQuestion
  index: number
  expanded: boolean
  onToggle: () => void
  onDelete: () => void
  onToggleReviewed: () => void
}) {
  const q = wq.question
  return (
    <div className={cn('panel overflow-hidden border-l-4', wq.reviewed ? 'border-l-sage/50' : 'border-l-rust')}>
      <div
        className="flex items-start gap-3 px-5 py-4 cursor-pointer hover:bg-ink-850/30 transition-all"
        onClick={onToggle}
      >
        <span className="text-xs text-bone-faint font-mono shrink-0 mt-0.5">#{index + 1}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber/10 text-amber-dim">
              {TYPE_LABEL[q.type]}
            </span>
            {wq.difficulty && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink-800 text-bone-faint">
                {wq.difficulty}
              </span>
            )}
            {q.chapter && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink-800 text-bone-faint">
                {q.chapter}
              </span>
            )}
            {wq.source && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink-800 text-bone-faint flex items-center gap-1">
                <BookMarked className="w-2.5 h-2.5" /> {wq.source}
              </span>
            )}
            {wq.reviewed ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-sage/12 text-sage-glow flex items-center gap-1">
                <CheckCircle2 className="w-2.5 h-2.5" /> 已复习({wq.review_count})
              </span>
            ) : (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-rust/12 text-rust flex items-center gap-1">
                <Circle className="w-2.5 h-2.5" /> 待复习
              </span>
            )}
            <span className="text-[10px] text-bone-faint ml-auto">{formatTime(wq.created_at)}</span>
          </div>
          <p className={cn('text-sm text-bone', expanded ? 'whitespace-pre-wrap' : 'truncate')}>{q.question}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            className="p-1.5 rounded-md text-bone-faint hover:text-sage-glow hover:bg-sage/10 transition-all"
            onClick={(e) => {
              e.stopPropagation()
              onToggleReviewed()
            }}
            title={wq.reviewed ? '取消复习标记' : '标记为已复习'}
          >
            {wq.reviewed ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
          </button>
          <button
            className="p-1.5 rounded-md text-bone-faint hover:text-rust hover:bg-rust/10 transition-all"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            title="删除"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          {expanded ? <ChevronDown className="w-4 h-4 text-bone-faint" /> : <ChevronRight className="w-4 h-4 text-bone-faint" />}
        </div>
      </div>

      {/* 展开详情 */}
      {expanded && (
        <div className="px-5 pb-4 pt-1 space-y-3 border-t border-amber/8">
          {/* 选项（选择题） */}
          {q.options.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs text-bone-faint font-medium">选项</div>
              {q.options.map((opt, oi) => {
                const isAnswer = q.answer.includes(opt)
                const isUser = wq.user_answer.includes(opt)
                return (
                  <div
                    key={oi}
                    className={cn(
                      'flex items-center gap-2 px-3 py-1.5 rounded text-sm',
                      isAnswer
                        ? 'bg-sage/10 text-sage-glow'
                        : isUser
                        ? 'bg-rust/10 text-rust'
                        : 'text-bone-muted'
                    )}
                  >
                    <span className="font-mono text-xs">{String.fromCharCode(65 + oi)}</span>
                    <span>{opt}</span>
                    {isAnswer && <Check className="w-3.5 h-3.5 ml-auto" />}
                    {isUser && !isAnswer && <X className="w-3.5 h-3.5 ml-auto" />}
                  </div>
                )
              })}
            </div>
          )}

          {/* 用户作答 */}
          <div className="text-sm">
            <div className="text-xs text-bone-faint font-medium mb-1">你的作答（错误）</div>
            <pre className="text-rust bg-rust/8 rounded-lg px-3 py-2 whitespace-pre-wrap font-mono text-xs">
              {wq.user_answer || '（未作答）'}
            </pre>
          </div>

          {/* 正确答案 */}
          <div className="text-sm">
            <div className="text-xs text-bone-faint font-medium mb-1">正确答案</div>
            <pre className="text-sage-glow bg-sage/8 rounded-lg px-3 py-2 whitespace-pre-wrap font-mono text-xs">
              {wq.correct_answer}
            </pre>
          </div>

          {/* 代码题批改明细 */}
          {q.type === 'code' && (typeof q.score === 'number' || (q.issues && q.issues.length > 0)) && (
            <div className="space-y-2">
              {typeof q.score === 'number' && (
                <div className="flex items-center gap-2 text-sm">
                  <Gauge className="w-4 h-4 text-amber" />
                  <span className="text-bone-faint">代码评分：</span>
                  <span className={cn('font-mono font-bold', q.score >= 60 ? 'text-sage-glow' : 'text-rust')}>
                    {q.score}
                  </span>
                  <span className="text-bone-faint text-xs">/ 100</span>
                </div>
              )}
              {q.issues && q.issues.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs text-amber-dim font-medium">
                    <Bug className="w-3.5 h-3.5" /> 问题标注（{q.issues.length}）
                  </div>
                  {q.issues.map((iss, ii) => (
                    <div
                      key={ii}
                      className={cn(
                        'flex items-start gap-2 px-3 py-2 rounded-lg text-xs border',
                        iss.type === 'syntax'
                          ? 'bg-rust/8 border-rust/20 text-rust'
                          : iss.type === 'logic'
                          ? 'bg-amber/8 border-amber/20 text-amber-dim'
                          : 'bg-steel/8 border-steel/20 text-steel'
                      )}
                    >
                      <span className="shrink-0 font-mono font-bold">
                        {iss.type === 'syntax' ? '语法' : iss.type === 'logic' ? '逻辑' : '复杂度'}
                      </span>
                      {typeof iss.line === 'number' && (
                        <span className="shrink-0 text-bone-faint font-mono">L{iss.line}</span>
                      )}
                      <span className="flex-1 text-bone-dim">{iss.description}</span>
                    </div>
                  ))}
                </div>
              )}
              {q.standard_solution && (
                <div className="text-sm">
                  <div className="flex items-center gap-1.5 text-xs text-sage-glow font-medium mb-1">
                    <Check className="w-3.5 h-3.5" /> 分步标准实现
                  </div>
                  <pre className="text-sage-glow/80 bg-ink-850/60 rounded-lg px-3 py-2 whitespace-pre-wrap font-mono text-xs">
                    {q.standard_solution}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* 简答题得分点 */}
          {q.type === 'short' && q.scoring_points && q.scoring_points.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs text-amber-dim font-medium">
                <Zap className="w-3.5 h-3.5" /> 得分点（{q.scoring_points.filter((p) => p.awarded).length}/{q.scoring_points.length}）
              </div>
              {q.scoring_points.map((sp, si) => (
                <div
                  key={si}
                  className={cn(
                    'flex items-start gap-2 px-3 py-2 rounded-lg text-xs border',
                    sp.awarded ? 'bg-sage/8 border-sage/20' : 'bg-rust/8 border-rust/20'
                  )}
                >
                  <span
                    className={cn(
                      'shrink-0 w-4 h-4 rounded flex items-center justify-center',
                      sp.awarded ? 'bg-sage/20 text-sage-glow' : 'bg-rust/20 text-rust'
                    )}
                  >
                    {sp.awarded ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                  </span>
                  <span className={cn('flex-1', sp.awarded ? 'text-bone-dim' : 'text-bone-muted')}>{sp.point}</span>
                  {sp.source && (
                    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-ink-800 text-bone-faint flex items-center gap-1">
                      <BookMarked className="w-2.5 h-2.5" /> {sp.source}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 解析 */}
          {wq.explanation && (
            <div className="text-sm text-bone-dim bg-ink-850/60 rounded-lg px-3 py-2">
              <span className="text-amber-dim font-medium">解析：</span>
              {wq.explanation}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** 手动录入数据 */
interface ManualEntryData {
  type: QuizQuestionType
  question: string
  options: string[]
  answer: string
  userAnswer: string
  explanation?: string
  source?: string
  chapter?: string
  difficulty?: QuizDifficulty
}

/** 手动录入弹窗 */
function ManualEntryModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void
  onSubmit: (data: ManualEntryData) => void
}) {
  const [type, setType] = useState<QuizQuestionType>('single')
  const [question, setQuestion] = useState('')
  const [optionA, setOptionA] = useState('')
  const [optionB, setOptionB] = useState('')
  const [optionC, setOptionC] = useState('')
  const [optionD, setOptionD] = useState('')
  const [answer, setAnswer] = useState('')
  const [userAnswer, setUserAnswer] = useState('')
  const [explanation, setExplanation] = useState('')
  const [source, setSource] = useState('')
  const [chapter, setChapter] = useState('')
  const [difficulty, setDifficulty] = useState<QuizDifficulty | ''>('')
  const [error, setError] = useState('')

  const isChoice = type === 'single' || type === 'multiple'

  const handleSubmit = () => {
    if (!question.trim()) {
      setError('请输入题目内容')
      return
    }
    if (!answer.trim()) {
      setError('请输入正确答案')
      return
    }
    if (!userAnswer.trim()) {
      setError('请输入你的错误作答')
      return
    }
    if (isChoice) {
      const opts = [optionA, optionB, optionC, optionD].filter((o) => o.trim())
      if (opts.length < 2) {
        setError('选择题至少需要 2 个选项')
        return
      }
      // 校验答案在选项中
      if (type === 'single' && !opts.includes(answer.trim())) {
        setError('单选题正确答案必须与某个选项完全一致')
        return
      }
      if (type === 'multiple') {
        const ansParts = answer.split('|').map((s) => s.trim()).filter(Boolean)
        for (const p of ansParts) {
          if (!opts.includes(p)) {
            setError('多选题正确答案的每项必须与某个选项完全一致（用 | 分隔）')
            return
          }
        }
      }
    }
    setError('')
    onSubmit({
      type,
      question: question.trim(),
      options: isChoice ? [optionA, optionB, optionC, optionD].filter((o) => o.trim()) : [],
      answer: answer.trim(),
      userAnswer: userAnswer.trim(),
      explanation: explanation.trim() || undefined,
      source: source.trim() || undefined,
      chapter: chapter.trim() || undefined,
      difficulty: difficulty || undefined,
    })
  }

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto mx-4 rounded-2xl border border-amber/15 bg-ink-900 shadow-2xl p-6 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-lg text-bone mb-4">手动录入错题</h3>

        <div className="space-y-4">
          {/* 题型选择 */}
          <div>
            <span className="label">题型</span>
            <div className="flex flex-wrap gap-2">
              {TYPE_OPTIONS.map((t) => (
                <button
                  key={t.type}
                  className={cn('chip text-xs', type === t.type ? 'border-amber/50 bg-amber/12 text-amber' : 'border-amber/15 text-bone-dim')}
                  onClick={() => setType(t.type)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* 难度 */}
          <div>
            <span className="label">难度（可选）</span>
            <div className="flex gap-2">
              <button
                className={cn('chip text-xs', difficulty === '' ? 'border-amber/50 bg-amber/12 text-amber' : 'border-amber/15 text-bone-dim')}
                onClick={() => setDifficulty('')}
              >
                不指定
              </button>
              {DIFFICULTIES.map((d) => (
                <button
                  key={d}
                  className={cn('chip text-xs', difficulty === d ? 'border-amber/50 bg-amber/12 text-amber' : 'border-amber/15 text-bone-dim')}
                  onClick={() => setDifficulty(d)}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* 题目内容 */}
          <div>
            <span className="label">题目内容</span>
            <textarea
              className="input min-h-[80px] resize-y"
              placeholder="请输入题目题干..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
          </div>

          {/* 选项（选择题） */}
          {isChoice && (
            <div>
              <span className="label">选项</span>
              <div className="space-y-2">
                {[
                  { label: 'A', val: optionA, set: setOptionA },
                  { label: 'B', val: optionB, set: setOptionB },
                  { label: 'C', val: optionC, set: setOptionC },
                  { label: 'D', val: optionD, set: setOptionD },
                ].map((o) => (
                  <div key={o.label} className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md border border-amber/25 text-bone-muted text-xs font-mono flex items-center justify-center shrink-0">
                      {o.label}
                    </span>
                    <input
                      className="input flex-1"
                      placeholder={`选项 ${o.label}`}
                      value={o.val}
                      onChange={(e) => o.set(e.target.value)}
                    />
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-bone-faint mt-1">
                {type === 'multiple' ? '多选题正确答案用 | 分隔多个选项' : '单选题正确答案填写选项完整文本'}
              </p>
            </div>
          )}

          {/* 正确答案 */}
          <div>
            <span className="label">正确答案</span>
            {isChoice ? (
              <input
                className="input"
                placeholder={type === 'multiple' ? '选项文本 | 选项文本' : '正确选项的完整文本'}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
              />
            ) : (
              <textarea
                className="input min-h-[60px] resize-y"
                placeholder="参考答案..."
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
              />
            )}
          </div>

          {/* 错误作答 */}
          <div>
            <span className="label">你的错误作答</span>
            <textarea
              className="input min-h-[60px] resize-y"
              placeholder="你当时填写的错误答案..."
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
            />
          </div>

          {/* 解析（可选） */}
          <div>
            <span className="label">解析（可选）</span>
            <textarea
              className="input min-h-[50px] resize-y"
              placeholder="解题思路..."
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
            />
          </div>

          {/* 来源与章节（可选） */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="label">来源（可选）</span>
              <input
                className="input"
                placeholder="如：期末试卷、课本P123"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
            </div>
            <div>
              <span className="label">章节（可选）</span>
              <input
                className="input"
                placeholder="如：第三章 进程管理"
                value={chapter}
                onChange={(e) => setChapter(e.target.value)}
              />
            </div>
          </div>

          {error && <p className="text-xs text-rust">{error}</p>}

          <div className="flex gap-2 justify-end pt-2">
            <button className="btn-ghost px-4 py-2 text-sm" onClick={onClose}>
              取消
            </button>
            <button className="btn-primary px-4 py-2 text-sm" onClick={handleSubmit}>
              录入
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
