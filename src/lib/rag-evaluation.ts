import type { ChatSession } from '@/shared/types'
import { retrieveChunks, type Chunk } from './rag'

export interface RagEvaluationCase {
  id: string
  query: string
  expectedMaterialId: string
  expectedChunkIndex: number
  sourceLabel: string
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
  results: RagCaseResult[]
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
    sourceLabel: `${chunk.materialName} · 片段 ${chunk.index + 1}`,
  }))
}

export function runRagBenchmark(
  chunks: Chunk[],
  cases = buildRagEvaluationCases(chunks),
  subjectId?: string,
): RagBenchmark {
  const startedAt = performance.now()
  const results = cases.map<RagCaseResult>((item) => {
    const retrieved = retrieveChunks(chunks, item.query, 12_000, subjectId, 5, 1)
    const rankIndex = retrieved.findIndex(
      (chunk) =>
        chunk.materialId === item.expectedMaterialId &&
        chunk.index === item.expectedChunkIndex,
    )
    return {
      ...item,
      rank: rankIndex >= 0 ? rankIndex + 1 : null,
      retrieved: retrieved.map((chunk) => `${chunk.materialName} · 片段 ${chunk.index + 1}`),
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
    results,
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
