import { calibrateBktParameters, type KnowledgeTraceEvent } from '../src/lib/knowledge-tracing'

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

const result = calibrateBktParameters(events)
const calibration = result.calibration
console.log('BKT synthetic calibration benchmark')
console.table({
  samples: events.length,
  train: calibration.trainCount,
  validation: calibration.validationCount,
  status: calibration.status,
  defaultLogLoss: calibration.defaultValidation?.logLoss,
  fittedLogLoss: calibration.fittedValidation?.logLoss,
  improvement: calibration.logLossImprovement,
})
console.table(result.parameters)

if (calibration.status !== 'fitted' || (calibration.logLossImprovement || 0) < 0.005) {
  process.exitCode = 1
}
