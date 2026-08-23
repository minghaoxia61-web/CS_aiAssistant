import type { ChatSession } from '@/shared/types'
import {
  chunkLocator,
  rankChunks,
  type Chunk,
  type RetrievalStrategy,
} from './rag'

export interface RagEvaluationCase {
  id: string
  query: string
  expectedMaterialId?: string
  /** 跨资料问题可以声明多个相关资料；空数组配合 answerable=false 表示应拒答。 */
  expectedMaterialIds?: string[]
  expectedChunkIndex?: number
  /** 人工标注集可用关键证据锁定片段，避免分块参数变化使 chunk index 失效。 */
  expectedEvidence?: string
  expectedEvidenceByMaterial?: Record<string, string>
  sourceLabel: string
  /** human = 人工标注金标集；generated = 从资料自动生成的快速自检 */
  provenance?: 'human' | 'curated' | 'generated'
  category?: string
  answerable?: boolean
}

export interface RagCaseResult extends RagEvaluationCase {
  rank: number | null
  retrieved: string[]
  retrievedMaterialIds: string[]
  relevantMaterialIds: string[]
  recallAt5: number
  ndcgAt5: number
  rejected: boolean
  topEvidenceScore: number
  topQueryCoverage: number
  rejectionCorrect?: boolean
}

export interface RagCategoryMetrics {
  category: string
  caseCount: number
  hitAt3: number
  meanReciprocalRank: number
  recallAt5: number
  ndcgAt5: number
  rejectionAccuracy?: number
}

export interface RagBenchmark {
  createdAt: number
  caseCount: number
  hitAt1: number
  hitAt3: number
  hitAt5: number
  meanReciprocalRank: number
  recallAt5: number
  ndcgAt5: number
  rejectionAccuracy: number
  answerabilityAccuracy: number
  falseRejectRate: number
  answerableCount: number
  unanswerableCount: number
  materialCoverage: number
  durationMs: number
  strategy: RetrievalStrategy
  provenance: 'human' | 'curated' | 'generated' | 'mixed'
  categoryMetrics: RagCategoryMetrics[]
  results: RagCaseResult[]
}

export interface RagAblationResult {
  createdAt: number
  caseCount: number
  benchmarks: RagBenchmark[]
  bestStrategy: RetrievalStrategy
}

export interface GroundingStats {
  answerCount: number
  citedAnswerCount: number
  citationCoverage: number
  helpfulRate: number
  incorrectRate: number
}

function compact(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function caseQuery(chunk: Chunk): string {
  const heading = chunk.text.match(/^#{1,4}\s+(.+)$/m)?.[1]?.trim()
  if (heading && heading.length >= 2) return heading.slice(0, 60)

  const sentence = compact(chunk.text)
    .split(/[。！？.!?]/)
    .find((item) => item.length >= 8)
  return (sentence || compact(chunk.text)).slice(0, 42)
}

export function buildRagEvaluationCases(chunks: Chunk[], limit = 16): RagEvaluationCase[] {
  if (chunks.length === 0) return []

  const selected: Chunk[] = []
  const seenMaterials = new Set<string>()

  for (const chunk of chunks) {
    if (!seenMaterials.has(chunk.materialId)) {
      selected.push(chunk)
      seenMaterials.add(chunk.materialId)
    }
  }
  for (const chunk of chunks) {
    if (selected.length >= limit) break
    if (!selected.includes(chunk) && chunk.text.trim().length >= 24) selected.push(chunk)
  }

  return selected.slice(0, limit).map((chunk) => ({
    id: `${chunk.materialId}:${chunk.index}`,
    query: caseQuery(chunk),
    expectedMaterialId: chunk.materialId,
    expectedChunkIndex: chunk.index,
    sourceLabel: `${chunk.materialName} · ${chunkLocator(chunk)}`,
    provenance: 'generated',
  }))
}

export function runRagBenchmark(
  chunks: Chunk[],
  cases = buildRagEvaluationCases(chunks),
  subjectId?: string,
  strategy: RetrievalStrategy = 'lexical-hybrid',
): RagBenchmark {
  const startedAt = performance.now()
  const results = cases.map<RagCaseResult>((item) => {
    const ranked = rankChunks(chunks, item.query, { subjectId, strategy })
    const top = ranked.slice(0, 5)
    const retrieved = top.map((result) => result.chunk)
    const relevantMaterialIds = item.expectedMaterialIds
      ?? (item.expectedMaterialId ? [item.expectedMaterialId] : [])
    const answerable = item.answerable !== false && relevantMaterialIds.length > 0
    const rejected = !ranked[0] || ranked[0].queryCoverage < 0.16
    const isRelevant = (chunk: Chunk) => {
      if (!relevantMaterialIds.includes(chunk.materialId)) return false
      const evidence = item.expectedEvidenceByMaterial?.[chunk.materialId]
        ?? (chunk.materialId === item.expectedMaterialId ? item.expectedEvidence : undefined)
      if (evidence) return chunk.text.includes(evidence)
      return item.expectedChunkIndex === undefined || chunk.index === item.expectedChunkIndex
    }
    const rankIndex = answerable ? retrieved.findIndex(isRelevant) : -1
    const retrievedRelevant = new Set(retrieved.filter(isRelevant).map((chunk) => chunk.materialId))
    const recallAt5 = answerable ? retrievedRelevant.size / relevantMaterialIds.length : 0
    const rankedRelevantMaterials = new Set<string>()
    const dcg = retrieved.reduce((sum, chunk, index) => {
      if (!isRelevant(chunk) || rankedRelevantMaterials.has(chunk.materialId)) return sum
      rankedRelevantMaterials.add(chunk.materialId)
      return sum + 1 / Math.log2(index + 2)
    }, 0)
    const idealCount = Math.min(relevantMaterialIds.length, 5)
    const idealDcg = Array.from({ length: idealCount }, (_, index) => 1 / Math.log2(index + 2))
      .reduce((sum, value) => sum + value, 0)
    return {
      ...item,
      rank: rankIndex >= 0 ? rankIndex + 1 : null,
      retrieved: retrieved.map((chunk) => `${chunk.materialName} · ${chunkLocator(chunk)}`),
      retrievedMaterialIds: retrieved.map((chunk) => chunk.materialId),
      relevantMaterialIds,
      recallAt5,
      ndcgAt5: idealDcg ? dcg / idealDcg : 0,
      rejected,
      topEvidenceScore: ranked[0]?.evidenceScore || 0,
      topQueryCoverage: ranked[0]?.queryCoverage || 0,
      rejectionCorrect: answerable ? undefined : rejected,
    }
  })

  const answerableResults = results.filter((item) => item.answerable !== false && item.relevantMaterialIds.length > 0)
  const unanswerableResults = results.filter((item) => item.answerable === false || item.relevantMaterialIds.length === 0)
  const count = answerableResults.length || 1
  const hit = (k: number) =>
    Math.round((answerableResults.filter((item) => item.rank !== null && item.rank <= k).length / count) * 100)
  const reciprocalRank =
    answerableResults.reduce((sum, item) => sum + (item.rank ? 1 / item.rank : 0), 0) / count
  const averagePercent = (items: RagCaseResult[], field: 'recallAt5' | 'ndcgAt5') =>
    items.length ? Math.round((items.reduce((sum, item) => sum + item[field], 0) / items.length) * 100) : 0
  const rejectionAccuracy = unanswerableResults.length
    ? Math.round((unanswerableResults.filter((item) => item.rejectionCorrect).length / unanswerableResults.length) * 100)
    : 0
  const falseRejectRate = answerableResults.length
    ? Math.round((answerableResults.filter((item) => item.rejected).length / answerableResults.length) * 100)
    : 0
  const answerabilityAccuracy = results.length
    ? Math.round((results.filter((item) => item.answerable === false || item.relevantMaterialIds.length === 0
      ? item.rejected
      : !item.rejected).length / results.length) * 100)
    : 0
  const expectedMaterials = new Set(answerableResults.flatMap((item) => item.relevantMaterialIds))
  const hitMaterials = new Set(answerableResults.flatMap((item) =>
    item.retrievedMaterialIds.filter((materialId) => item.relevantMaterialIds.includes(materialId)),
  ))
  const provenances = new Set(cases.map((item) => item.provenance || 'generated'))
  const grouped = new Map<string, RagCaseResult[]>()
  for (const result of results) {
    const key = result.category || 'uncategorized'
    grouped.set(key, [...(grouped.get(key) || []), result])
  }
  const categoryMetrics = [...grouped.entries()].map<RagCategoryMetrics>(([category, items]) => {
    const positive = items.filter((item) => item.answerable !== false && item.relevantMaterialIds.length > 0)
    const negative = items.filter((item) => item.answerable === false || item.relevantMaterialIds.length === 0)
    return {
      category,
      caseCount: items.length,
      hitAt3: positive.length
        ? Math.round((positive.filter((item) => item.rank !== null && item.rank <= 3).length / positive.length) * 100)
        : 0,
      meanReciprocalRank: positive.length
        ? Math.round((positive.reduce((sum, item) => sum + (item.rank ? 1 / item.rank : 0), 0) / positive.length) * 100)
        : 0,
      recallAt5: averagePercent(positive, 'recallAt5'),
      ndcgAt5: averagePercent(positive, 'ndcgAt5'),
      rejectionAccuracy: negative.length
        ? Math.round((negative.filter((item) => item.rejectionCorrect).length / negative.length) * 100)
        : undefined,
    }
  })

  return {
    createdAt: Date.now(),
    caseCount: results.length,
    answerableCount: answerableResults.length,
    unanswerableCount: unanswerableResults.length,
    hitAt1: hit(1),
    hitAt3: hit(3),
    hitAt5: hit(5),
    meanReciprocalRank: Math.round(reciprocalRank * 100),
    recallAt5: averagePercent(answerableResults, 'recallAt5'),
    ndcgAt5: averagePercent(answerableResults, 'ndcgAt5'),
    rejectionAccuracy,
    answerabilityAccuracy,
    falseRejectRate,
    materialCoverage: expectedMaterials.size
      ? Math.round((hitMaterials.size / expectedMaterials.size) * 100)
      : 0,
    durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
    strategy,
    provenance: provenances.size > 1
      ? 'mixed'
      : (provenances.values().next().value || 'generated'),
    categoryMetrics,
    results,
  }
}

/** 在完全相同的数据与用例上运行消融实验。 */
export function runRagAblation(
  chunks: Chunk[],
  cases = buildRagEvaluationCases(chunks),
  subjectId?: string,
  strategies: RetrievalStrategy[] = ['bm25', 'ngram', 'lexical-hybrid'],
): RagAblationResult {
  const benchmarks = strategies.map((strategy) =>
    runRagBenchmark(chunks, cases, subjectId, strategy),
  )
  const best = [...benchmarks].sort((a, b) =>
    b.meanReciprocalRank - a.meanReciprocalRank || b.hitAt3 - a.hitAt3,
  )[0]
  return {
    createdAt: Date.now(),
    caseCount: cases.length,
    benchmarks,
    bestStrategy: best?.strategy || 'lexical-hybrid',
  }
}

export function calculateGroundingStats(sessions: ChatSession[]): GroundingStats {
  const answers = sessions.flatMap((session) =>
    session.messages.filter((message) => message.role === 'assistant' && message.content.trim()),
  )
  const cited = answers.filter((message) => (message.citations?.length || 0) > 0)
  const rated = answers.filter((message) => message.feedback)
  const helpful = rated.filter((message) => message.feedback === 'helpful').length
  const incorrect = rated.filter((message) => message.feedback === 'incorrect').length

  return {
    answerCount: answers.length,
    citedAnswerCount: cited.length,
    citationCoverage: answers.length ? Math.round((cited.length / answers.length) * 100) : 0,
    helpfulRate: rated.length ? Math.round((helpful / rated.length) * 100) : 0,
    incorrectRate: rated.length ? Math.round((incorrect / rated.length) * 100) : 0,
  }
}
