import { useMemo, useState } from 'react'
import { Brain, CheckCircle2, Clock3, RotateCcw } from 'lucide-react'
import {
  formatNextReview,
  getDueQuestions,
  getQuestionSchedule,
  saveReviewSchedule,
  scheduleReview,
} from '@/lib/spaced-repetition'
import type { ReviewRating, WrongQuestion } from '@/shared/types'

const RATINGS: Array<{ value: ReviewRating; label: string; hint: string; className: string }> = [
  { value: 'again', label: '忘记', hint: '约 4 小时', className: 'review-again' },
  { value: 'hard', label: '困难', hint: '约 1 天', className: 'review-hard' },
  { value: 'good', label: '掌握', hint: '约 3 天', className: 'review-good' },
  { value: 'easy', label: '简单', hint: '约 5 天+', className: 'review-easy' },
]

export default function SpacedReviewQueue({
  questions,
  onUpdated,
}: {
  questions: WrongQuestion[]
  onUpdated: () => Promise<void> | void
}) {
  const [cursor, setCursor] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const due = useMemo(() => getDueQuestions(questions), [questions])
  const current = due[cursor]

  const rate = async (rating: ReviewRating) => {
    if (!current) return
    const next = scheduleReview(getQuestionSchedule(current), rating)
    saveReviewSchedule(current.id, next)
    await window.api.markWrongReviewed(current.id, true)
    setRevealed(false)
    if (cursor >= due.length - 1) setCursor(0)
    else setCursor((value) => value + 1)
    await onUpdated()
  }

  return (
    <section className="review-queue">
      <div className="review-queue-summary">
        <span className="review-queue-icon"><Brain className="w-5 h-5" /></span>
        <div className="flex-1 min-w-0">
          <span className="eyebrow">Spaced repetition</span>
          <h3>智能复习队列</h3>
          <p>{due.length ? `今天有 ${due.length} 道题到期，系统会根据你的反馈安排下次复习。` : '今日任务已完成，新的复习会在合适的时间出现。'}</p>
        </div>
        <div className="review-due-count">
          <strong>{due.length}</strong>
          <span>今日到期</span>
        </div>
      </div>

      {current ? (
        <div className="review-active-card">
          <div className="flex items-center justify-between gap-3 mb-3">
            <span className="text-[10px] text-bone-faint">第 {cursor + 1} / {due.length} 题</span>
            <span className="flex items-center gap-1 text-[10px] text-bone-faint">
              <Clock3 className="w-3 h-3" />
              下次：{formatNextReview(getQuestionSchedule(current))}
            </span>
          </div>
          <h4>{current.question.question}</h4>
          {revealed ? (
            <>
              <div className="review-answer">
                <span>正确答案</span>
                <p>{current.correct_answer}</p>
                {current.explanation && <small>{current.explanation}</small>}
              </div>
              <div className="review-ratings">
                {RATINGS.map((rating) => (
                  <button key={rating.value} className={rating.className} onClick={() => rate(rating.value)}>
                    <strong>{rating.label}</strong>
                    <small>{rating.hint}</small>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <button className="btn-primary mt-4" onClick={() => setRevealed(true)}>
              <RotateCcw className="w-4 h-4" />
              显示答案并评价
            </button>
          )}
        </div>
      ) : (
        <div className="review-complete">
          <CheckCircle2 className="w-5 h-5" />
          <span>今天的复习已经完成，做得很好。</span>
        </div>
      )}
    </section>
  )
}
