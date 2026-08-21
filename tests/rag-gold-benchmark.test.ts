import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import test from 'node:test'
import { chunkText, rankChunks, type Chunk } from '../src/lib/rag'
import {
  runRagAblation,
  type RagEvaluationCase,
} from '../src/lib/rag-evaluation'

interface GoldDataset {
  cases: RagEvaluationCase[]
}

function markdownFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name)
    return entry.isDirectory() ? markdownFiles(path) : path.endsWith('.md') ? [path] : []
  })
}

function loadGoldCorpus(): { chunks: Chunk[]; cases: RagEvaluationCase[] } {
  const root = join(process.cwd(), 'server', 'knowledge')
  const dataset = JSON.parse(
    readFileSync(join(process.cwd(), 'data', 'evaluation', 'rag-gold.json'), 'utf8'),
  ) as GoldDataset
  const chunks = markdownFiles(root).flatMap((path) => {
    const id = relative(root, path).replaceAll('\\', '/')
    return chunkText(readFileSync(path, 'utf8'), id, id, 'gold-corpus')
  })
  return { chunks, cases: dataset.cases }
}

test('金标集的每条证据都能在指定资料中定位', () => {
  const { chunks, cases } = loadGoldCorpus()
  for (const item of cases) {
    assert.ok(
      chunks.some((chunk) =>
        chunk.materialId === item.expectedMaterialId &&
        (!item.expectedEvidence || chunk.text.includes(item.expectedEvidence)),
      ),
      `missing gold evidence: ${item.id}`,
    )
  }
})

test('原始检索排名按分数降序，不被资料展示顺序改写', () => {
  const { chunks, cases } = loadGoldCorpus()
  const ranked = rankChunks(chunks, cases[0].query, {
    subjectId: 'gold-corpus',
    strategy: 'lexical-hybrid',
  })
  assert.ok(ranked.length > 5)
  assert.ok(ranked.every((item, index) => index === 0 || ranked[index - 1].score >= item.score))
})

test('固定金标集上的混合检索质量不发生明显回退', () => {
  const { chunks, cases } = loadGoldCorpus()
  const result = runRagAblation(chunks, cases, 'gold-corpus')
  const hybrid = result.benchmarks.find((item) => item.strategy === 'lexical-hybrid')
  assert.ok(hybrid)
  assert.ok(hybrid.hitAt3 >= 70, `Hit@3 regressed to ${hybrid.hitAt3}%`)
  assert.ok(hybrid.meanReciprocalRank >= 60, `MRR regressed to ${hybrid.meanReciprocalRank}%`)
})
