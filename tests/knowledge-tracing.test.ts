import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildKnowledgeTracingModel,
  calibrateBktParameters,
  predictCorrect,
  updateBkt,
} from '../src/lib/knowledge-tracing'
import type { KnowledgeTraceEvent } from '../src/lib/knowledge-tracing'
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

function simulatedEvents(): KnowledgeTraceEvent[] {
  let seed = 42
  const random = () => ((seed = (seed * 1_664_525 + 1_013_904_223) >>> 0) / 4_294_967_296)
  const truth = { prior: 0.55, learn: 0.06, guess: 0.38, slip: 0.24 }
  const events: KnowledgeTraceEvent[] = []
  for (let chapter = 0; chapter < 8; chapter += 1) {
    let mastered = random() < truth.prior
    for (let attempt = 0; attempt < 35; attempt += 1) {
      const correct = random() < (mastered ? 1 - truth.slip : truth.guess)
      events.push({
        chapter: `知识点-${chapter}`,
        correct,
        at: attempt * 1_000 + chapter,
        questionId: `${chapter}-${attempt}`,
      })
      if (!mastered && random() < truth.learn) mastered = true
    }
  }
  return events
}

test('参数拟合只在时间留出集优于默认参数时生效', () => {
  const result = calibrateBktParameters(simulatedEvents())
  assert.equal(result.calibration.status, 'fitted')
  assert.equal(result.calibration.trainCount, 224)
  assert.equal(result.calibration.validationCount, 56)
  assert.ok((result.calibration.logLossImprovement || 0) >= 0.005)
  assert.ok(
    (result.calibration.fittedValidation?.logLoss || 1) <
    (result.calibration.defaultValidation?.logLoss || 0),
  )
})

test('少量个人作答不会触发不可靠的参数拟合', () => {
  const events = simulatedEvents().slice(0, 12)
  const result = calibrateBktParameters(events)
  assert.equal(result.calibration.status, 'fallback_insufficient_data')
  assert.deepEqual(result.parameters, {
    prior: 0.2,
    learn: 0.15,
    guess: 0.2,
    slip: 0.1,
    forgetPerDay: 0.005,
  })
})
