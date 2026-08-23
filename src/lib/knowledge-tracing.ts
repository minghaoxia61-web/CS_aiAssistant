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

export interface BktCalibration {
  status: 'fitted' | 'fallback_insufficient_data' | 'fallback_no_improvement' | 'fixed'
  trainCount: number
  validationCount: number
  defaultValidation?: PredictionMetrics
  fittedValidation?: PredictionMetrics
  logLossImprovement?: number
}

export interface KnowledgeTracingModel {
  generatedAt: number
  parameters: BktParameters
  trajectories: BktTrajectory[]
  steps: BktStep[]
  evaluation: KnowledgeTracingEvaluation
  calibration: BktCalibration
}

function probability(value: number): number {
  return Math.min(0.999, Math.max(0.001, value))
}

export function validateParameters(parameters: BktParameters): BktParameters {
  return {
    prior: probability(parameters.prior),
    learn: probability(parameters.learn),
    guess: probability(parameters.guess),
    slip: probability(parameters.slip),
    forgetPerDay: Math.min(0.25, Math.max(0, parameters.forgetPerDay)),
  }
}

const FIT_BOUNDS: Record<keyof BktParameters, [number, number]> = {
  prior: [0.02, 0.8],
  learn: [0.01, 0.6],
  guess: [0.02, 0.45],
  slip: [0.02, 0.35],
  forgetPerDay: [0, 0.08],
}

const FIT_INITIAL_STEPS: Record<keyof BktParameters, number> = {
  prior: 0.16,
  learn: 0.12,
  guess: 0.1,
  slip: 0.08,
  forgetPerDay: 0.015,
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

function averageLogLoss(events: KnowledgeTraceEvent[], parameters: BktParameters): number {
  if (!events.length) return 0
  const states = new Map<string, { mastery: number; lastAt?: number }>()
  let loss = 0
  for (const event of events) {
    const current = states.get(event.chapter) || { mastery: parameters.prior }
    const mastery = applyForgetting(current.mastery, current.lastAt, event.at, parameters)
    const prediction = predictCorrect(mastery, parameters)
    loss += event.correct ? -Math.log(prediction) : -Math.log(1 - prediction)
    states.set(event.chapter, {
      mastery: updateBkt(mastery, event.correct, parameters),
      lastAt: event.at,
    })
  }
  return loss / events.length
}

function splitCalibrationEvents(events: KnowledgeTraceEvent[]): {
  train: KnowledgeTraceEvent[]
  validation: KnowledgeTraceEvent[]
} {
  const chapters = new Map<string, KnowledgeTraceEvent[]>()
  for (const event of events) {
    const list = chapters.get(event.chapter) || []
    list.push(event)
    chapters.set(event.chapter, list)
  }
  const train: KnowledgeTraceEvent[] = []
  const validation: KnowledgeTraceEvent[] = []
  for (const sequence of chapters.values()) {
    sequence.sort((a, b) => a.at - b.at)
    const validationSize = sequence.length >= 5
      ? Math.max(1, Math.floor(sequence.length * 0.2))
      : 0
    train.push(...sequence.slice(0, sequence.length - validationSize))
    validation.push(...sequence.slice(sequence.length - validationSize))
  }
  return {
    train: train.sort((a, b) => a.at - b.at),
    validation: validation.sort((a, b) => a.at - b.at),
  }
}

function evaluateHoldout(
  train: KnowledgeTraceEvent[],
  validation: KnowledgeTraceEvent[],
  parameters: BktParameters,
): PredictionMetrics {
  const states = new Map<string, { mastery: number; lastAt?: number }>()
  for (const event of train) {
    const current = states.get(event.chapter) || { mastery: parameters.prior }
    const mastery = applyForgetting(current.mastery, current.lastAt, event.at, parameters)
    states.set(event.chapter, {
      mastery: updateBkt(mastery, event.correct, parameters),
      lastAt: event.at,
    })
  }
  const predictions: number[] = []
  const outcomes: boolean[] = []
  for (const event of validation) {
    const current = states.get(event.chapter) || { mastery: parameters.prior }
    const mastery = applyForgetting(current.mastery, current.lastAt, event.at, parameters)
    predictions.push(predictCorrect(mastery, parameters))
    outcomes.push(event.correct)
    states.set(event.chapter, {
      mastery: updateBkt(mastery, event.correct, parameters),
      lastAt: event.at,
    })
  }
  return metrics(predictions, outcomes)
}

/**
 * 使用按知识点时间切分的留出集拟合全局 BKT 参数。
 * 只有样本充足且留出集 Log Loss 确实改善时才采用拟合结果。
 */
export function calibrateBktParameters(
  events: KnowledgeTraceEvent[],
  defaults: BktParameters = DEFAULT_BKT_PARAMETERS,
): { parameters: BktParameters; calibration: BktCalibration } {
  const fallback = validateParameters(defaults)
  const { train, validation } = splitCalibrationEvents(events)
  if (train.length < 20 || validation.length < 5) {
    return {
      parameters: fallback,
      calibration: {
        status: 'fallback_insufficient_data',
        trainCount: train.length,
        validationCount: validation.length,
      },
    }
  }

  const lastAtByChapter = new Map<string, number>()
  let hasForgettingSignal = false
  for (const event of train) {
    const previousAt = lastAtByChapter.get(event.chapter)
    if (previousAt !== undefined && event.at - previousAt >= 86_400_000) {
      hasForgettingSignal = true
      break
    }
    lastAtByChapter.set(event.chapter, event.at)
  }
  const keys: (keyof BktParameters)[] = ['prior', 'learn', 'guess', 'slip']
  if (hasForgettingSignal) keys.push('forgetPerDay')
  let fitted = { ...fallback }
  let bestLoss = averageLogLoss(train, fitted)

  for (let round = 0; round < 4; round += 1) {
    for (const key of keys) {
      const step = FIT_INITIAL_STEPS[key] / (2 ** round)
      const [minimum, maximum] = FIT_BOUNDS[key]
      const candidates = [-2, -1, 0, 1, 2]
        .map((offset) => Math.min(maximum, Math.max(minimum, fitted[key] + offset * step)))
      for (const value of new Set(candidates)) {
        const candidate = validateParameters({ ...fitted, [key]: value })
        if (candidate.guess + candidate.slip >= 0.75) continue
        const loss = averageLogLoss(train, candidate)
        if (loss + 1e-9 < bestLoss) {
          fitted = candidate
          bestLoss = loss
        }
      }
    }
  }

  const defaultValidation = evaluateHoldout(train, validation, fallback)
  const fittedValidation = evaluateHoldout(train, validation, fitted)
  const improvement = Math.round((defaultValidation.logLoss - fittedValidation.logLoss) * 1000) / 1000
  const useFitted = improvement >= 0.005
  return {
    parameters: useFitted ? fitted : fallback,
    calibration: {
      status: useFitted ? 'fitted' : 'fallback_no_improvement',
      trainCount: train.length,
      validationCount: validation.length,
      defaultValidation,
      fittedValidation,
      logLossImprovement: improvement,
    },
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
  parameters: BktParameters | 'auto' = 'auto',
  now = Date.now(),
): KnowledgeTracingModel {
  const events = extractKnowledgeTraceEvents(sessions)
  const calibrated = parameters === 'auto'
    ? calibrateBktParameters(events)
    : {
        parameters: validateParameters(parameters),
        calibration: {
          status: 'fixed' as const,
          trainCount: events.length,
          validationCount: 0,
        },
      }
  const config = calibrated.parameters
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
    calibration: calibrated.calibration,
    evaluation: {
      sampleCount: outcomes.length,
      bkt: bktMetrics,
      heuristicBaseline: heuristicMetrics,
      winner: Math.abs(delta) < 0.005 ? 'tie' : delta < 0 ? 'bkt' : 'heuristic',
    },
  }
}
