// 学情分析页：章节正确率柱状图、历次测验进步曲线、薄弱考点排行
// 图表使用纯 SVG/CSS 实现，不引入外部图表库
import { useEffect, useState, useMemo } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart3, TrendingUp, AlertCircle, Target, Award, ListChecks, Calendar, Sparkles, ChevronRight } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'
import DailyReport from '@/components/DailyReport'
import { useStore } from '@/lib/store'
import { cn, formatTime } from '@/lib/utils'
import { runAgentChecks, type AgentSuggestion } from '@/lib/solo-agent'
import type { QuizSession } from '@/shared/types'

interface ChapterStat {
  chapter: string
  total: number
  correct: number
  accuracy: number // 0-100
}

export default function Analytics() {
  const navigate = useNavigate()
  const { subjects, currentSubjectId, selectSubject } = useStore()
  const [sessions, setSessions] = useState<QuizSession[]>([])
  const [showReport, setShowReport] = useState(false)
  const [agentSuggestions, setAgentSuggestions] = useState<AgentSuggestion[]>([])

  const subject = subjects.find((s) => s.id === currentSubjectId)

  // SOLO Agent：进入分析页时检测学情，展示主动建议
  useEffect(() => {
    if (subjects.length === 0) return
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const suggestions = await runAgentChecks(subjects)
        if (!cancelled) setAgentSuggestions(suggestions.slice(0, 3))
      } catch {
        // 忽略
      }
    }, 1500)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [subjects])

  useEffect(() => {
    if (!currentSubjectId) return
    window.api.listQuizSessions(currentSubjectId).then(setSessions)
  }, [currentSubjectId])

  // 仅统计有作答记录的测验（questions 中存在 user_answer）
  const validSessions = useMemo(
    () => sessions.filter((s) => s.questions.some((q) => q.user_answer)),
    [sessions],
  )

  // 章节正确率统计
  const chapterStats = useMemo<ChapterStat[]>(() => {
    const map = new Map<string, { total: number; correct: number }>()
    for (const s of validSessions) {
      for (const q of s.questions) {
        const key = q.chapter || '未分类'
        const cur = map.get(key) || { total: 0, correct: 0 }
        cur.total += 1
        if (q.correct) cur.correct += 1
        map.set(key, cur)
      }
    }
    return Array.from(map.entries())
      .map(([chapter, v]) => ({
        chapter,
        total: v.total,
        correct: v.correct,
        accuracy: v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total)
  }, [validSessions])

  // 历次测验进步曲线（按时间升序）
  const progressData = useMemo(() => {
    return [...validSessions]
      .sort((a, b) => a.created_at - b.created_at)
      .map((s) => ({
        id: s.id,
        title: s.title,
        created_at: s.created_at,
        pct: s.total > 0 ? Math.round((s.score / s.total) * 100) : 0,
        score: s.score,
        total: s.total,
      }))
  }, [validSessions])

  // 薄弱考点：正确率最低的章节（至少做过 1 题）
  const weakPoints = useMemo<ChapterStat[]>(() => {
    return [...chapterStats].sort((a, b) => a.accuracy - b.accuracy).slice(0, 8)
  }, [chapterStats])

  // 汇总指标
  const summary = useMemo(() => {
    const totalQuestions = validSessions.reduce((s, q) => s + q.questions.length, 0)
    const totalCorrect = validSessions.reduce(
      (s, sess) => s + sess.questions.filter((q) => q.correct).length,
      0,
    )
    const avgPct =
      progressData.length > 0
        ? Math.round(progressData.reduce((s, p) => s + p.pct, 0) / progressData.length)
        : 0
    const bestPct = progressData.length > 0 ? Math.max(...progressData.map((p) => p.pct)) : 0
    return {
      sessionCount: validSessions.length,
      totalQuestions,
      totalCorrect,
      overallAccuracy: totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0,
      avgPct,
      bestPct,
    }
  }, [validSessions, progressData])

  if (!currentSubjectId) {
    return (
      <div className="h-full overflow-y-auto">
        <PageHeader title="学情分析" subtitle="基于历次测验数据生成可视化报告" icon={<BarChart3 className="w-5 h-5" />} />
        <EmptyState
          icon={<BarChart3 className="w-7 h-7" />}
          title="请先选择或创建科目"
          desc="在左侧选择一个考试科目后，即可查看学情分析。"
        />
      </div>
    )
  }

  if (validSessions.length === 0) {
    return (
      <div className="h-full overflow-y-auto">
        <PageHeader title="学情分析" subtitle={subject ? `当前科目：${subject.name}` : '基于历次测验数据生成可视化报告'} icon={<BarChart3 className="w-5 h-5" />} />
        <EmptyState
          icon={<BarChart3 className="w-7 h-7" />}
          title="暂无测验数据"
          desc="完成至少一次测验后，这里将展示章节正确率、进步曲线和薄弱考点。"
        />
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader
        title="学情分析"
        subtitle={subject ? `当前科目：${subject.name}` : '基于历次测验数据生成可视化报告'}
        icon={<BarChart3 className="w-5 h-5" />}
      />

      <div className="px-8 py-6 max-w-5xl mx-auto space-y-6 animate-fade-in">
        {/* SOLO Agent 主动建议 */}
        {agentSuggestions.length > 0 && (
          <div className="rounded-2xl glass border border-amber/15 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-amber" />
              <h3 className="font-display text-base text-bone">SOLO Agent 建议</h3>
              <span className="text-[10px] text-amber-dim tracking-wider uppercase ml-1">主动学情分析</span>
              <button
                onClick={() => setShowReport(true)}
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber/12 hover:bg-amber/20 text-amber text-xs font-medium transition-colors"
              >
                <Calendar className="w-3.5 h-3.5" />
                查看今日日报
              </button>
            </div>
            <div className="space-y-2">
              {agentSuggestions.map((s) => (
                <div
                  key={s.id}
                  className={cn(
                    'flex items-start gap-3 px-3 py-2.5 rounded-xl border transition-colors',
                    s.priority === 'high'
                      ? 'bg-rust/5 border-rust/20'
                      : s.priority === 'medium'
                      ? 'bg-amber/5 border-amber/15'
                      : 'bg-sage/5 border-sage/15',
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-bone leading-snug">{s.title}</p>
                    <p className="text-xs text-bone-dim mt-0.5 line-clamp-2">{s.message}</p>
                  </div>
                  <button
                    onClick={() => {
                      if (s.subjectId) selectSubject(s.subjectId)
                      if (s.actionPath) navigate(s.actionPath)
                    }}
                    className={cn(
                      'shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                      s.priority === 'high'
                        ? 'bg-rust/15 hover:bg-rust/25 text-rust'
                        : s.priority === 'medium'
                        ? 'bg-amber/15 hover:bg-amber/25 text-amber'
                        : 'bg-sage/15 hover:bg-sage/25 text-sage-glow',
                    )}
                  >
                    {s.actionLabel}
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 无 Agent 建议时显示日报入口 */}
        {agentSuggestions.length === 0 && (
          <div className="flex justify-end">
            <button
              onClick={() => setShowReport(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass border border-amber/12 hover:border-amber/25 text-amber text-xs font-medium transition-colors"
            >
              <Calendar className="w-3.5 h-3.5" />
              查看今日日报
            </button>
          </div>
        )}

        {/* 汇总指标卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard icon={<ListChecks className="w-4 h-4" />} label="测验次数" value={`${summary.sessionCount}`} suffix="次" />
          <SummaryCard icon={<Target className="w-4 h-4" />} label="总体正确率" value={`${summary.overallAccuracy}`} suffix="%" tone={summary.overallAccuracy >= 60 ? 'sage' : 'rust'} />
          <SummaryCard icon={<TrendingUp className="w-4 h-4" />} label="平均得分率" value={`${summary.avgPct}`} suffix="%" tone={summary.avgPct >= 60 ? 'sage' : 'rust'} />
          <SummaryCard icon={<Award className="w-4 h-4" />} label="最佳得分率" value={`${summary.bestPct}`} suffix="%" tone="amber" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 章节正确率柱状图 */}
          <div className="panel card-3d p-6">
            <div className="flex items-center gap-2 mb-5">
              <BarChart3 className="w-4 h-4 text-amber" />
              <h3 className="font-display text-xl text-bone">章节正确率</h3>
            </div>
            {chapterStats.length === 0 ? (
              <p className="text-sm text-bone-faint py-8 text-center">暂无章节数据</p>
            ) : (
              <div className="space-y-3">
                {chapterStats.map((c) => (
                  <ChapterBar key={c.chapter} stat={c} />
                ))}
              </div>
            )}
          </div>

          {/* 进步曲线 */}
          <div className="panel card-3d p-6">
            <div className="flex items-center gap-2 mb-5">
              <TrendingUp className="w-4 h-4 text-amber" />
              <h3 className="font-display text-xl text-bone">测验进步曲线</h3>
            </div>
            {progressData.length < 2 ? (
              <p className="text-sm text-bone-faint py-8 text-center">完成至少 2 次测验后显示进步曲线</p>
            ) : (
              <ProgressChart data={progressData} />
            )}
          </div>
        </div>

        {/* 薄弱考点排行 */}
        <div className="panel card-3d p-6">
          <div className="flex items-center gap-2 mb-5">
            <AlertCircle className="w-4 h-4 text-rust" />
            <h3 className="font-display text-xl text-bone">薄弱考点排行</h3>
            <span className="text-xs text-bone-faint ml-auto">按正确率升序</span>
          </div>
          {weakPoints.length === 0 ? (
            <p className="text-sm text-bone-faint py-8 text-center">暂无数据</p>
          ) : (
            <div className="space-y-2">
              {weakPoints.map((c, i) => (
                <div
                  key={c.chapter}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl glass border border-amber/8 transition-all duration-300 hover:border-amber/15 hover:shadow-glow"
                >
                  <span
                    className={cn(
                      'w-6 h-6 rounded-md flex items-center justify-center text-xs font-mono shrink-0',
                      c.accuracy < 40 ? 'bg-rust/15 text-rust' : c.accuracy < 60 ? 'bg-amber/12 text-amber' : 'bg-sage/15 text-sage-glow',
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="text-sm text-bone-dim flex-1 truncate">{c.chapter}</span>
                  <span className="text-xs text-bone-faint shrink-0">{c.correct}/{c.total} 题</span>
                  <span
                    className={cn(
                      'font-mono text-sm font-semibold w-12 text-right shrink-0',
                      c.accuracy < 40 ? 'text-rust' : c.accuracy < 60 ? 'text-amber' : 'text-sage-glow',
                    )}
                  >
                    {c.accuracy}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {showReport && <DailyReport onClose={() => setShowReport(false)} />}
    </div>
  )
}

/** 汇总指标卡片 */
function SummaryCard({
  icon,
  label,
  value,
  suffix,
  tone = 'default',
}: {
  icon: ReactNode
  label: string
  value: string
  suffix?: string
  tone?: 'default' | 'amber' | 'sage' | 'rust'
}) {
  const toneClass =
    tone === 'amber'
      ? 'text-amber'
      : tone === 'sage'
      ? 'text-sage-glow'
      : tone === 'rust'
      ? 'text-rust'
      : 'text-bone'
  return (
    <div className="panel card-3d p-4">
      <div className="flex items-center gap-1.5 text-bone-faint mb-2">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={cn('font-display text-3xl', toneClass)}>{value}</span>
        {suffix && <span className="text-xs text-bone-faint">{suffix}</span>}
      </div>
    </div>
  )
}

/** 章节正确率横向柱状条 */
function ChapterBar({ stat }: { stat: ChapterStat }) {
  const color = stat.accuracy >= 60 ? 'var(--sage)' : stat.accuracy >= 40 ? 'var(--amber)' : 'var(--rust)'
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm text-bone-dim truncate max-w-[70%]">{stat.chapter}</span>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-bone-faint">{stat.correct}/{stat.total}</span>
          <span className="font-mono text-sm font-medium" style={{ color }}>
            {stat.accuracy}%
          </span>
        </div>
      </div>
      <div className="h-3 rounded-full bg-ink-800 overflow-hidden">
        <div
          className="h-full rounded-full progress-gradient transition-all duration-700 ease-out"
          style={{ width: `${stat.accuracy}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

/** 进步曲线 SVG 折线图 */
function ProgressChart({
  data,
}: {
  data: { id: string; title: string; created_at: number; pct: number; score: number; total: number }[]
}) {
  const W = 600
  const H = 240
  const PAD_L = 36
  const PAD_R = 16
  const PAD_T = 16
  const PAD_B = 36
  const plotW = W - PAD_L - PAD_R
  const plotH = H - PAD_T - PAD_B

  const n = data.length
  const xFor = (i: number) => (n > 1 ? PAD_L + (i / (n - 1)) * plotW : PAD_L + plotW / 2)
  const yFor = (pct: number) => PAD_T + plotH - (pct / 100) * plotH

  const points = data.map((d, i) => ({ x: xFor(i), y: yFor(d.pct), ...d }))
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const areaD = `${pathD} L ${points[n - 1].x.toFixed(1)} ${PAD_T + plotH} L ${points[0].x.toFixed(1)} ${PAD_T + plotH} Z`

  const gridLines = [0, 25, 50, 75, 100]

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
        {/* 网格线 + Y 轴刻度 */}
        {gridLines.map((g) => {
          const y = yFor(g)
          return (
            <g key={g}>
              <line
                x1={PAD_L}
                y1={y}
                x2={W - PAD_R}
                y2={y}
                stroke="var(--border-amber)"
                strokeWidth={1}
                strokeDasharray={g === 0 ? '0' : '3 3'}
              />
              <text x={PAD_L - 6} y={y + 3} textAnchor="end" fontSize={10} fill="var(--text-faint)">
                {g}
              </text>
            </g>
          )
        })}

        {/* 渐变填充区域 */}
        <defs>
          <linearGradient id="progressArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--amber)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--amber)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#progressArea)" />

        {/* 折线 */}
        <path d={pathD} fill="none" stroke="var(--amber)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {/* 数据点 */}
        {points.map((p) => (
          <g key={p.id}>
            <circle cx={p.x} cy={p.y} r={4} fill="var(--bg-surface)" stroke="var(--amber)" strokeWidth={2} />
            <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize={10} fill="var(--amber-dim)" fontWeight={600}>
              {p.pct}%
            </text>
          </g>
        ))}

        {/* X 轴标签（首末及中间，避免拥挤） */}
        {points.map((p, i) => {
          const showLabel = n <= 6 || i === 0 || i === n - 1 || i === Math.floor((n - 1) / 2)
          if (!showLabel) return null
          return (
            <text key={`lbl-${p.id}`} x={p.x} y={H - 12} textAnchor="middle" fontSize={9} fill="var(--text-faint)">
              {formatTime(p.created_at)}
            </text>
          )
        })}
      </svg>
      <p className="text-[10px] text-bone-faint text-center mt-1">纵轴为得分率（%），横轴为测验时间</p>
    </div>
  )
}
