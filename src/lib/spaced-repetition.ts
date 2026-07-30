import type { ReviewRating, ReviewSchedule, WrongQuestion } from '@/shared/types'

const DAY = 24 * 60 * 60 * 1000
const STORAGE_KEY = 'cs_assistant_review_schedules_v1'

export const DEFAULT_REVIEW_SCHEDULE: ReviewSchedule = {
  dueAt: 0,
  intervalDays: 0,
  ease: 2.5,
  repetitions: 0,
}

export function scheduleReview(
  current: ReviewSchedule | undefined,
  rating: ReviewRating,
  now = Date.now(),
): ReviewSchedule {
  const base = current || DEFAULT_REVIEW_SCHEDULE
  let intervalDays = base.intervalDays
  let ease = base.ease
  let repetitions = base.repetitions

  if (rating === 'again') {
    intervalDays = 0.15
    ease = Math.max(1.3, ease - 0.2)
    repetitions = 0
  } else if (rating === 'hard') {
    intervalDays = Math.max(1, intervalDays * 1.2 || 1)
    ease = Math.max(1.3, ease - 0.08)
    repetitions += 1
  } else if (rating === 'good') {
    intervalDays = repetitions === 0 ? 1 : repetitions === 1 ? 3 : Math.max(3, intervalDays * ease)
    repetitions += 1
  } else {
    intervalDays = repetitions === 0 ? 3 : Math.max(5, intervalDays * (ease + 0.35))
    ease = Math.min(3.2, ease + 0.08)
    repetitions += 1
  }

  intervalDays = Math.round(intervalDays * 10) / 10
  return {
    dueAt: now + intervalDays * DAY,
    intervalDays,
    ease: Math.round(ease * 100) / 100,
    repetitions,
    lastReviewedAt: now,
    lastRating: rating,
  }
}

export function loadReviewSchedules(): Record<string, ReviewSchedule> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Record<string, ReviewSchedule>
  } catch {
    return {}
  }
}

export function saveReviewSchedule(questionId: string, schedule: ReviewSchedule): void {
  const schedules = loadReviewSchedules()
  schedules[questionId] = schedule
  localStorage.setItem(STORAGE_KEY, JSON.stringify(schedules))
}

export function getQuestionSchedule(question: WrongQuestion): ReviewSchedule {
  return question.review_schedule || loadReviewSchedules()[question.id] || DEFAULT_REVIEW_SCHEDULE
}

export function getDueQuestions(questions: WrongQuestion[], now = Date.now()): WrongQuestion[] {
  return [...questions]
    .filter((question) => getQuestionSchedule(question).dueAt <= now)
    .sort((a, b) => getQuestionSchedule(a).dueAt - getQuestionSchedule(b).dueAt)
}

export function formatNextReview(schedule: ReviewSchedule): string {
  if (!schedule.dueAt || schedule.dueAt <= Date.now()) return '现在'
  const hours = Math.ceil((schedule.dueAt - Date.now()) / (60 * 60 * 1000))
  if (hours < 24) return `${hours} 小时后`
  return `${Math.ceil(hours / 24)} 天后`
}
