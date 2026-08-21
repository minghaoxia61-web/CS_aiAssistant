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
  !chunks.some((chunk) =>
    chunk.materialId === item.expectedMaterialId &&
    (!item.expectedEvidence || chunk.text.includes(item.expectedEvidence)),
  ),
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
  durationMs: item.durationMs,
})))
console.log(`Best strategy: ${result.bestStrategy}`)

