import type { QuizSession } from '@/shared/types'

export interface BktParameters {
  /** 首次作答前已掌握概率 */
  prior: number
  /** 每次练习后从未掌握转为掌握的概率 */
  learn: number
  /** 未掌握时猜对的概率 */
  guess: number
  /** 已掌握时失误的概率 */
  slip: number
  /** 每个空白日的遗忘概率，0 即经典 BKT */
  forgetPerDay: number
}

export const DEFAULT_BKT_PARAMETERS: BktParameters = {
  prior: 0.2,
  learn: 0.15,
  guess: 0.2,
  slip: 0.1,
  forgetPerDay: 0.005,
}

export interface KnowledgeTraceEvent {
  chapter: string
  correct: boolean
  at: number
  questionId: string
}

export interface BktStep {
  chapter: string
  questionId: string
  correct: boolean
  predictedCorrect: number
  masteryBefore: number
  masteryAfter: number
  at: number
}

export interface BktTrajectory {
  chapter: string
  mastery: number
  predictedCorrect: number
  attempts: number
  lastPracticedAt: number
  confidence: number
  nextDifficulty: '基础' | '中档' | '综合大题'
}

export interface PredictionMetrics {
  brierScore: number
  logLoss: number
  calibrationError: number
  accuracy: number
}

export interface KnowledgeTracingEvaluation {
  sampleCount: number
  bkt: PredictionMetrics
  heuristicBaseline: PredictionMetrics
  winner: 'bkt' | 'heuristic' | 'tie'
}

export interface KnowledgeTracingModel {
  generatedAt: number
  parameters: BktParameters
  trajectories: BktTrajectory[]
  steps: BktStep[]
  evaluation: KnowledgeTracingEvaluation
}

function probability(value: number): number {
  return Math.min(0.999, Math.max(0.001, value))
}

function validateParameters(parameters: BktParameters): BktParameters {
  return {
    prior: probability(parameters.prior),
    learn: probability(parameters.learn),
    guess: probability(parameters.guess),
    slip: probability(parameters.slip),
    forgetPerDay: Math.min(0.25, Math.max(0, parameters.forgetPerDay)),
  }
}

export function predictCorrect(mastery: number, parameters = DEFAULT_BKT_PARAMETERS): number {
  const p = validateParameters(parameters)
  return probability(mastery * (1 - p.slip) + (1 - mastery) * p.guess)
}

/** 先用当前作答进行贝叶斯更新，再应用一次学习转移。 */
export function updateBkt(
  mastery: number,
  correct: boolean,
  parameters = DEFAULT_BKT_PARAMETERS,
): number {
  const p = validateParameters(parameters)
  const observed = correct
    ? mastery * (1 - p.slip) / predictCorrect(mastery, p)
    : mastery * p.slip /
      (mastery * p.slip + (1 - mastery) * (1 - p.guess))
  return probability(observed + (1 - observed) * p.learn)
}

function applyForgetting(
  mastery: number,
  previousAt: number | undefined,
  currentAt: number,
  parameters: BktParameters,
): number {
  if (!previousAt || currentAt <= previousAt || parameters.forgetPerDay === 0) return mastery
  const days = (currentAt - previousAt) / 86_400_000
  const retained = (1 - parameters.forgetPerDay) ** days
  return probability(mastery * retained)
}

export function extractKnowledgeTraceEvents(sessions: QuizSession[]): KnowledgeTraceEvent[] {
  return [...sessions]
    .sort((a, b) => (a.last_attempt_at || a.created_at) - (b.last_attempt_at || b.created_at))
    .flatMap((session) => session.questions
      .filter((question) => Boolean(question.user_answer?.trim()))
      .map((question, index) => ({
        chapter: question.chapter?.trim() || '未分类知识点',
        correct: question.correct,
        at: (session.last_attempt_at || session.created_at) + index,
        questionId: question.id,
      })))
}

function metrics(predictions: number[], outcomes: boolean[]): PredictionMetrics {
  if (predictions.length === 0) {
    return { brierScore: 0, logLoss: 0, calibrationError: 0, accuracy: 0 }
  }
  let brier = 0
  let loss = 0
  let correctLabels = 0
  const bins = Array.from({ length: 5 }, () => ({ count: 0, predicted: 0, observed: 0 }))
  predictions.forEach((rawPrediction, index) => {
    const prediction = probability(rawPrediction)
    const outcome = outcomes[index] ? 1 : 0
    brier += (prediction - outcome) ** 2
    loss += -(outcome * Math.log(prediction) + (1 - outcome) * Math.log(1 - prediction))
    if ((prediction >= 0.5) === Boolean(outcome)) correctLabels += 1
    const bin = bins[Math.min(4, Math.floor(prediction * 5))]
    bin.count += 1
    bin.predicted += prediction
    bin.observed += outcome
  })
  const calibration = bins.reduce((sum, bin) => {
    if (!bin.count) return sum
    return sum + (bin.count / predictions.length) *
      Math.abs(bin.predicted / bin.count - bin.observed / bin.count)
  }, 0)
  return {
    brierScore: Math.round((brier / predictions.length) * 1000) / 1000,
    logLoss: Math.round((loss / predictions.length) * 1000) / 1000,
    calibrationError: Math.round(calibration * 1000) / 1000,
    accuracy: Math.round((correctLabels / predictions.length) * 100),
  }
}

function heuristicPrediction(history: boolean[]): number {
  if (history.length === 0) return 0.5
  const weighted = history.reduce((sum, correct, index) => {
    const weight = 0.55 + (index / Math.max(1, history.length - 1)) * 0.45
    return { score: sum.score + (correct ? weight : 0), weight: sum.weight + weight }
  }, { score: 0, weight: 0 })
  const confidence = 1 - Math.exp(-history.length / 3)
  return probability((weighted.score / weighted.weight) * confidence + 0.5 * (1 - confidence))
}

export function buildKnowledgeTracingModel(
  sessions: QuizSession[],
  parameters: BktParameters = DEFAULT_BKT_PARAMETERS,
  now = Date.now(),
): KnowledgeTracingModel {
  const config = validateParameters(parameters)
  const events = extractKnowledgeTraceEvents(sessions)
  const state = new Map<string, { mastery: number; attempts: number; lastAt?: number }>()
  const histories = new Map<string, boolean[]>()
  const steps: BktStep[] = []
  const bktPredictions: number[] = []
  const heuristicPredictions: number[] = []
  const outcomes: boolean[] = []

  for (const event of events) {
    const current = state.get(event.chapter) || { mastery: config.prior, attempts: 0 }
    const masteryBefore = applyForgetting(current.mastery, current.lastAt, event.at, config)
    const predicted = predictCorrect(masteryBefore, config)
    const history = histories.get(event.chapter) || []
    bktPredictions.push(predicted)
    heuristicPredictions.push(heuristicPrediction(history))
    outcomes.push(event.correct)
    const masteryAfter = updateBkt(masteryBefore, event.correct, config)
    steps.push({ ...event, predictedCorrect: predicted, masteryBefore, masteryAfter })
    state.set(event.chapter, {
      mastery: masteryAfter,
      attempts: current.attempts + 1,
      lastAt: event.at,
    })
    history.push(event.correct)
    histories.set(event.chapter, history)
  }

  const trajectories = Array.from(state.entries()).map<BktTrajectory>(([chapter, item]) => {
    const currentMastery = applyForgetting(item.mastery, item.lastAt, now, config)
    const next = predictCorrect(currentMastery, config)
    return {
      chapter,
      mastery: Math.round(currentMastery * 100),
      predictedCorrect: Math.round(next * 100),
      attempts: item.attempts,
      lastPracticedAt: item.lastAt || now,
      confidence: Math.round((1 - Math.exp(-item.attempts / 3)) * 100),
      nextDifficulty: next >= 0.8 ? '综合大题' : next >= 0.58 ? '中档' : '基础',
    }
  }).sort((a, b) => a.predictedCorrect - b.predictedCorrect)

  const bktMetrics = metrics(bktPredictions, outcomes)
  const heuristicMetrics = metrics(heuristicPredictions, outcomes)
  const delta = bktMetrics.brierScore - heuristicMetrics.brierScore
  return {
    generatedAt: now,
    parameters: config,
    trajectories,
    steps,
    evaluation: {
      sampleCount: outcomes.length,
      bkt: bktMetrics,
      heuristicBaseline: heuristicMetrics,
      winner: Math.abs(delta) < 0.005 ? 'tie' : delta < 0 ? 'bkt' : 'heuristic',
    },
  }
}
