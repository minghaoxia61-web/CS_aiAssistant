import type { QuizQuestion, QuizSession, WrongQuestion } from '@/shared/types'

export type LearningErrorType = 'knowledge_gap' | 'careless' | 'misconception' | 'forgotten'

export interface KnowledgeTrajectory {
  chapter: string
  mastery: number
  trend: number
  forgettingRisk: number
  attempts: number
  lastPracticedAt: number
  dominantError: LearningErrorType | null
  nextDifficulty: '基础' | '中档' | '综合大题'
}

export interface StudentModel {
  generatedAt: number
  trajectories: KnowledgeTrajectory[]
  errorDistribution: Record<LearningErrorType, number>
}

function inferError(
  question: QuizQuestion,
  previousCorrect: boolean,
): LearningErrorType | null {
  if (question.correct) return null
  if (previousCorrect) return 'forgotten'
  if ((question.time_spent || 0) < 20 && (question.answer_changes || 0) === 0) return 'careless'
  if ((question.answer_changes || 0) >= 2) return 'misconception'
  return 'knowledge_gap'
}

export function buildStudentModel(
  sessions: QuizSession[],
  wrongQuestions: WrongQuestion[] = [],
  now = Date.now(),
): StudentModel {
  const byChapter = new Map<
    string,
    Array<{ correct: boolean; at: number; time: number; changes: number; error: LearningErrorType | null }>
  >()
  const ordered = [...sessions].sort((a, b) => a.created_at - b.created_at)
  const lastCorrect = new Map<string, boolean>()

  for (const session of ordered) {
    for (const question of session.questions) {
      if (!question.user_answer?.trim()) continue
      const chapter = question.chapter?.trim() || '未分类知识点'
      const error = question.error_category || inferError(question, lastCorrect.get(chapter) === true)
      const events = byChapter.get(chapter) || []
      events.push({
        correct: question.correct,
        at: session.last_attempt_at || session.created_at,
        time: question.time_spent || 0,
        changes: question.answer_changes || 0,
        error,
      })
      byChapter.set(chapter, events)
      lastCorrect.set(chapter, question.correct)
    }
  }

  const distribution: Record<LearningErrorType, number> = {
    knowledge_gap: 0,
    careless: 0,
    misconception: 0,
    forgotten: 0,
  }

  const trajectories = Array.from(byChapter.entries()).map<KnowledgeTrajectory>(
    ([chapter, events]) => {
      events.forEach((event) => {
        if (event.error) distribution[event.error] += 1
      })
      const weighted = events.map((event, index) => {
        const recency = 0.55 + (index / Math.max(1, events.length - 1)) * 0.45
        const speed = event.time > 180 ? 0.9 : 1
        return { score: (event.correct ? 1 : 0) * speed, weight: recency }
      })
      const mastery = Math.round(
        (weighted.reduce((sum, item) => sum + item.score * item.weight, 0) /
          Math.max(0.001, weighted.reduce((sum, item) => sum + item.weight, 0))) *
          100,
      )
      const half = Math.max(1, Math.floor(events.length / 2))
      const older = events.slice(0, half)
      const recent = events.slice(-half)
      const rate = (items: typeof events) =>
        items.filter((item) => item.correct).length / Math.max(1, items.length)
      const trend = Math.round((rate(recent) - rate(older)) * 100)
      const lastPracticedAt = events[events.length - 1].at
      const days = Math.max(0, (now - lastPracticedAt) / 86_400_000)
      const relatedWrong = wrongQuestions.filter(
        (item) => (item.question.chapter || '') === chapter,
      )
      const reviewPenalty = relatedWrong.filter((item) => !item.reviewed).length * 8
      const forgettingRisk = Math.min(
        100,
        Math.round((100 - mastery) * 0.45 + Math.min(45, days * 2.4) + reviewPenalty),
      )
      const errors = events
        .map((event) => event.error)
        .filter((error): error is LearningErrorType => Boolean(error))
      const dominantError = errors.length
        ? errors.sort(
            (a, b) =>
              errors.filter((item) => item === b).length -
              errors.filter((item) => item === a).length,
          )[0]
        : null
      return {
        chapter,
        mastery,
        trend,
        forgettingRisk,
        attempts: events.length,
        lastPracticedAt,
        dominantError,
        nextDifficulty: mastery >= 82 ? '综合大题' : mastery >= 58 ? '中档' : '基础',
      }
    },
  )

  return {
    generatedAt: now,
    trajectories: trajectories.sort((a, b) => b.forgettingRisk - a.forgettingRisk),
    errorDistribution: distribution,
  }
}
