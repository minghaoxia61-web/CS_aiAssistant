import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_REVIEW_SCHEDULE, scheduleReview } from '../src/lib/spaced-repetition'

const NOW = new Date('2026-07-30T00:00:00Z').getTime()
const DAY = 24 * 60 * 60 * 1000

test('忘记会重置连续掌握次数并安排短期重试', () => {
  const next = scheduleReview({ ...DEFAULT_REVIEW_SCHEDULE, intervalDays: 8, repetitions: 4 }, 'again', NOW)
  assert.equal(next.repetitions, 0)
  assert.equal(next.intervalDays, 0.2)
  assert.ok(next.dueAt < NOW + DAY)
})

test('连续掌握会逐渐扩大复习间隔', () => {
  const first = scheduleReview(undefined, 'good', NOW)
  const second = scheduleReview(first, 'good', first.dueAt)
  const third = scheduleReview(second, 'good', second.dueAt)
  assert.equal(first.intervalDays, 1)
  assert.equal(second.intervalDays, 3)
  assert.ok(third.intervalDays > second.intervalDays)
})

test('简单评价比普通掌握安排更长间隔', () => {
  const current = { ...DEFAULT_REVIEW_SCHEDULE, intervalDays: 3, repetitions: 2 }
  const good = scheduleReview(current, 'good', NOW)
  const easy = scheduleReview(current, 'easy', NOW)
  assert.ok(easy.dueAt > good.dueAt)
  assert.ok(easy.ease > good.ease)
})
