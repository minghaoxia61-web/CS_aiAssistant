import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { chunkText, type Chunk } from '../src/lib/rag'
import { runRagAblation, type RagEvaluationCase } from '../src/lib/rag-evaluation'

interface GoldDataset {
  version: number
  description: string
  cases: RagEvaluationCase[]
}

function markdownFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name)
    return entry.isDirectory() ? markdownFiles(path) : path.endsWith('.md') ? [path] : []
  })
}

const knowledgeRoot = join(process.cwd(), 'server', 'knowledge')
const datasetPath = join(process.cwd(), 'data', 'evaluation', 'rag-gold.json')
const dataset = JSON.parse(readFileSync(datasetPath, 'utf8')) as GoldDataset
const chunks: Chunk[] = markdownFiles(knowledgeRoot).flatMap((path) => {
  const materialId = relative(knowledgeRoot, path).replaceAll('\\', '/')
  return chunkText(readFileSync(path, 'utf8'), materialId, materialId, 'gold-corpus')
})
const missingEvidence = dataset.cases.filter((item) =>
  item.answerable !== false && [
    ...(item.expectedMaterialIds || []),
    ...(item.expectedMaterialId ? [item.expectedMaterialId] : []),
  ].some((materialId) => !chunks.some((chunk) => {
    if (chunk.materialId !== materialId) return false
    const evidence = item.expectedEvidenceByMaterial?.[materialId]
      ?? (materialId === item.expectedMaterialId ? item.expectedEvidence : undefined)
    return !evidence || chunk.text.includes(evidence)
  })),
)
if (missingEvidence.length) {
  throw new Error(`金标证据已失效: ${missingEvidence.map((item) => item.id).join(', ')}`)
}

const result = runRagAblation(chunks, dataset.cases, 'gold-corpus')
console.log(`RAG Gold Benchmark v${dataset.version} · ${result.caseCount} cases`)
console.table(result.benchmarks.map((item) => ({
  strategy: item.strategy,
  hitAt1: `${item.hitAt1}%`,
  hitAt3: `${item.hitAt3}%`,
  hitAt5: `${item.hitAt5}%`,
  mrr: `${item.meanReciprocalRank}%`,
  recallAt5: `${item.recallAt5}%`,
  ndcgAt5: `${item.ndcgAt5}%`,
  rejectionAccuracy: `${item.rejectionAccuracy}%`,
  answerabilityAccuracy: `${item.answerabilityAccuracy}%`,
  falseRejectRate: `${item.falseRejectRate}%`,
  durationMs: item.durationMs,
})))
const best = result.benchmarks.find((item) => item.strategy === result.bestStrategy)
if (best) {
  console.log('Category breakdown')
  console.table(best.categoryMetrics.map((item) => ({
    category: item.category,
    cases: item.caseCount,
    hitAt3: `${item.hitAt3}%`,
    mrr: `${item.meanReciprocalRank}%`,
    recallAt5: `${item.recallAt5}%`,
    ndcgAt5: `${item.ndcgAt5}%`,
    rejectionAccuracy: item.rejectionAccuracy === undefined ? '-' : `${item.rejectionAccuracy}%`,
  })))
  console.log('Unanswerable diagnostics')
  console.table(best.results.filter((item) => item.answerable === false).map((item) => ({
    id: item.id,
    topEvidenceScore: Math.round(item.topEvidenceScore * 1000) / 1000,
    topQueryCoverage: Math.round(item.topQueryCoverage * 1000) / 1000,
    rejected: item.rejected,
  })))
  const positiveScores = best.results
    .filter((item) => item.answerable !== false)
    .map((item) => item.topQueryCoverage)
    .sort((a, b) => a - b)
  const percentile = (p: number) => positiveScores[Math.floor((positiveScores.length - 1) * p)] || 0
  console.log('Answerable query coverage percentiles', {
    min: positiveScores[0], p10: percentile(0.1), p25: percentile(0.25), median: percentile(0.5),
  })
}
console.log(`Best strategy: ${result.bestStrategy}`)
