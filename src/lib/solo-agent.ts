// SOLO Agent 主动智能引擎：系统主动分析学情 → 主动推送 → 个性化干预
// 区别于被动问答工具：Agent 在用户无操作时主动检测学情并给出建议
// 触发器模式：condition → action，带冷却时间避免重复打扰
import type { Subject, WrongQuestion, QuizSession, ReviewDoc, ChatSession } from '@/shared/types'
import { notify } from './notify'

/** Agent 建议类型 */
export type SuggestionType =
  | 'weak-drill' // 薄弱章节专项练习
  | 'high-freq-wrong' // 高频错题考点提醒
  | 'daily-report' // 每日学习日报
  | 'review-streak' // 连续复习奖励
  | 'pending-todo' // 待办提醒

/** Agent 建议项 */
export interface AgentSuggestion {
  id: string
  type: SuggestionType
  title: string
  message: string
  actionLabel: string
  actionPath?: string
  priority: 'high' | 'medium' | 'low'
  subjectId?: string
  subjectName?: string
  /** 附加数据（如章节名、错题数等，供 UI 展示） */
  meta?: {
    chapter?: string
    wrongCount?: number
    accuracy?: number
    streakDays?: number
    pendingCount?: number
  }
}

// ---------- 冷却管理（localStorage 持久化，避免刷新后重复触发） ----------
const COOLDOWN_KEY = 'solo_agent_cooldown'

function loadCooldowns(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(COOLDOWN_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveCooldowns(data: Record<string, number>): void {
  try {
    localStorage.setItem(COOLDOWN_KEY, JSON.stringify(data))
  } catch {
    // localStorage 不可用时忽略
  }
}

/** 检查某触发器是否在冷却中 */
function inCooldown(triggerId: string, cooldownMs: number): boolean {
  const cooldowns = loadCooldowns()
  const lastFired = cooldowns[triggerId] || 0
  return Date.now() - lastFired < cooldownMs
}

/** 标记触发器已触发（重置冷却） */
function markFired(triggerId: string): void {
  const cooldowns = loadCooldowns()
  cooldowns[triggerId] = Date.now()
  saveCooldowns(cooldowns)
}

// ---------- 冷却时长 ----------
const COOLDOWN_WEAK_DRILL = 24 * 60 * 60 * 1000 // 24 小时
const COOLDOWN_HIGH_FREQ = 12 * 60 * 60 * 1000 // 12 小时
const COOLDOWN_DAILY = 24 * 60 * 60 * 1000 // 每日一次
const COOLDOWN_REVIEW_STREAK = 24 * 60 * 60 * 1000 // 24 小时
const COOLDOWN_PENDING = 6 * 60 * 60 * 1000 // 6 小时

// ---------- 数据采集 ----------
interface SubjectData {
  subject: Subject
  wrongQuestions: WrongQuestion[]
  quizSessions: QuizSession[]
  reviewDocs: ReviewDoc[]
  chatSessions: ChatSession[]
}

async function collectSubjectData(subject: Subject): Promise<SubjectData> {
  const [wrongQuestions, quizSessions, reviewDocs, chatSessions] = await Promise.all([
    window.api.listWrongQuestions(subject.id),
    window.api.listQuizSessions(subject.id),
    window.api.listReviewDocs(subject.id),
    window.api.listChatSessions(subject.id),
  ])
  return { subject, wrongQuestions, quizSessions, reviewDocs, chatSessions }
}

/** 按章节分组错题 */
function groupWrongByChapter(wrongQuestions: WrongQuestion[]): Map<string, WrongQuestion[]> {
  const map = new Map<string, WrongQuestion[]>()
  for (const wq of wrongQuestions) {
    const chapter = wq.question.chapter || '未分类'
    if (!map.has(chapter)) map.set(chapter, [])
    map.get(chapter)!.push(wq)
  }
  return map
}

// ---------- 触发器 ----------
/** 薄弱章节检测：某章节错题率 > 60% 且未复习错题 ≥ 3 道 */
function checkWeakDrill(data: SubjectData): AgentSuggestion | null {
  const grouped = groupWrongByChapter(data.wrongQuestions)
  for (const [chapter, wqs] of grouped) {
    const unreviewed = wqs.filter((w) => !w.reviewed)
    if (unreviewed.length < 3) continue
    const rate = unreviewed.length / wqs.length
    if (rate > 0.6) {
      return {
        id: `weak-drill-${data.subject.id}-${chapter}`,
        type: 'weak-drill',
        title: `「${data.subject.name}」薄弱章节预警`,
        message: `章节「${chapter}」错题率 ${Math.round(rate * 100)}%（${unreviewed.length}/${wqs.length} 道未复习），建议立即生成专项练习强化巩固。`,
        actionLabel: '生成专项练习',
        actionPath: '/quiz',
        priority: 'high',
        subjectId: data.subject.id,
        subjectName: data.subject.name,
        meta: { chapter, wrongCount: unreviewed.length, accuracy: Math.round((1 - rate) * 100) },
      }
    }
  }
  return null
}

/** 高频错题考点：某章节累计错题 ≥ 3 道 */
function checkHighFreqWrong(data: SubjectData): AgentSuggestion | null {
  const grouped = groupWrongByChapter(data.wrongQuestions)
  let worst: { chapter: string; count: number } | null = null
  for (const [chapter, wqs] of grouped) {
    if (wqs.length >= 3 && (!worst || wqs.length > worst.count)) {
      worst = { chapter, count: wqs.length }
    }
  }
  if (!worst) return null
  return {
    id: `high-freq-${data.subject.id}-${worst.chapter}`,
    type: 'high-freq-wrong',
    title: `高频易错考点：${worst.chapter}`,
    message: `「${data.subject.name}」中「${worst.chapter}」累计错题 ${worst.count} 道，是掌握最薄弱的知识点。建议结合课件重点复习。`,
    actionLabel: '查看错题本',
    actionPath: '/wrong-book',
    priority: 'medium',
    subjectId: data.subject.id,
    subjectName: data.subject.name,
    meta: { chapter: worst.chapter, wrongCount: worst.count },
  }
}

/** 连续复习奖励：同一科目连续 ≥ 3 天有复习资料生成 */
function checkReviewStreak(data: SubjectData): AgentSuggestion | null {
  if (data.reviewDocs.length === 0) return null
  // 按天去重
  const days = new Set(
    data.reviewDocs.map((r) => new Date(r.created_at).toDateString()),
  )
  // 检查最近 3 天是否都有复习记录
  const today = new Date()
  let streak = 0
  for (let i = 0; i < 30; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    if (days.has(d.toDateString())) streak++
    else if (i > 0) break // 断链（今天没有不算断）
  }
  if (streak < 3) return null
  return {
    id: `review-streak-${data.subject.id}`,
    type: 'review-streak',
    title: `连续复习 ${streak} 天！`,
    message: `你在「${data.subject.name}」已连续复习 ${streak} 天，坚持就是胜利！建议生成冲刺卡片巩固记忆。`,
    actionLabel: '生成背诵卡片',
    actionPath: '/library',
    priority: 'low',
    subjectId: data.subject.id,
    subjectName: data.subject.name,
    meta: { streakDays: streak },
  }
}

/** 待办提醒：未复习错题或未完成测验 */
function checkPendingTodo(allData: SubjectData[]): AgentSuggestion | null {
  let totalPending = 0
  const details: string[] = []
  for (const d of allData) {
    const unreviewed = d.wrongQuestions.filter((w) => !w.reviewed).length
    if (unreviewed > 0) {
      totalPending += unreviewed
      details.push(`${d.subject.name} ${unreviewed} 道错题`)
    }
  }
  if (totalPending === 0) return null
  return {
    id: 'pending-todo-global',
    type: 'pending-todo',
    title: '你有待完成的学习任务',
    message: `待复习错题共 ${totalPending} 道（${details.slice(0, 3).join('、')}）。及时复习能显著提升记忆留存。`,
    actionLabel: '去复习',
    actionPath: '/wrong-book',
    priority: 'medium',
    meta: { pendingCount: totalPending },
  }
}

/** 每日日报：当天首次打开 */
function checkDailyReport(allData: SubjectData[]): AgentSuggestion | null {
  const todayKey = new Date().toDateString()
  const triggerId = `daily-report-${todayKey}`
  if (inCooldown(triggerId, COOLDOWN_DAILY)) return null
  // 统计今日学习数据
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const ts = todayStart.getTime()

  let todayQuizzes = 0
  let todayWrong = 0
  let todayChats = 0
  let todayReviews = 0
  for (const d of allData) {
    todayQuizzes += d.quizSessions.filter((s) => s.created_at >= ts).length
    todayWrong += d.wrongQuestions.filter((w) => w.created_at >= ts).length
    todayChats += d.chatSessions.filter((c) => c.created_at >= ts).length
    todayReviews += d.reviewDocs.filter((r) => r.created_at >= ts).length
  }
  // 完全没有学习数据时不推送日报
  if (todayQuizzes + todayWrong + todayChats + todayReviews === 0) return null

  markFired(triggerId)
  return {
    id: triggerId,
    type: 'daily-report',
    title: '今日学习日报已生成',
    message: `今日：${todayQuizzes} 次测验、${todayChats} 次问答、${todayReviews} 份复习资料、新增 ${todayWrong} 道错题。点击查看完整日报与次日规划。`,
    actionLabel: '查看日报',
    actionPath: '/analytics',
    priority: 'low',
    meta: {
      pendingCount: todayQuizzes + todayChats + todayReviews + todayWrong,
    },
  }
}

// ---------- 主入口：运行所有触发器 ----------
/**
 * 运行 SOLO Agent 检查，返回需推送的建议列表（已过滤冷却）。
 * @param subjects 所有科目
 * @returns 建议列表（按优先级排序）
 */
export async function runAgentChecks(subjects: Subject[]): Promise<AgentSuggestion[]> {
  if (subjects.length === 0) return []

  // 采集所有科目数据（并发）
  const allData = await Promise.all(subjects.map(collectSubjectData))

  const suggestions: AgentSuggestion[] = []

  // 全局触发器
  const daily = checkDailyReport(allData)
  if (daily) suggestions.push(daily)

  const pending = checkPendingTodo(allData)
  if (pending && !inCooldown(pending.id, COOLDOWN_PENDING)) {
    suggestions.push(pending)
    markFired(pending.id)
  }

  // 按科目触发器
  for (const data of allData) {
    if (data.wrongQuestions.length === 0) continue

    const weakDrillId = `weak-drill-${data.subject.id}`
    if (!inCooldown(weakDrillId, COOLDOWN_WEAK_DRILL)) {
      const s = checkWeakDrill(data)
      if (s) {
        suggestions.push(s)
        markFired(weakDrillId)
        continue // weak-drill 和 high-freq 同科目只推一个
      }
    }

    const highFreqId = `high-freq-${data.subject.id}`
    if (!inCooldown(highFreqId, COOLDOWN_HIGH_FREQ)) {
      const s = checkHighFreqWrong(data)
      if (s) {
        suggestions.push(s)
        markFired(highFreqId)
      }
    }
  }

  // 复习连续性（按科目）
  for (const data of allData) {
    const streakId = `review-streak-${data.subject.id}`
    if (!inCooldown(streakId, COOLDOWN_REVIEW_STREAK)) {
      const s = checkReviewStreak(data)
      if (s) {
        suggestions.push(s)
        markFired(streakId)
      }
    }
  }

  // 按优先级排序：high > medium > low
  const priorityOrder = { high: 0, medium: 1, low: 2 }
  suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])

  return suggestions
}

/** 高优先级建议同时发送桌面通知 */
export function notifySuggestions(suggestions: AgentSuggestion[]): void {
  for (const s of suggestions) {
    if (s.priority === 'high') {
      notify({
        title: s.title,
        body: s.message,
        tag: s.id,
        onClickPath: s.actionPath,
      })
    }
  }
}

// ---------- 每日日报数据 ----------
export interface DailyReportData {
  date: string
  subjects: Array<{
    name: string
    quizzes: number
    quizAccuracy: number
    newWrong: number
    chats: number
    reviews: number
  }>
  totalQuizzes: number
  totalChats: number
  totalReviews: number
  totalNewWrong: number
  topWeakChapters: Array<{ subject: string; chapter: string; count: number }>
}

/** 生成今日学习日报（统计数据，不含 LLM 调用，保证即时可靠） */
export async function generateDailyReport(subjects: Subject[]): Promise<DailyReportData> {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const ts = todayStart.getTime()

  const allData = await Promise.all(subjects.map(collectSubjectData))

  const subjectReports = allData.map((d) => {
    const todayQuizzes = d.quizSessions.filter((s) => s.created_at >= ts)
    const todayWrong = d.wrongQuestions.filter((w) => w.created_at >= ts)
    const todayChats = d.chatSessions.filter((c) => c.created_at >= ts)
    const todayReviews = d.reviewDocs.filter((r) => r.created_at >= ts)

    const quizAccuracy =
      todayQuizzes.length > 0
        ? Math.round(
            (todayQuizzes.reduce((sum, s) => sum + s.score, 0) /
              Math.max(1, todayQuizzes.reduce((sum, s) => sum + s.total, 0))) *
              100,
          )
        : 0

    return {
      name: d.subject.name,
      quizzes: todayQuizzes.length,
      quizAccuracy,
      newWrong: todayWrong.length,
      chats: todayChats.length,
      reviews: todayReviews.length,
    }
  })

  // 薄弱章节 Top3（按今日新增错题数）
  const weakChapters: Array<{ subject: string; chapter: string; count: number }> = []
  for (const d of allData) {
    const todayWrong = d.wrongQuestions.filter((w) => w.created_at >= ts)
    const grouped = groupWrongByChapter(todayWrong)
    for (const [chapter, wqs] of grouped) {
      weakChapters.push({ subject: d.subject.name, chapter, count: wqs.length })
    }
  }
  weakChapters.sort((a, b) => b.count - a.count)

  return {
    date: new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }),
    subjects: subjectReports,
    totalQuizzes: subjectReports.reduce((s, r) => s + r.quizzes, 0),
    totalChats: subjectReports.reduce((s, r) => s + r.chats, 0),
    totalReviews: subjectReports.reduce((s, r) => s + r.reviews, 0),
    totalNewWrong: subjectReports.reduce((s, r) => s + r.newWrong, 0),
    topWeakChapters: weakChapters.slice(0, 3),
  }
}

/** 导出日报为 Markdown */
export function exportReportMarkdown(report: DailyReportData): string {
  const lines: string[] = [
    `# 学习日报 — ${report.date}`,
    '',
    '## 今日概览',
    `- 测验：${report.totalQuizzes} 次`,
    `- 问答：${report.totalChats} 次`,
    `- 复习资料：${report.totalReviews} 份`,
    `- 新增错题：${report.totalNewWrong} 道`,
    '',
    '## 各科目详情',
  ]
  for (const s of report.subjects) {
    if (s.quizzes + s.chats + s.reviews + s.newWrong === 0) continue
    lines.push(
      `### ${s.name}`,
      `- 测验 ${s.quizzes} 次${s.quizzes > 0 ? `，正确率 ${s.quizAccuracy}%` : ''}`,
      `- 问答 ${s.chats} 次`,
      `- 复习资料 ${s.reviews} 份`,
      `- 新增错题 ${s.newWrong} 道`,
      '',
    )
  }
  if (report.topWeakChapters.length > 0) {
    lines.push('## 今日薄弱知识点')
    for (const w of report.topWeakChapters) {
      lines.push(`- ${w.subject} / ${w.chapter}（${w.count} 道错题）`)
    }
    lines.push('')
  }
  lines.push('## 次日建议', '- 复习今日新增错题', '- 针对薄弱章节生成专项练习', '- 保持学习节奏，继续加油！')
  return lines.join('\n')
}
