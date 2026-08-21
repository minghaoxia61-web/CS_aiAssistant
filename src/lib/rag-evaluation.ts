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
  expectedMaterialId: string
  expectedChunkIndex?: number
  /** 人工标注集可用关键证据锁定片段，避免分块参数变化使 chunk index 失效。 */
  expectedEvidence?: string
  sourceLabel: string
  /** human = 人工标注金标集；generated = 从资料自动生成的快速自检 */
  provenance?: 'human' | 'generated'
  category?: string
}

export interface RagCaseResult extends RagEvaluationCase {
  rank: number | null
  retrieved: string[]
}

export interface RagBenchmark {
  createdAt: number
  caseCount: number
  hitAt1: number
  hitAt3: number
  hitAt5: number
  meanReciprocalRank: number
  materialCoverage: number
  durationMs: number
  strategy: RetrievalStrategy
  provenance: 'human' | 'generated' | 'mixed'
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
    const retrieved = rankChunks(chunks, item.query, { subjectId, strategy })
      .slice(0, 5)
      .map((result) => result.chunk)
    const rankIndex = retrieved.findIndex((chunk) => {
      if (chunk.materialId !== item.expectedMaterialId) return false
      if (item.expectedEvidence) return chunk.text.includes(item.expectedEvidence)
      return item.expectedChunkIndex === undefined || chunk.index === item.expectedChunkIndex
    })
    return {
      ...item,
      rank: rankIndex >= 0 ? rankIndex + 1 : null,
      retrieved: retrieved.map((chunk) => `${chunk.materialName} · ${chunkLocator(chunk)}`),
    }
  })

  const count = results.length || 1
  const hit = (k: number) =>
    Math.round((results.filter((item) => item.rank !== null && item.rank <= k).length / count) * 100)
  const reciprocalRank =
    results.reduce((sum, item) => sum + (item.rank ? 1 / item.rank : 0), 0) / count
  const expectedMaterials = new Set(cases.map((item) => item.expectedMaterialId))
  const hitMaterials = new Set(
    results
      .filter((item) => item.rank !== null)
      .map((item) => item.expectedMaterialId),
  )
  const provenances = new Set(cases.map((item) => item.provenance || 'generated'))

  return {
    createdAt: Date.now(),
    caseCount: results.length,
    hitAt1: hit(1),
    hitAt3: hit(3),
    hitAt5: hit(5),
    meanReciprocalRank: Math.round(reciprocalRank * 100),
    materialCoverage: expectedMaterials.size
      ? Math.round((hitMaterials.size / expectedMaterials.size) * 100)
      : 0,
    durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
    strategy,
    provenance: provenances.size > 1
      ? 'mixed'
      : (provenances.values().next().value || 'generated'),
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
