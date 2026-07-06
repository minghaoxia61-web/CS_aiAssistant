// 自我测验页：出题 / 答题 / 批改报告
// 支持：题型占比、难度分层、定向章节、错题集出题、试卷保存复用、PDF 导出
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { ListChecks, Sparkles, Loader2, Check, X, RotateCcw, ChevronRight, ChevronLeft, Clock, Trash2, Save, FileDown, RefreshCw, AlertCircle, BookMarked, Bug, Zap, Gauge, Timer } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'
import { useStore } from '@/lib/store'
import { confirmDialog } from '@/lib/dialog'
import { chatJSON, SYSTEM_PROMPTS, buildQuizPrompt, buildGradePrompt, extractJSON, buildContextSmart, type GradeResult } from '@/lib/llm'
import { formatTime, cn } from '@/lib/utils'
import type { Material, QuizSession, QuizQuestion, QuizQuestionType, QuizDifficulty, QuizRatios, CodeIssue, ScoringPoint } from '@/shared/types'
import { v4 as uuidv4 } from 'uuid'

type Phase = 'config' | 'taking' | 'report'

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

export default function Quiz() {
  const { subjects, currentSubjectId, config } = useStore()
  const location = useLocation()
  const [materials, setMaterials] = useState<Material[]>([])
  const [history, setHistory] = useState<QuizSession[]>([])
  const [phase, setPhase] = useState<Phase>('config')
  const [count, setCount] = useState(5)
  const [types, setTypes] = useState<Set<QuizQuestionType>>(new Set(['single', 'multiple']))
  const [ratios, setRatios] = useState<QuizRatios>({ single: 50, multiple: 50 })
  const [difficulty, setDifficulty] = useState<QuizDifficulty>('中档')
  const [chapters, setChapters] = useState<string[]>([])
  const [chapterInput, setChapterInput] = useState('')
  const [wrongOnly, setWrongOnly] = useState(false)
  const [saveAsTemplate, setSaveAsTemplate] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genStatus, setGenStatus] = useState('')
  const [error, setError] = useState('')

  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [session, setSession] = useState<QuizSession | null>(null)
  const [grading, setGrading] = useState(false)
  const [report, setReport] = useState<QuizSession | null>(null)

  // 模拟考场计时模式
  const [timerEnabled, setTimerEnabled] = useState(false)
  const [timerMinutes, setTimerMinutes] = useState(60)
  const [timeLeft, setTimeLeft] = useState(0)
  const [questionTimes, setQuestionTimes] = useState<Record<string, number>>({})
  const timerEndRef = useRef(0)
  const qEnterRef = useRef(0)
  const curQidRef = useRef('')
  const submitRef = useRef<(auto?: boolean) => void>(() => {})
  const retakeRef = useRef<(s: QuizSession) => void>(() => {})

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

  // 从错题本跳转过来时，自动加载指定试卷进入作答
  const startSessionId = (location.state as { startSessionId?: string } | null)?.startSessionId
  useEffect(() => {
    if (!startSessionId || history.length === 0) return
    const target = history.find((s) => s.id === startSessionId)
    if (target) {
      retakeRef.current(target)
      // 清除 state 避免重复触发
      window.history.replaceState({}, '')
    }
  }, [startSessionId, history])

  // 单题耗时统计：切换题目时记录上一题耗时
  useEffect(() => {
    if (phase !== 'taking' || questions.length === 0) return
    const curId = questions[currentIdx].id
    if (curQidRef.current && curQidRef.current !== curId) {
      const delta = Date.now() - qEnterRef.current
      setQuestionTimes((prev) => ({ ...prev, [curQidRef.current]: (prev[curQidRef.current] || 0) + delta }))
    }
    curQidRef.current = curId
    qEnterRef.current = Date.now()
  }, [currentIdx, phase, questions])

  // 计时模式倒计时：最后 5 分钟变红，时间到自动提交
  useEffect(() => {
    if (phase !== 'taking' || !timerEnabled || !timerEndRef.current) return
    const tick = () => {
      const left = Math.max(0, Math.floor((timerEndRef.current - Date.now()) / 1000))
      setTimeLeft(left)
      if (left <= 0) {
        clearInterval(id)
        submitRef.current(true)
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [phase, timerEnabled])

  const readyMaterials = materials.filter((m) => m.status === 'ready')

  // 从资料中提取章节标题（Markdown 标题行）
  const availableChapters = useMemo(() => {
    const set = new Set<string>()
    for (const m of readyMaterials) {
      const lines = (m.text_content || '').split('\n')
      for (const line of lines) {
        const m1 = line.match(/^#{1,3}\s+(.+)$/)
        if (m1) set.add(m1[1].trim())
      }
    }
    return Array.from(set).slice(0, 30)
  }, [readyMaterials])

  // 错题集：从历史中收集做错的题目
  const wrongQuestions = useMemo(() => {
    const all: QuizQuestion[] = []
    for (const s of history) {
      for (const q of s.questions) {
        if (!q.correct && q.user_answer) {
          all.push({ ...q, is_wrong: true })
        }
      }
    }
    return all
  }, [history])

  const toggleType = (t: QuizQuestionType) => {
    setTypes((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      // 重新分配占比
      const arr = Array.from(next)
      const equal = Math.round(100 / arr.length)
      const newRatios: QuizRatios = {}
      arr.forEach((t, i) => {
        newRatios[t] = i === arr.length - 1 ? 100 - equal * (arr.length - 1) : equal
      })
      setRatios(newRatios)
      return next
    })
  }

  const updateRatio = (t: QuizQuestionType, val: number) => {
    setRatios((prev) => ({ ...prev, [t]: val }))
  }

  const addChapter = (ch: string) => {
    const trimmed = ch.trim()
    if (trimmed && !chapters.includes(trimmed)) {
      setChapters([...chapters, trimmed])
    }
    setChapterInput('')
  }

  const removeChapter = (ch: string) => {
    setChapters(chapters.filter((c) => c !== ch))
  }

  const generate = async () => {
    if (!config || !currentSubjectId) return
    if (types.size === 0) {
      setError('请至少选择一种题型')
      return
    }
    if (wrongOnly && wrongQuestions.length === 0) {
      setError('错题集为空，无法出题')
      return
    }
    if (!wrongOnly && readyMaterials.length === 0) {
      setError('暂无可用资料，请先上传')
      return
    }
    setError('')
    setGenerating(true)
    try {
      // 智能构建上下文：资料多时先逐份压缩（Map-Reduce），避免超 token 限制
      const context = wrongOnly
        ? ''
        : await buildContextSmart(readyMaterials, config, undefined, (msg) => {
            setGenStatus(msg)
          })
      const prompt = buildQuizPrompt(context, {
        count,
        types: Array.from(types),
        difficulty,
        ratios,
        chapters: chapters.length > 0 ? chapters : undefined,
        wrongOnly,
        wrongQuestions: wrongOnly ? wrongQuestions : undefined,
        timer: timerEnabled ? timerMinutes : undefined,
      })
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
        chapter: q.chapter || '',
      }))
      const newSession: QuizSession = {
        id: uuidv4(),
        subject_id: currentSubjectId,
        title: `${difficulty}测验 · ${formatTime(Date.now())}`,
        score: 0,
        total: qs.length,
        questions: qs,
        created_at: Date.now(),
        saved: saveAsTemplate,
        attempts: 0,
      }
      // 如果标记为可复用试卷，立即保存
      if (saveAsTemplate) {
        await window.api.saveQuizSession(newSession)
      }
      setSession(newSession)
      setQuestions(qs)
      setAnswers({})
      setCurrentIdx(0)
      // 初始化计时与单题耗时统计
      setQuestionTimes({})
      curQidRef.current = ''
      qEnterRef.current = Date.now()
      if (timerEnabled) {
        timerEndRef.current = Date.now() + timerMinutes * 60 * 1000
        setTimeLeft(timerMinutes * 60)
      }
      setPhase('taking')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGenerating(false)
      setGenStatus('')
    }
  }

  const setAnswer = (qid: string, val: string) => {
    setAnswers((prev) => ({ ...prev, [qid]: val }))
  }

  const allAnswered = questions.every((q) => (answers[q.id] || '').trim() !== '')
  const unansweredCount = questions.filter((q) => !(answers[q.id] || '').trim()).length

  const submit = async (auto = false) => {
    if (!session || grading) return
    // 计时模式自动提交跳过未作答确认
    if (!auto && unansweredCount > 0) {
      const ok = await confirmDialog(`还有 ${unansweredCount} 道题未作答，确定提交批改？`, { danger: true })
      if (!ok) return
    }
    setGrading(true)
    // 统计单题耗时（秒）：补全当前题目耗时
    const now = Date.now()
    const finalTimes: Record<string, number> = { ...questionTimes }
    if (curQidRef.current) {
      const delta = now - qEnterRef.current
      finalTimes[curQidRef.current] = (finalTimes[curQidRef.current] || 0) + delta
    }
    let graded = questions.map((q) => ({
      ...q,
      user_answer: answers[q.id] || '',
      time_spent: finalTimes[q.id] ? Math.round(finalTimes[q.id] / 1000) : q.time_spent,
    }))

    // 单选/多选本地批改
    graded = graded.map((q) => {
      if (q.type === 'single' || q.type === 'multiple') {
        const ua = (answers[q.id] || '').trim()
        const correct = ua !== '' && normalize(ua) === normalize(q.answer)
        return { ...q, correct }
      }
      return q
    })

    // 简答/代码题用 LLM 批改
    const needGrade = graded.filter((q) => q.type === 'short' || q.type === 'code')
    if (needGrade.length > 0) {
      try {
        const raw = await chatJSON({
          config: config!,
          messages: [
            { role: 'system', content: SYSTEM_PROMPTS.grade },
            { role: 'user', content: buildGradePrompt(needGrade) },
          ],
          temperature: 0.2,
        })
        const results = extractJSON(raw) as GradeResult[]
        graded = graded.map((q) => {
          if (q.type !== 'short' && q.type !== 'code') return q
          const idx = needGrade.findIndex((s) => s.id === q.id)
          if (idx >= 0 && results[idx]) {
            const r = results[idx]
            const patch: Partial<QuizQuestion> = {
              correct: !!r.correct,
              explanation: r.explanation || q.explanation,
            }
            if (q.type === 'code') {
              patch.score = typeof r.score === 'number' ? r.score : undefined
              patch.issues = (r.issues || []) as CodeIssue[]
              patch.standard_solution = r.standard_solution
            }
            if (q.type === 'short') {
              patch.scoring_points = (r.scoring_points || []) as ScoringPoint[]
            }
            return { ...q, ...patch }
          }
          return q
        })
      } catch {
        graded = graded.map((q) =>
          (q.type === 'short' || q.type === 'code')
            ? { ...q, explanation: '（自动批改失败，请人工核对）' + q.explanation }
            : q
        )
      }
    }

    const score = graded.filter((q) => q.correct).length
    const attempts = (session.attempts || 0) + 1
    const finalSession: QuizSession = {
      ...session,
      questions: graded,
      score,
      attempts,
      last_attempt_at: Date.now(),
    }
    await window.api.saveQuizSession(finalSession)
    setReport(finalSession)
    setSession(finalSession)
    setPhase('report')
    setGrading(false)
    refresh()
  }
  submitRef.current = submit

  const restart = () => {
    setPhase('config')
    setQuestions([])
    setAnswers({})
    setSession(null)
    setReport(null)
    setCurrentIdx(0)
    setSaveAsTemplate(false)
    setQuestionTimes({})
    curQidRef.current = ''
    timerEndRef.current = 0
    setTimeLeft(0)
  }

  /** 重新作答同一份试卷（重置答案） */
  const retake = (s: QuizSession) => {
    const resetQuestions = s.questions.map((q) => ({
      ...q,
      user_answer: '',
      correct: false,
      time_spent: undefined,
    }))
    setSession(s)
    setQuestions(resetQuestions)
    setAnswers({})
    setCurrentIdx(0)
    setReport(null)
    setQuestionTimes({})
    curQidRef.current = ''
    qEnterRef.current = Date.now()
    if (timerEnabled) {
      timerEndRef.current = Date.now() + timerMinutes * 60 * 1000
      setTimeLeft(timerMinutes * 60)
    }
    setPhase('taking')
  }
  retakeRef.current = retake

  const viewHistory = (s: QuizSession) => {
    setReport(s)
    setSession(s)
    setPhase('report')
  }

  const handleDeleteHistory = async (id: string) => {
    if (!(await confirmDialog('删除该测验记录？', { danger: true }))) return
    await window.api.deleteQuizSession(id)
    if (report?.id === id) restart()
    refresh()
  }

  /** 导出 PDF（打印） */
  const exportPDF = (s: QuizSession) => {
    const win = window.open('', '_blank', 'width=900,height=700')
    if (!win) return
    const html = buildPrintHTML(s)
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => {
      win.print()
    }, 500)
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

  const ratioTotal = Array.from(types).reduce((sum, t) => sum + (ratios[t] || 0), 0)

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
        <div className="w-60 shrink-0 border-r border-amber/8 overflow-y-auto px-3 py-4 glass-sidebar">
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
                  <div className="text-sm text-bone-dim truncate flex items-center gap-1">
                    {s.saved && <Save className="w-3 h-3 text-sage-glow shrink-0" />}
                    {s.title}
                  </div>
                  <div className="text-[10px] text-bone-faint">
                    {formatTime(s.created_at)}
                    {s.attempts ? ` · 作答${s.attempts}次` : ''}
                  </div>
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

          {/* 错题集统计 */}
          <div className="mt-4 px-2">
            <div className="label flex items-center gap-1.5">
              <AlertCircle className="w-3 h-3 text-rust" /> 错题集
            </div>
            <p className="text-xs text-bone-faint mt-1">
              共 <span className="text-rust font-mono">{wrongQuestions.length}</span> 道错题
            </p>
            {wrongQuestions.length > 0 && (
              <button
                className={cn('chip mt-2 w-full justify-center', wrongOnly ? 'border-rust/50 bg-rust/12 text-rust' : 'border-amber/15 text-bone-dim')}
                onClick={() => setWrongOnly(!wrongOnly)}
              >
                {wrongOnly ? '已开启错题专项' : '错题专项出题'}
              </button>
            )}
          </div>
        </div>

        {/* 主区 */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {phase === 'config' && (
            <div className="max-w-2xl mx-auto animate-fade-in">
              <div className="panel card-3d p-6 space-y-6">
                {/* 题型选择 */}
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

                {/* 题型占比 */}
                {types.size > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="label">题型占比</span>
                      <span className={cn('text-xs font-mono', ratioTotal === 100 ? 'text-sage-glow' : 'text-rust')}>
                        合计 {ratioTotal}%
                      </span>
                    </div>
                    <div className="space-y-3">
                      {Array.from(types).map((t) => (
                        <div key={t} className="flex items-center gap-3">
                          <span className="text-sm text-bone-dim w-20 shrink-0">{TYPE_LABEL[t]}</span>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={5}
                            value={ratios[t] || 0}
                            onChange={(e) => updateRatio(t, parseInt(e.target.value))}
                            className="flex-1 accent-amber"
                          />
                          <span className="font-mono text-amber text-sm w-10 text-right">{ratios[t] || 0}%</span>
                        </div>
                      ))}
                    </div>
                    {ratioTotal !== 100 && (
                      <p className="text-[10px] text-bone-faint mt-1.5">提示：占比合计建议为 100%，否则将按比例分配</p>
                    )}
                  </div>
                )}

                {/* 题目数量 */}
                <div>
                  <span className="label">题目数量</span>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min={3}
                      max={20}
                      step={1}
                      value={count}
                      onChange={(e) => setCount(parseInt(e.target.value))}
                      className="flex-1 accent-amber"
                    />
                    <span className="font-mono text-amber text-lg w-10 text-right">{count}</span>
                  </div>
                </div>

                {/* 难度分层 */}
                <div>
                  <span className="label">难度分层</span>
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

                {/* 模拟考场计时模式 */}
                <div>
                  <label className="flex items-center gap-2.5 cursor-pointer text-sm text-bone-dim">
                    <input
                      type="checkbox"
                      checked={timerEnabled}
                      onChange={(e) => setTimerEnabled(e.target.checked)}
                      className="accent-amber w-4 h-4"
                    />
                    <Timer className="w-3.5 h-3.5 text-amber" />
                    模拟考场计时模式
                  </label>
                  {timerEnabled && (
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      <span className="text-xs text-bone-faint mr-1">总时长</span>
                      {[60, 90, 120].map((m) => (
                        <button
                          key={m}
                          className={cn(
                            'chip',
                            timerMinutes === m
                              ? 'border-amber/50 bg-amber/12 text-amber'
                              : 'border-amber/15 text-bone-dim hover:border-amber/30'
                          )}
                          onClick={() => setTimerMinutes(m)}
                        >
                          {m} 分钟
                        </button>
                      ))}
                      <p className="text-[10px] text-bone-faint w-full mt-1">开启后倒计时显示在答题页顶部，最后 5 分钟变红，时间到自动提交，并统计每题耗时</p>
                    </div>
                  )}
                </div>

                {/* 定向章节 */}
                {!wrongOnly && (
                  <div>
                    <span className="label flex items-center gap-1.5">
                      <BookMarked className="w-3 h-3" /> 定向章节（可选）
                    </span>
                    {chapters.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {chapters.map((ch) => (
                          <span key={ch} className="chip border-amber/30 bg-amber/8 text-amber-dim">
                            {ch}
                            <button onClick={() => removeChapter(ch)} className="ml-1 hover:text-rust">
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <input
                        className="input flex-1"
                        placeholder="输入章节关键词后回车，或点击下方推荐"
                        value={chapterInput}
                        onChange={(e) => setChapterInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            addChapter(chapterInput)
                          }
                        }}
                      />
                      <button className="btn-outline" onClick={() => addChapter(chapterInput)}>
                        添加
                      </button>
                    </div>
                    {availableChapters.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {availableChapters.slice(0, 10).map((ch) => (
                          <button
                            key={ch}
                            className="chip text-[10px] border-amber/12 text-bone-faint hover:border-amber/25 hover:text-bone-dim"
                            onClick={() => addChapter(ch)}
                          >
                            + {ch}
                          </button>
                        ))}
                      </div>
                    )}
                    <p className="text-[10px] text-bone-faint mt-1.5">不选则从全部资料出题</p>
                  </div>
                )}

                {/* 错题集模式提示 */}
                {wrongOnly && (
                  <div className="flex items-center gap-2 text-xs text-rust bg-rust/8 rounded-lg px-3 py-2.5 border border-rust/15">
                    <AlertCircle className="w-3.5 h-3.5" />
                    错题专项模式：将基于 {wrongQuestions.length} 道历史错题生成变式题
                  </div>
                )}

                {/* 保存为可复用试卷 */}
                <label className="flex items-center gap-2.5 cursor-pointer text-sm text-bone-dim">
                  <input
                    type="checkbox"
                    checked={saveAsTemplate}
                    onChange={(e) => setSaveAsTemplate(e.target.checked)}
                    className="accent-amber w-4 h-4"
                  />
                  <Save className="w-3.5 h-3.5 text-amber" />
                  保存为可复用试卷（本地存储，可重复作答、导出 PDF）
                </label>

                {/* 资料提示 */}
                {!wrongOnly && (
                  <div className="flex items-center gap-2 text-xs text-bone-muted bg-ink-850/60 rounded-lg px-3 py-2.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber" />
                    将基于 {readyMaterials.length} 份已就绪资料出题
                  </div>
                )}

                {error && <p className="text-xs text-rust">{error}</p>}
                {generating && genStatus && (
                  <p className="text-xs text-steel/70 flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {genStatus}
                  </p>
                )}

                <button className="btn-primary w-full" onClick={generate} disabled={generating}>
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {generating ? 'AI 出题中...' : '开始测验'}
                </button>
              </div>
            </div>
          )}

          {phase === 'taking' && session && (
            <div className="max-w-2xl mx-auto">
              {/* 计时模式倒计时 */}
              {timerEnabled && (
                <div className={cn(
                  'flex items-center justify-center gap-2.5 mb-4 px-5 py-3 rounded-2xl border transition-all duration-300',
                  timeLeft <= 300
                    ? 'border-rust/40 bg-rust/10 text-rust shadow-glow'
                    : 'border-amber/20 glass text-amber'
                )}>
                  <Timer className="w-4 h-4" />
                  <span className="font-mono text-lg font-semibold tabular-nums">{formatDuration(timeLeft)}</span>
                  <span className="text-xs opacity-70">剩余时间</span>
                  {timeLeft <= 300 && timeLeft > 0 && (
                    <span className="text-xs animate-pulse">即将结束</span>
                  )}
                  {timeLeft <= 0 && <span className="text-xs">时间到，正在提交…</span>}
                </div>
              )}
              {/* 进度 */}
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-bone-muted">
                  第 <span className="text-amber font-mono">{currentIdx + 1}</span> / {questions.length} 题
                </span>
                <span className="text-xs text-bone-faint">
                  已答 {Object.keys(answers).length} / {questions.length}
                </span>
              </div>
              <div className="h-1.5 bg-ink-800 rounded-full mb-6 overflow-hidden">
                <div
                  className="h-full progress-gradient rounded-full transition-all duration-500"
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
                  <button className="btn-primary" onClick={() => submit()} disabled={grading}>
                    {grading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {grading ? '批改中...' : unansweredCount > 0 ? `提交批改（${unansweredCount}题未答）` : '提交批改'}
                  </button>
                )}
              </div>

              {/* 题目导航 */}
              <div className="flex flex-wrap gap-1.5 mt-6 justify-center">
                {questions.map((q, i) => {
                  const answered = (answers[q.id] || '').trim() !== ''
                  return (
                    <button
                    key={i}
                    className={cn(
                      'w-7 h-7 rounded-lg text-xs font-mono transition-all duration-300',
                      i === currentIdx
                        ? 'bg-gradient-to-br from-amber to-amber-glow text-white shadow-glow'
                        : answered
                        ? 'bg-sage/20 text-sage-glow border border-sage/30'
                        : 'bg-rust/15 text-rust border border-rust/25'
                    )}
                      onClick={() => setCurrentIdx(i)}
                    >
                      {i + 1}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {phase === 'report' && report && (
            <ReportView
              session={report}
              onRestart={restart}
              onRetake={() => retake(report)}
              onExportPDF={() => exportPDF(report)}
            />
          )}
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
  return (
    <div className="panel card-3d p-6 animate-fade-in">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-amber/10 text-amber-dim">
          {TYPE_LABEL[question.type]}
        </span>
        {question.chapter && (
          <span className="text-[10px] px-2 py-0.5 rounded bg-ink-800 text-bone-faint">
            {question.chapter}
          </span>
        )}
      </div>
      <p className="text-bone text-base leading-relaxed mb-5 whitespace-pre-wrap">{question.question}</p>

      {question.type === 'short' ? (
        <textarea
          className="input min-h-[120px] resize-y"
          placeholder="请输入你的答案..."
          value={answer}
          onChange={(e) => onAnswer(e.target.value)}
        />
      ) : question.type === 'code' ? (
        <div>
          <textarea
            className="input min-h-[200px] resize-y font-mono text-sm"
            placeholder="请在此输入代码或计算过程..."
            value={answer}
            onChange={(e) => onAnswer(e.target.value)}
            spellCheck={false}
          />
          <p className="text-[10px] text-bone-faint mt-1.5">代码计算题：支持多行输入，提交后由 AI 批改</p>
        </div>
      ) : (
        <div className="space-y-2">
          {question.options.map((opt, i) => {
            const letter = String.fromCharCode(65 + i)
            const selected = answer.includes(opt)
            return (
              <button
                key={i}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border text-left transition-all duration-300',
                  selected
                    ? 'border-amber/45 bg-amber/10 text-bone shadow-glow'
                    : 'border-amber/10 bg-ink-850/30 text-bone-dim hover:border-amber/25 hover:bg-ink-800/40 hover:shadow-glow-sage'
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
                    selected ? 'bg-amber border-amber text-white' : 'border-amber/25 text-bone-muted'
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

function ReportView({
  session,
  onRestart,
  onRetake,
  onExportPDF,
}: {
  session: QuizSession
  onRestart: () => void
  onRetake: () => void
  onExportPDF: () => void
}) {
  const pct = session.total > 0 ? Math.round((session.score / session.total) * 100) : 0
  const correct = session.questions.filter((q) => q.correct).length
  const wrong = session.total - correct
  const totalTime = session.questions.reduce((s, q) => s + (q.time_spent || 0), 0)
  const hasTiming = session.questions.some((q) => typeof q.time_spent === 'number')
  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      {/* 得分概览 */}
      <div className="panel p-6 mb-6 flex items-center gap-6">
        <ScoreRing pct={pct} />
        <div className="flex-1">
          <h3 className="font-display text-2xl text-bone mb-1">{session.title}</h3>
          <div className="flex items-center gap-4 text-sm flex-wrap">
            <span className="flex items-center gap-1.5 text-sage-glow">
              <Check className="w-4 h-4" /> 正确 {correct}
            </span>
            <span className="flex items-center gap-1.5 text-rust">
              <X className="w-4 h-4" /> 错误 {wrong}
            </span>
            <span className="flex items-center gap-1.5 text-bone-muted">
              <Clock className="w-4 h-4" /> {formatTime(session.created_at)}
            </span>
            {hasTiming && (
              <span className="flex items-center gap-1.5 text-bone-muted">
                <Timer className="w-3.5 h-3.5" /> 总用时 {formatDuration(totalTime)}
              </span>
            )}
            {session.attempts && session.attempts > 1 && (
              <span className="flex items-center gap-1.5 text-bone-muted">
                <RefreshCw className="w-3.5 h-3.5" /> 第 {session.attempts} 次作答
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <button className="btn-outline" onClick={onRestart}>
              <RotateCcw className="w-4 h-4" /> 重新配置
            </button>
            <button className="btn-outline" onClick={onRetake}>
              <RefreshCw className="w-4 h-4" /> 再考一次
            </button>
            <button className="btn-outline" onClick={onExportPDF}>
              <FileDown className="w-4 h-4" /> 导出 PDF
            </button>
          </div>
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
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-xs text-bone-faint font-mono">第 {i + 1} 题</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber/10 text-amber-dim">
                    {TYPE_LABEL[q.type]}
                  </span>
                  {q.chapter && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink-800 text-bone-faint">
                      {q.chapter}
                    </span>
                  )}
                  {typeof q.time_spent === 'number' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink-800 text-bone-faint flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" /> {formatDuration(q.time_spent)}
                    </span>
                  )}
                </div>
                <p className="text-sm text-bone mb-3 whitespace-pre-wrap">{q.question}</p>

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

                {(q.type === 'short' || q.type === 'code') && (
                  <div className="mb-2 text-sm">
                    <span className="text-bone-faint">你的作答：</span>
                    <pre className="text-bone-dim bg-ink-850/60 rounded-lg px-3 py-2 mt-1 whitespace-pre-wrap font-mono text-xs">
                      {q.user_answer || '（未作答）'}
                    </pre>
                  </div>
                )}

                <div className="text-sm">
                  <span className="text-bone-faint">参考答案：</span>
                  <pre className="text-sage-glow bg-ink-850/60 rounded-lg px-3 py-2 mt-1 whitespace-pre-wrap font-mono text-xs inline-block">
                    {q.answer}
                  </pre>
                </div>

                {/* 代码题批改明细：得分 + 问题列表 + 标准实现 */}
                {q.type === 'code' && (typeof q.score === 'number' || (q.issues && q.issues.length > 0)) && (
                  <div className="mt-3 space-y-2.5">
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
                            <span className="shrink-0 font-mono font-bold uppercase tracking-wider">
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

                {/* 简答题批改明细：逐条得分点 + 课件来源 */}
                {q.type === 'short' && q.scoring_points && q.scoring_points.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs text-amber-dim font-medium">
                      <Zap className="w-3.5 h-3.5" /> 得分点（{q.scoring_points.filter((p) => p.awarded).length}/{q.scoring_points.length}）
                    </div>
                    {q.scoring_points.map((sp, si) => (
                      <div
                        key={si}
                        className={cn(
                          'flex items-start gap-2 px-3 py-2 rounded-lg text-xs border',
                          sp.awarded
                            ? 'bg-sage/8 border-sage/20'
                            : 'bg-rust/8 border-rust/20'
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
                        <span className={cn('flex-1', sp.awarded ? 'text-bone-dim' : 'text-bone-muted')}>
                          {sp.point}
                        </span>
                        {sp.source && (
                          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-ink-800 text-bone-faint flex items-center gap-1">
                            <BookMarked className="w-2.5 h-2.5" /> {sp.source}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {q.explanation && (
                  <div className="mt-2 text-sm text-bone-dim bg-ink-850/60 rounded-lg px-3 py-2">
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
        <defs>
          <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={pct >= 60 ? '#6a9a66' : '#c25a3e'} />
            <stop offset="100%" stopColor={pct >= 60 ? '#80b87c' : '#e06a50'} />
          </linearGradient>
        </defs>
        <circle cx="48" cy="48" r={r} fill="none" stroke="var(--border-amber)" strokeWidth="6" className="score-ring-track" />
        <circle
          cx="48"
          cy="48"
          r={r}
          fill="none"
          stroke="url(#scoreGradient)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="score-ring-fill"
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

/** 秒数格式化为 mm:ss */
function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** 构建打印用 HTML（用于 PDF 导出） */
function buildPrintHTML(s: QuizSession): string {
  const pct = s.total > 0 ? Math.round((s.score / s.total) * 100) : 0
  const typeLabel: Record<string, string> = {
    single: '单选题',
    multiple: '多选题',
    short: '简答题',
    code: '代码计算题',
  }
  const questionsHtml = s.questions.map((q, i) => {
    const optsHtml = q.options.length
      ? q.options.map((opt, oi) => {
          const isAnswer = q.answer.includes(opt)
          const isUser = q.user_answer.includes(opt)
          const cls = isAnswer ? 'correct' : isUser ? 'wrong' : ''
          return `<li class="${cls}"><b>${String.fromCharCode(65 + oi)}.</b> ${escapeHtml(opt)} ${isAnswer ? '✓' : ''}</li>`
        }).join('')
      : ''
    return `
      <div class="question ${q.correct ? 'q-correct' : 'q-wrong'}">
        <div class="q-header">
          <span class="q-num">第 ${i + 1} 题</span>
          <span class="q-type">${typeLabel[q.type] || q.type}</span>
          ${q.chapter ? `<span class="q-chapter">${escapeHtml(q.chapter)}</span>` : ''}
          <span class="q-result">${q.correct ? '✓ 正确' : '✗ 错误'}</span>
        </div>
        <div class="q-body">${escapeHtml(q.question)}</div>
        ${optsHtml ? `<ul class="q-opts">${optsHtml}</ul>` : ''}
        ${(q.type === 'short' || q.type === 'code') && q.user_answer ? `
          <div class="q-ans"><b>你的作答：</b><pre>${escapeHtml(q.user_answer)}</pre></div>
        ` : ''}
        <div class="q-ans"><b>参考答案：</b><pre>${escapeHtml(q.answer)}</pre></div>
        ${q.explanation ? `<div class="q-expl"><b>解析：</b>${escapeHtml(q.explanation)}</div>` : ''}
      </div>
    `
  }).join('')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(s.title)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; padding: 32px; color: #222; line-height: 1.6; }
  h1 { font-size: 22px; margin-bottom: 8px; }
  .meta { font-size: 13px; color: #666; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 2px solid #b8860b; }
  .score-box { display: inline-block; background: #f0f0f0; padding: 8px 16px; border-radius: 6px; margin-right: 12px; font-size: 14px; }
  .score-box b { color: #b8860b; font-size: 18px; }
  .question { margin-bottom: 20px; padding: 16px; border: 1px solid #ddd; border-radius: 6px; border-left: 4px solid #ccc; }
  .q-correct { border-left-color: #4a7c59; }
  .q-wrong { border-left-color: #c87555; }
  .q-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 12px; flex-wrap: wrap; }
  .q-num { font-weight: bold; }
  .q-type, .q-chapter { background: #f0f0f0; padding: 2px 8px; border-radius: 3px; color: #555; }
  .q-result { margin-left: auto; font-weight: bold; }
  .q-correct .q-result { color: #4a7c59; }
  .q-wrong .q-result { color: #c87555; }
  .q-body { font-size: 14px; margin-bottom: 10px; white-space: pre-wrap; }
  .q-opts { list-style: none; margin-bottom: 10px; }
  .q-opts li { padding: 4px 8px; font-size: 13px; }
  .q-opts li.correct { background: #e8f0e8; color: #2d5a3d; }
  .q-opts li.wrong { background: #fce8e0; color: #8b3a1a; }
  .q-ans { font-size: 13px; margin-bottom: 6px; }
  .q-ans pre { background: #f5f5f5; padding: 8px; border-radius: 4px; margin-top: 4px; white-space: pre-wrap; font-family: "Consolas", monospace; font-size: 12px; }
  .q-expl { font-size: 13px; color: #444; background: #fffbe6; padding: 8px; border-radius: 4px; margin-top: 6px; }
  @media print { body { padding: 16px; } .question { break-inside: avoid; } }
</style>
</head>
<body>
  <h1>${escapeHtml(s.title)}</h1>
  <div class="meta">
    <span class="score-box">得分：<b>${s.score}</b> / ${s.total}</span>
    <span class="score-box">正确率：<b>${pct}%</b></span>
    <span>生成时间：${new Date(s.created_at).toLocaleString('zh-CN')}</span>
    ${s.attempts ? `<span>　作答次数：${s.attempts}</span>` : ''}
  </div>
  ${questionsHtml}
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
