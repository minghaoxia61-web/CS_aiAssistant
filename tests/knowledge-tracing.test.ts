import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildKnowledgeTracingModel,
  predictCorrect,
  updateBkt,
} from '../src/lib/knowledge-tracing'
import type { QuizQuestion, QuizSession } from '../src/shared/types'

function question(id: string, correct: boolean, chapter = '进程'): QuizQuestion {
  return {
    id,
    session_id: 'session',
    type: 'single',
    question: '测试题',
    options: ['A', 'B'],
    answer: 'A',
    user_answer: correct ? 'A' : 'B',
    correct,
    explanation: '',
    chapter,
  }
}

function session(id: string, at: number, outcomes: boolean[], chapter = '进程'): QuizSession {
  return {
    id,
    subject_id: 'subject-1',
    title: id,
    score: outcomes.filter(Boolean).length,
    total: outcomes.length,
    created_at: at,
    questions: outcomes.map((correct, index) => question(`${id}-${index}`, correct, chapter)),
  }
}

test('BKT 在观测正确后提高掌握概率，观测错误后降低', () => {
  const prior = 0.2
  assert.equal(Math.round(predictCorrect(prior) * 100), 34)
  assert.ok(updateBkt(prior, true) > prior)
  assert.ok(updateBkt(prior, false) < prior)
})

test('连续正确会逐步提高下一题答对概率', () => {
  const model = buildKnowledgeTracingModel([
    session('s1', 1, [true, true, true]),
  ], undefined, 3)
  assert.equal(model.steps.length, 3)
  assert.ok(model.steps[1].predictedCorrect > model.steps[0].predictedCorrect)
  assert.ok(model.steps[2].predictedCorrect > model.steps[1].predictedCorrect)
  assert.equal(model.trajectories[0].nextDifficulty, '综合大题')
})

test('预测评测严格使用作答前状态，不泄漏当前答案', () => {
  const model = buildKnowledgeTracingModel([
    session('s1', 1, [true], '进程'),
    session('s2', 2, [false], '死锁'),
  ], undefined, 2)
  assert.equal(model.steps[0].predictedCorrect, model.steps[1].predictedCorrect)
  assert.equal(model.evaluation.sampleCount, 2)
})

test('BKT 与经验基线在同一作答序列上输出可比的预测指标', () => {
  const model = buildKnowledgeTracingModel([
    session('s1', 1, [false, true, true, true]),
    session('s2', 2, [true, false, true], '死锁'),
  ], undefined, 2)
  assert.equal(model.evaluation.sampleCount, 7)
  assert.ok(model.evaluation.bkt.brierScore >= 0 && model.evaluation.bkt.brierScore <= 1)
  assert.ok(model.evaluation.heuristicBaseline.brierScore >= 0)
  assert.ok(['bkt', 'heuristic', 'tie'].includes(model.evaluation.winner))
})
