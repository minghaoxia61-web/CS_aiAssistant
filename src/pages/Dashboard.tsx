import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  BookOpen,
  BookX,
  CalendarCheck2,
  Flame,
  GraduationCap,
  MessageSquareText,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import { useStore } from '@/lib/store'
import { getDueQuestions } from '@/lib/spaced-repetition'
import type { ChatSession, Material, QuizSession, WrongQuestion } from '@/shared/types'

interface DashboardData {
  materials: Material[]
  quizzes: QuizSession[]
  wrongQuestions: WrongQuestion[]
  chats: ChatSession[]
}

const EMPTY: DashboardData = { materials: [], quizzes: [], wrongQuestions: [], chats: [] }

export default function Dashboard() {
  const navigate = useNavigate()
  const { subjects, currentSubjectId } = useStore()
  const [data, setData] = useState<DashboardData>(EMPTY)
  const subject = subjects.find((item) => item.id === currentSubjectId)

  useEffect(() => {
    if (!currentSubjectId) {
      setData(EMPTY)
      return
    }
    let cancelled = false
    Promise.all([
      window.api.getMaterials(currentSubjectId),
      window.api.listQuizSessions(currentSubjectId),
      window.api.listWrongQuestions(currentSubjectId),
      window.api.listChatSessions(currentSubjectId),
    ]).then(([materials, quizzes, wrongQuestions, chats]) => {
      if (!cancelled) setData({ materials, quizzes, wrongQuestions, chats })
    })
    return () => {
      cancelled = true
    }
  }, [currentSubjectId])

  const metrics = useMemo(() => {
    const answered = data.quizzes.filter((quiz) => quiz.questions.some((question) => question.user_answer))
    const total = answered.reduce((sum, quiz) => sum + quiz.total, 0)
    const score = answered.reduce((sum, quiz) => sum + quiz.score, 0)
    const accuracy = total ? Math.round((score / total) * 100) : 0
    const due = getDueQuestions(data.wrongQuestions)
    const activeDates = new Set(
      [...answered.map((quiz) => quiz.created_at), ...data.chats.map((chat) => chat.created_at)].map((time) =>
        new Date(time).toDateString(),
      ),
    )
    let streak = 0
    const date = new Date()
    while (activeDates.has(date.toDateString())) {
      streak += 1
      date.setDate(date.getDate() - 1)
    }
    const readiness = Math.min(
      100,
      Math.round(accuracy * 0.55 + Math.min(data.materials.length * 5, 20) + Math.min(answered.length * 5, 25)),
    )
    return { answered, accuracy, due, streak, readiness }
  }, [data])

  const latestQuiz = [...metrics.answered].sort((a, b) => b.created_at - a.created_at)[0]
  const recentChat = [...data.chats].sort((a, b) => b.created_at - a.created_at)[0]

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader
        title="学习首页"
        subtitle={subject ? `当前科目：${subject.name}` : '建立你的个性化学习工作流'}
        icon={<GraduationCap className="w-5 h-5" />}
        actions={
          <button className="btn-primary" onClick={() => navigate('/chat')}>
            <MessageSquareText className="w-4 h-4" />
            开始学习
          </button>
        }
      />

      <div className="page-container">
        <section className="dashboard-hero">
          <div className="relative z-[1] max-w-xl">
            <div className="flex items-center gap-2 text-xs text-amber mb-4">
              <Sparkles className="w-4 h-4" />
              <span className="font-medium">你的智能学习计划已就绪</span>
            </div>
            <h3 className="font-display text-[32px] leading-[1.18] text-bone tracking-[-0.045em]">
              {metrics.due.length > 0
                ? `今天有 ${metrics.due.length} 道错题值得再看一次`
                : '从一个知识点开始，保持稳定进步'}
            </h3>
            <p className="text-sm text-bone-muted mt-3 max-w-lg leading-relaxed">
              系统会综合你的测验、错题和学习记录，优先安排最值得投入时间的内容。
            </p>
            <div className="flex items-center gap-2 mt-6">
              <button className="btn-primary" onClick={() => navigate(metrics.due.length ? '/wrong-book' : '/knowledge')}>
                {metrics.due.length ? '开始今日复习' : '探索知识中心'}
                <ArrowRight className="w-4 h-4" />
              </button>
              <button className="btn-outline" onClick={() => navigate('/quiz')}>进行一次测验</button>
            </div>
          </div>
          <div className="readiness-ring" style={{ '--progress': `${metrics.readiness * 3.6}deg` } as React.CSSProperties}>
            <div>
              <strong>{metrics.readiness}</strong>
              <span>学习准备度</span>
            </div>
          </div>
        </section>

        <section className="metric-grid">
          <MetricCard icon={<Target />} label="综合正确率" value={`${metrics.accuracy}%`} hint="基于已完成测验" tone="blue" />
          <MetricCard icon={<CalendarCheck2 />} label="今日待复习" value={`${metrics.due.length}`} hint="按遗忘规律安排" tone="green" />
          <MetricCard icon={<Flame />} label="连续学习" value={`${metrics.streak} 天`} hint="保持每天一点进步" tone="orange" />
          <MetricCard icon={<BookOpen />} label="已收录资料" value={`${data.materials.length}`} hint="可用于 AI 检索" tone="violet" />
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_.8fr] gap-5">
          <section className="panel p-5">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Next actions</span>
                <h3>接下来做什么</h3>
              </div>
            </div>
            <div className="action-list">
              <ActionRow icon={<BookX />} title="复习到期错题" desc={`${metrics.due.length} 道题已进入复习队列`} action="去复习" onClick={() => navigate('/wrong-book')} />
              <ActionRow icon={<MessageSquareText />} title="继续 AI 对话" desc={recentChat?.title || '基于课程资料提出一个问题'} action="继续" onClick={() => navigate('/chat')} />
              <ActionRow icon={<TrendingUp />} title="查看学习趋势" desc={latestQuiz ? `最近测验 ${latestQuiz.score}/${latestQuiz.total}` : '完成测验后生成掌握趋势'} action="查看" onClick={() => navigate('/analytics')} />
            </div>
          </section>

          <section className="panel p-5">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Weak points</span>
                <h3>薄弱知识点</h3>
              </div>
            </div>
            {data.wrongQuestions.length ? (
              <div className="space-y-2.5">
                {data.wrongQuestions.slice(0, 4).map((item, index) => (
                  <button key={item.id} className="weak-point-row" onClick={() => navigate('/wrong-book')}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <strong>{item.question.chapter || item.question.question.slice(0, 24)}</strong>
                      <small>已复习 {item.review_count || 0} 次</small>
                    </div>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="compact-empty">
                <Target className="w-6 h-6" />
                <p>完成一次测验后，这里会自动识别薄弱知识点。</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function MetricCard({ icon, label, value, hint, tone }: { icon: React.ReactNode; label: string; value: string; hint: string; tone: string }) {
  return (
    <div className={`metric-card metric-${tone}`}>
      <div className="metric-icon">{icon}</div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <small>{hint}</small>
      </div>
    </div>
  )
}

function ActionRow({ icon, title, desc, action, onClick }: { icon: React.ReactNode; title: string; desc: string; action: string; onClick: () => void }) {
  return (
    <button className="action-row" onClick={onClick}>
      <span className="action-row-icon">{icon}</span>
      <span className="flex-1 min-w-0 text-left">
        <strong>{title}</strong>
        <small>{desc}</small>
      </span>
      <span className="action-row-link">{action}<ArrowRight className="w-3.5 h-3.5" /></span>
    </button>
  )
}
