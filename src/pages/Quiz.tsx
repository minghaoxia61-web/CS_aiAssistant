// 自我测验页：出题 / 答题 / 批改报告
import { useEffect, useState, useCallback } from 'react'
import { ListChecks, Sparkles, Loader2, Check, X, RotateCcw, ChevronRight, ChevronLeft, Trophy, Clock, Trash2 } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'
import { useStore } from '@/lib/store'
import { chatJSON, buildContext, SYSTEM_PROMPTS, buildQuizPrompt, buildGradePrompt, extractJSON } from '@/lib/llm'
import { formatTime, cn } from '@/lib/utils'
import type { Material, QuizSession, QuizQuestion, QuizQuestionType } from '@/shared/types'
import { v4 as uuidv4 } from 'uuid'

type Phase = 'config' | 'taking' | 'report'

const TYPE_OPTIONS: { type: QuizQuestionType; label: string }[] = [
  { type: 'single', label: '单选题' },
  { type: 'multiple', label: '多选题' },
  { type: 'short', label: '简答题' },
]

const DIFFICULTIES = ['基础', '中等', '进阶'] as const

export default function Quiz() {
  const { subjects, currentSubjectId, config } = useStore()
  const [materials, setMaterials] = useState<Material[]>([])
  const [history, setHistory] = useState<QuizSession[]>([])
  const [phase, setPhase] = useState<Phase>('config')
  const [count, setCount] = useState(5)
  const [types, setTypes] = useState<Set<QuizQuestionType>>(new Set(['single', 'multiple']))
  const [difficulty, setDifficulty] = useState<(typeof DIFFICULTIES)[number]>('中等')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [session, setSession] = useState<QuizSession | null>(null)
  const [grading, setGrading] = useState(false)
  const [report, setReport] = useState<QuizSession | null>(null)

  const subject = subjects.find((s) => s.id === currentSubjectId)

  const refresh = useCallback(async () => {
    if (!currentSubjectId) return
    const [mats, hist] = await Promise.all([
      window.api.getMaterials(currentSubjectId),
      window.api.listQuizSessions(currentSubjectId),
    ])
    setMaterials(mats)
    setHistory(hist)
  }, [currentSubjectId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const readyMaterials = materials.filter((m) => m.status === 'ready')

  const toggleType = (t: QuizQuestionType) => {
    setTypes((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  const generate = async () => {
    if (!config?.apiKey || !currentSubjectId) return
    if (types.size === 0) {
      setError('请至少选择一种题型')
      return
    }
    if (readyMaterials.length === 0) {
      setError('暂无可用资料，请先上传')
      return
    }
    setError('')
    setGenerating(true)
    try {
      const context = buildContext(readyMaterials)
      const prompt = buildQuizPrompt(readyMaterials, { count, types: Array.from(types), difficulty })
      const raw = await chatJSON({
        config,
        messages: [
          { role: 'system', content: SYSTEM_PROMPTS.quiz },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
      })
      const arr = extractJSON(raw) as Partial<QuizQuestion>[]
      const qs: QuizQuestion[] = arr.map((q, i) => ({
        id: uuidv4(),
        session_id: '',
        type: (q.type as QuizQuestionType) || 'single',
        question: q.question || `第${i + 1}题`,
        options: q.options || [],
        answer: q.answer || '',
        user_answer: '',
        correct: false,
        explanation: q.explanation || '',
      }))
      const newSession: QuizSession = {
        id: uuidv4(),
        subject_id: currentSubjectId,
        title: `${difficulty}测验 · ${formatTime(Date.now())}`,
        score: 0,
        total: qs.length,
        questions: qs,
        created_at: Date.now(),
      }
      setSession(newSession)
      setQuestions(qs)
      setAnswers({})
      setCurrentIdx(0)
      setPhase('taking')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  const setAnswer = (qid: string, val: string) => {
    setAnswers((prev) => ({ ...prev, [qid]: val }))
  }

  const allAnswered = questions.every((q) => (answers[q.id] || '').trim() !== '')

  const submit = async () => {
    if (!session) return
    setGrading(true)
    let graded = questions.map((q) => ({ ...q, user_answer: answers[q.id] || '' }))

    // 单选/多选本地批改
    graded = graded.map((q) => {
      if (q.type === 'single' || q.type === 'multiple') {
        const ua = (answers[q.id] || '').trim()
        const correct = ua !== '' && normalize(ua) === normalize(q.answer)
        return { ...q, correct }
      }
      return q
    })

    // 简答题用 LLM 批改
    const shortOnes = graded.filter((q) => q.type === 'short')
    if (shortOnes.length > 0) {
      try {
        const raw = await chatJSON({
          config: config!,
          messages: [
            { role: 'system', content: SYSTEM_PROMPTS.grade },
            { role: 'user', content: buildGradePrompt(shortOnes) },
          ],
          temperature: 0.2,
        })
        const results = extractJSON(raw) as { correct: boolean; explanation: string }[]
        graded = graded.map((q) => {
          if (q.type !== 'short') return q
          const idx = shortOnes.findIndex((s) => s.id === q.id)
          if (idx >= 0 && results[idx]) {
            return { ...q, correct: !!results[idx].correct, explanation: results[idx].explanation || q.explanation }
          }
          return q
        })
      } catch {
        // 批改失败，简答题标记为待人工确认
        graded = graded.map((q) => (q.type === 'short' ? { ...q, explanation: '（自动批改失败，请人工核对）' + q.explanation } : q))
      }
    }

    const score = graded.filter((q) => q.correct).length
    const finalSession: QuizSession = { ...session, questions: graded, score }
    await window.api.saveQuizSession(finalSession)
    setReport(finalSession)
    setSession(finalSession)
    setPhase('report')
    setGrading(false)
    refresh()
  }

  const restart = () => {
    setPhase('config')
    setQuestions([])
    setAnswers({})
    setSession(null)
    setReport(null)
    setCurrentIdx(0)
  }

  const viewHistory = (s: QuizSession) => {
    setReport(s)
    setSession(s)
    setPhase('report')
  }

  const handleDeleteHistory = async (id: string) => {
    if (!window.confirm('删除该测验记录？')) return
    await window.api.deleteQuizSession(id)
    if (report?.id === id) restart()
    refresh()
  }

  if (!currentSubjectId) {
    return (
      <div className="h-full overflow-y-auto">
        <PageHeader title="自我测验" subtitle="AI 根据资料出题，作答后自动批改" icon={<ListChecks className="w-5 h-5" />} />
        <EmptyState
          icon={<ListChecks className="w-7 h-7" />}
          title="请先选择或创建科目"
          desc="在左侧选择一个考试科目后，即可开始测验。"
        />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="自我测验"
        subtitle={subject ? `当前科目：${subject.name}` : 'AI 根据资料出题，作答后自动批改'}
        icon={<ListChecks className="w-5 h-5" />}
        actions={phase !== 'config' ? <button className="btn-outline" onClick={restart}><RotateCcw className="w-4 h-4" /> 重新配置</button> : undefined}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* 左侧历史 */}
        <div className="w-60 shrink-0 border-r border-amber/8 overflow-y-auto px-3 py-4 bg-ink-900/30">
          <span className="label px-2">测验记录</span>
          <div className="space-y-1 mt-2">
            {history.length === 0 && <p className="px-2 text-xs text-bone-faint">暂无记录</p>}
            {history.map((s) => (
              <div
                key={s.id}
                className="group flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer hover:bg-ink-800/50 transition-all"
                onClick={() => viewHistory(s)}
              >
                <div className="w-9 h-9 rounded-lg bg-amber/8 border border-amber/15 flex flex-col items-center justify-center shrink-0">
                  <span className="text-xs font-mono text-amber leading-none">{s.score}</span>
                  <span className="text-[8px] text-bone-faint leading-none mt-0.5">/{s.total}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-bone-dim truncate">{s.title}</div>
                  <div className="text-[10px] text-bone-faint">{formatTime(s.created_at)}</div>
                </div>
                <button
                  className="opacity-0 group-hover:opacity-100 text-bone-faint hover:text-rust"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDeleteHistory(s.id)
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* 主区 */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {phase === 'config' && (
            <div className="max-w-2xl mx-auto animate-fade-in">
              <div className="panel p-6 space-y-6">
                <div>
                  <span className="label">题型（可多选）</span>
                  <div className="flex flex-wrap gap-2">
                    {TYPE_OPTIONS.map((t) => (
                      <button
                        key={t.type}
                        className={cn(
                          'chip',
                          types.has(t.type)
                            ? 'border-amber/50 bg-amber/12 text-amber'
                            : 'border-amber/15 text-bone-dim hover:border-amber/30'
                        )}
                        onClick={() => toggleType(t.type)}
                      >
                        {types.has(t.type) && <Check className="w-3 h-3" />}
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="label">题目数量</span>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min={3}
                      max={15}
                      step={1}
                      value={count}
                      onChange={(e) => setCount(parseInt(e.target.value))}
                      className="flex-1 accent-amber"
                    />
                    <span className="font-mono text-amber text-lg w-10 text-right">{count}</span>
                  </div>
                </div>

                <div>
                  <span className="label">难度</span>
                  <div className="flex gap-2">
                    {DIFFICULTIES.map((d) => (
                      <button
                        key={d}
                        className={cn(
                          'chip',
                          difficulty === d
                            ? 'border-amber/50 bg-amber/12 text-amber'
                            : 'border-amber/15 text-bone-dim hover:border-amber/30'
                        )}
                        onClick={() => setDifficulty(d)}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-bone-muted bg-ink-900/50 rounded-lg px-3 py-2.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber" />
                  将基于 {readyMaterials.length} 份已就绪资料出题
                </div>

                {error && <p className="text-xs text-rust">{error}</p>}

                <button className="btn-primary w-full" onClick={generate} disabled={generating}>
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {generating ? 'AI 出题中...' : '开始测验'}
                </button>
              </div>
            </div>
          )}

          {phase === 'taking' && session && (
            <div className="max-w-2xl mx-auto">
              {/* 进度 */}
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-bone-muted">
                  第 <span className="text-amber font-mono">{currentIdx + 1}</span> / {questions.length} 题
                </span>
                <span className="text-xs text-bone-faint">
                  已答 {Object.keys(answers).length} / {questions.length}
                </span>
              </div>
              <div className="h-1 bg-ink-800 rounded-full mb-6 overflow-hidden">
                <div
                  className="h-full bg-amber transition-all duration-300"
                  style={{ width: `${(Object.keys(answers).length / questions.length) * 100}%` }}
                />
              </div>

              <QuestionCard
                question={questions[currentIdx]}
                answer={answers[questions[currentIdx].id] || ''}
                onAnswer={(v) => setAnswer(questions[currentIdx].id, v)}
              />

              <div className="flex items-center justify-between mt-6">
                <button
                  className="btn-ghost"
                  disabled={currentIdx === 0}
                  onClick={() => setCurrentIdx((i) => i - 1)}
                >
                  <ChevronLeft className="w-4 h-4" /> 上一题
                </button>
                {currentIdx < questions.length - 1 ? (
                  <button className="btn-primary" onClick={() => setCurrentIdx((i) => i + 1)}>
                    下一题 <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button className="btn-primary" onClick={submit} disabled={!allAnswered || grading}>
                    {grading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {grading ? '批改中...' : '提交批改'}
                  </button>
                )}
              </div>

              {/* 题目导航 */}
              <div className="flex flex-wrap gap-1.5 mt-6 justify-center">
                {questions.map((q, i) => (
                  <button
                    key={q.id}
                    className={cn(
                      'w-7 h-7 rounded-md text-xs font-mono transition-all',
                      i === currentIdx
                        ? 'bg-amber text-ink-950'
                        : answers[q.id]
                        ? 'bg-sage/20 text-sage-glow border border-sage/30'
                        : 'bg-ink-800 text-bone-faint border border-amber/10'
                    )}
                    onClick={() => setCurrentIdx(i)}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            </div>
          )}

          {phase === 'report' && report && <ReportView session={report} onRestart={restart} />}
        </div>
      </div>
    </div>
  )
}

function QuestionCard({
  question,
  answer,
  onAnswer,
}: {
  question: QuizQuestion
  answer: string
  onAnswer: (v: string) => void
}) {
  const typeLabel = question.type === 'single' ? '单选题' : question.type === 'multiple' ? '多选题' : '简答题'
  return (
    <div className="panel p-6 animate-fade-in">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-amber/10 text-amber-dim">
          {typeLabel}
        </span>
      </div>
      <p className="text-bone text-base leading-relaxed mb-5">{question.question}</p>

      {question.type === 'short' ? (
        <textarea
          className="input min-h-[120px] resize-y"
          placeholder="请输入你的答案..."
          value={answer}
          onChange={(e) => onAnswer(e.target.value)}
        />
      ) : (
        <div className="space-y-2">
          {question.options.map((opt, i) => {
            const letter = String.fromCharCode(65 + i)
            const selected = answer.includes(opt)
            return (
              <button
                key={i}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all',
                  selected
                    ? 'border-amber/45 bg-amber/10 text-bone'
                    : 'border-amber/12 bg-ink-900/40 text-bone-dim hover:border-amber/25 hover:bg-ink-800/50'
                )}
                onClick={() => {
                  if (question.type === 'single') {
                    onAnswer(opt)
                  } else {
                    const list = answer ? answer.split('|') : []
                    const next = list.includes(opt) ? list.filter((x) => x !== opt) : [...list, opt]
                    onAnswer(next.join('|'))
                  }
                }}
              >
                <span
                  className={cn(
                    'w-6 h-6 rounded-md border flex items-center justify-center text-xs font-mono shrink-0',
                    selected ? 'bg-amber border-amber text-ink-950' : 'border-amber/25 text-bone-muted'
                  )}
                >
                  {letter}
                </span>
                <span className="text-sm">{opt}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ReportView({ session, onRestart }: { session: QuizSession; onRestart: () => void }) {
  const pct = session.total > 0 ? Math.round((session.score / session.total) * 100) : 0
  const correct = session.questions.filter((q) => q.correct).length
  const wrong = session.total - correct
  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      {/* 得分概览 */}
      <div className="panel p-6 mb-6 flex items-center gap-6">
        <ScoreRing pct={pct} />
        <div className="flex-1">
          <h3 className="font-display text-2xl text-bone mb-1">{session.title}</h3>
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1.5 text-sage-glow">
              <Check className="w-4 h-4" /> 正确 {correct}
            </span>
            <span className="flex items-center gap-1.5 text-rust">
              <X className="w-4 h-4" /> 错误 {wrong}
            </span>
            <span className="flex items-center gap-1.5 text-bone-muted">
              <Clock className="w-4 h-4" /> {formatTime(session.created_at)}
            </span>
          </div>
          <button className="btn-outline mt-4" onClick={onRestart}>
            <RotateCcw className="w-4 h-4" /> 再来一组
          </button>
        </div>
      </div>

      {/* 逐题解析 */}
      <div className="space-y-3">
        {session.questions.map((q, i) => (
          <div
            key={q.id}
            className={cn(
              'panel p-5 border-l-4',
              q.correct ? 'border-l-sage' : 'border-l-rust'
            )}
          >
            <div className="flex items-start gap-3 mb-3">
              <span
                className={cn(
                  'w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-xs',
                  q.correct ? 'bg-sage/20 text-sage-glow' : 'bg-rust/20 text-rust'
                )}
              >
                {q.correct ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
              </span>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-bone-faint font-mono">第 {i + 1} 题</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber/10 text-amber-dim">
                    {q.type === 'single' ? '单选' : q.type === 'multiple' ? '多选' : '简答'}
                  </span>
                </div>
                <p className="text-sm text-bone mb-3">{q.question}</p>

                {q.options.length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {q.options.map((opt, oi) => {
                      const isAnswer = q.answer.includes(opt)
                      const isUser = q.user_answer.includes(opt)
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

                {q.type === 'short' && (
                  <div className="mb-2 text-sm">
                    <span className="text-bone-faint">你的作答：</span>
                    <span className="text-bone-dim">{q.user_answer || '（未作答）'}</span>
                  </div>
                )}

                <div className="text-sm">
                  <span className="text-bone-faint">参考答案：</span>
                  <span className="text-sage-glow">{q.answer}</span>
                </div>
                {q.explanation && (
                  <div className="mt-2 text-sm text-bone-dim bg-ink-900/50 rounded-lg px-3 py-2">
                    <span className="text-amber-dim font-medium">解析：</span>
                    {q.explanation}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ScoreRing({ pct }: { pct: number }) {
  const r = 36
  const c = 2 * Math.PI * r
  const offset = c - (pct / 100) * c
  return (
    <div className="relative w-24 h-24 shrink-0">
      <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} fill="none" stroke="rgba(232,185,116,0.12)" strokeWidth="6" />
        <circle
          cx="48"
          cy="48"
          r={r}
          fill="none"
          stroke={pct >= 60 ? '#8ba888' : '#c87555'}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-2xl text-bone leading-none">{pct}</span>
        <span className="text-[10px] text-bone-muted mt-0.5">得分</span>
      </div>
    </div>
  )
}

function normalize(s: string): string {
  return s.split('|').map((x) => x.trim()).filter(Boolean).sort().join('|')
}
