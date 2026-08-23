import {
  createLearningAgentRun,
  reconcileLearningAgentRun,
  startNextAgentAction,
  type LearningAgentInput,
  type LearningAgentRun,
} from '../src/lib/learning-agent'
import type { Material, QuizSession, WrongQuestion } from '../src/shared/types'

const subjectId = 'agent-eval-subject'
const runCreatedAt = 100

const material: Material = {
  id: 'agent-os-material', subject_id: subjectId, filename: '操作系统.md', filetype: 'md',
  size: 100, status: 'ready', created_at: 1,
  text_content: '# 进程\n\n进程是资源分配的基本单位，线程是 CPU 调度的基本单位。',
}

function quiz(id: string, at: number, correct: boolean, chapter = '进程'): QuizSession {
  return {
    id, subject_id: subjectId, title: id, score: correct ? 1 : 0, total: 1, created_at: at,
    questions: [{
      id: `${id}-q`, session_id: id, type: 'single', question: `${chapter}是什么？`, options: ['A', 'B'],
      answer: 'A', user_answer: correct ? 'A' : 'B', correct, explanation: '', chapter, time_spent: 45,
    }],
  }
}

function reviewedWrongQuestion(): WrongQuestion {
  const session = quiz('review-source', 10, false)
  return {
    id: 'reviewed-wrong', subject_id: subjectId, quiz_session_id: session.id,
    question: session.questions[0], user_answer: 'B', correct_answer: 'A', created_at: 10,
    reviewed: true, review_count: 1,
    review_schedule: { dueAt: 1_000, intervalDays: 1, ease: 2.5, repetitions: 1, lastReviewedAt: 200 },
  }
}

function baseInput(overrides: Partial<LearningAgentInput> = {}): LearningAgentInput {
  return {
    subjectId, subjectName: '操作系统', materials: [material], quizzes: [quiz('before', 10, false)],
    wrongQuestions: [], chats: [], ...overrides,
  }
}

function readyRun(input = baseInput()): LearningAgentRun {
  return createLearningAgentRun(input, runCreatedAt)
}

function startedRun(): LearningAgentRun {
  return startNextAgentAction(readyRun(), 110)
}

export function runAgentScenarioFixture(fixture: string): LearningAgentRun {
  switch (fixture) {
    case 'no-history':
      return readyRun(baseInput({ quizzes: [], wrongQuestions: [] }))
    case 'no-material':
      return readyRun(baseInput({ materials: [] }))
    case 'foreign-material':
      return readyRun(baseInput({ materials: [{ ...material, subject_id: 'another-subject' }] }))
    case 'ready':
      return readyRun()
    case 'started':
      return startedRun()
    case 'stale-reconcile':
      return reconcileLearningAgentRun(startedRun(), baseInput(), 210)
    case 'unrelated-reconcile':
      return reconcileLearningAgentRun(
        startedRun(),
        baseInput({ quizzes: [quiz('before', 10, false), quiz('after-other', 200, true, '线程')] }),
        210,
      )
    case 'correct-reconcile':
      return reconcileLearningAgentRun(
        startedRun(), baseInput({ quizzes: [quiz('before', 10, false), quiz('after-correct', 200, true)] }), 210,
      )
    case 'wrong-reconcile':
      return reconcileLearningAgentRun(
        startedRun(), baseInput({ quizzes: [quiz('before', 10, false), quiz('after-wrong', 200, false)] }), 210,
      )
    case 'review-reconcile':
      return reconcileLearningAgentRun(startedRun(), baseInput({ wrongQuestions: [reviewedWrongQuestion()] }), 210)
    case 'serialized-reconcile': {
      const restored = JSON.parse(JSON.stringify(startedRun())) as LearningAgentRun
      return reconcileLearningAgentRun(
        restored, baseInput({ quizzes: [quiz('before', 10, false), quiz('after-restore', 200, true)] }), 210,
      )
    }
    default:
      throw new Error(`未知 Agent fixture: ${fixture}`)
  }
}
