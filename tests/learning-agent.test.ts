import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createLearningAgentRun,
  nextAgentAction,
  reconcileLearningAgentRun,
  startNextAgentAction,
  type LearningAgentInput,
} from '../src/lib/learning-agent'
import type { Material, QuizSession } from '../src/shared/types'

const material: Material = {
  id: 'os-material',
  subject_id: 'subject-1',
  filename: '操作系统.md',
  filetype: 'md',
  size: 100,
  status: 'ready',
  text_content: '# 进程\n\n进程是系统进行资源分配的基本单位，线程是 CPU 调度的基本单位。',
  created_at: 1,
}

function quiz(id: string, at: number, correct: boolean, time = 60): QuizSession {
  return {
    id,
    subject_id: 'subject-1',
    title: id,
    score: correct ? 1 : 0,
    total: 1,
    created_at: at,
    questions: [{
      id: `${id}-q`,
      session_id: id,
      type: 'single',
      question: '进程是什么？',
      options: ['A', 'B'],
      answer: 'A',
      user_answer: correct ? 'A' : 'B',
      correct,
      explanation: '',
      chapter: '进程',
      time_spent: time,
    }],
  }
}

function input(overrides: Partial<LearningAgentInput> = {}): LearningAgentInput {
  return {
    subjectId: 'subject-1',
    subjectName: '操作系统',
    materials: [material],
    quizzes: [quiz('before', 10, false)],
    wrongQuestions: [],
    chats: [],
    ...overrides,
  }
}

test('Agent 会记录诊断证据并在干预前停下等待用户确认', () => {
  const run = createLearningAgentRun(input(), 100)
  assert.equal(run.status, 'ready')
  assert.equal(run.chapter, '进程')
  assert.ok(run.evidence.length > 0)
  assert.equal(run.trace.find((item) => item.state === 'intervene')?.status, 'ready')
  assert.equal(run.trace.find((item) => item.state === 'update')?.status, 'pending')
  assert.ok(nextAgentAction(run))
})

test('无课件证据时 Agent 阻断自动干预', () => {
  const run = createLearningAgentRun(input({ materials: [] }), 100)
  assert.equal(run.status, 'blocked')
  assert.equal(run.trace.find((item) => item.state === 'ground')?.status, 'blocked')
  assert.equal(nextAgentAction(run), undefined)
})

test('点击干预只会推进到待验证，不会提前更新掌握度', () => {
  const run = createLearningAgentRun(input(), 100)
  const started = startNextAgentAction(run, 110)
  assert.equal(started.status, 'waiting_verification')
  assert.equal(started.masteryAfter, undefined)
  assert.equal(started.trace.find((item) => item.state === 'verify')?.status, 'ready')
})

test('只有新的专项作答证据才能完成 BKT 更新与调度', () => {
  const run = startNextAgentAction(createLearningAgentRun(input(), 100), 110)
  const unchanged = reconcileLearningAgentRun(run, input(), 150)
  assert.equal(unchanged.status, 'waiting_verification')

  const completed = reconcileLearningAgentRun(
    run,
    input({ quizzes: [quiz('before', 10, false), quiz('after', 200, true)] }),
    210,
  )
  assert.equal(completed.status, 'complete')
  assert.ok(completed.masteryAfter !== undefined)
  assert.equal(completed.trace.find((item) => item.state === 'verify')?.status, 'completed')
  assert.equal(completed.trace.find((item) => item.state === 'update')?.status, 'completed')
  assert.equal(completed.trace.find((item) => item.state === 'schedule')?.status, 'completed')
})
