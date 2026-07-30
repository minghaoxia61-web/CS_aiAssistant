import test from 'node:test'
import assert from 'node:assert/strict'
import { buildStudentModel } from '../src/lib/student-model'
import type { QuizQuestion, QuizSession } from '../src/shared/types'

function question(overrides: Partial<QuizQuestion>): QuizQuestion {
  return {
    id: 'q',
    session_id: 'session',
    type: 'single',
    question: '测试题',
    options: ['A', 'B'],
    answer: 'A',
    user_answer: 'B',
    correct: false,
    explanation: '',
    chapter: '进程与线程',
    ...overrides,
  }
}

test('长期学生模型会区分粗心、概念混淆与遗忘', () => {
  const sessions: QuizSession[] = [
    {
      id: 's1',
      subject_id: 'subject-1',
      title: '第一次',
      score: 1,
      total: 2,
      created_at: 1,
      questions: [
        question({ id: 'q1', correct: false, time_spent: 8 }),
        question({ id: 'q2', chapter: '死锁', answer_changes: 3, time_spent: 80 }),
      ],
    },
    {
      id: 's2',
      subject_id: 'subject-1',
      title: '第二次',
      score: 1,
      total: 2,
      created_at: 2,
      questions: [
        question({ id: 'q3', correct: true, user_answer: 'A', time_spent: 30 }),
        question({ id: 'q4', chapter: '死锁', correct: true, user_answer: 'A' }),
      ],
    },
    {
      id: 's3',
      subject_id: 'subject-1',
      title: '第三次',
      score: 0,
      total: 1,
      created_at: 3,
      questions: [question({ id: 'q5', correct: false, time_spent: 60 })],
    },
  ]
  const model = buildStudentModel(sessions, [], 86_400_000 * 20)
  assert.equal(model.errorDistribution.careless, 1)
  assert.equal(model.errorDistribution.misconception, 1)
  assert.equal(model.errorDistribution.forgotten, 1)
  assert.ok(model.trajectories[0].forgettingRisk > 0)
})

test('掌握度较高时推荐综合题', () => {
  const sessions: QuizSession[] = [{
    id: 's1',
    subject_id: 'subject-1',
    title: '高掌握',
    score: 3,
    total: 3,
    created_at: Date.now(),
    questions: [1, 2, 3].map((index) =>
      question({ id: `q${index}`, correct: true, user_answer: 'A' }),
    ),
  }]
  const model = buildStudentModel(sessions)
  assert.equal(model.trajectories[0].nextDifficulty, '综合大题')
})
