// 轻量级 RAG：资料分块 + BM25 混合检索（BM25 + 字符 n-gram 模糊匹配）
// 用于智能对话：用户提问时只发送最相关的片段，而非全部资料
// 无论选中多少份资料，对话始终快速
import type { Material } from '@/shared/types'
import { estimateTokens } from './llm'

export interface Chunk {
  materialId: string
  materialName: string
  text: string
  tokens: number
  index: number
  /** 所属科目 ID（按科目隔离检索） */
  subjectId?: string
}

const CHUNK_TOKENS = 800 // 每块约 800 token
const OVERLAP_CHARS = 200 // 块间重叠字符数，避免切断语义

// ---------- BM25 混合检索参数 ----------
const BM25_K1 = 1.5
const BM25_B = 0.75
const BM25_WEIGHT = 0.7
const NGRAM_WEIGHT = 0.3
const TOPK_DEFAULT = 8 // 检索结果硬上限（可配置）
const TOPK_MIN = 4 // 检索结果下限

/** 将文本按段落/句子分块 */
export function chunkText(
  text: string,
  materialId: string,
  materialName: string,
  subjectId?: string,
): Chunk[] {
  if (!text || !text.trim()) return []

  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim())
  const chunks: Chunk[] = []
  let buffer = ''
  let bufferTokens = 0
  let chunkIndex = 0

  const flush = () => {
    if (buffer.trim()) {
      chunks.push({
        materialId,
        materialName,
        text: buffer.trim(),
        tokens: estimateTokens(buffer),
        index: chunkIndex++,
        subjectId,
      })
    }
    buffer = ''
    bufferTokens = 0
  }

  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para)
    // 单个段落超过块大小 → 按句子再分
    if (paraTokens > CHUNK_TOKENS) {
      const sentences = para.split(/(?<=[。！？.!?；;\n])/).filter((s) => s.trim())
      for (const sent of sentences) {
        const sentTokens = estimateTokens(sent)
        if (bufferTokens + sentTokens > CHUNK_TOKENS && bufferTokens > 0) {
          flush()
          // 保留重叠：把上一块末尾带入
          const prev = chunks.length > 0 ? chunks[chunks.length - 1].text : ''
          const overlap = prev.slice(-OVERLAP_CHARS)
          buffer = overlap + sent
          bufferTokens = estimateTokens(buffer)
        } else {
          buffer += (buffer ? '\n' : '') + sent
          bufferTokens += sentTokens
        }
      }
    } else {
      if (bufferTokens + paraTokens > CHUNK_TOKENS && bufferTokens > 0) {
        flush()
        const prev = chunks.length > 0 ? chunks[chunks.length - 1].text : ''
        const overlap = prev.slice(-OVERLAP_CHARS)
        buffer = overlap + '\n' + para
        bufferTokens = estimateTokens(buffer)
      } else {
        buffer += (buffer ? '\n\n' : '') + para
        bufferTokens += paraTokens
      }
    }
  }
  flush()
  return chunks
}

/** 分块所有资料（可按科目隔离，分块带 subjectId 标记） */
export function chunkMaterials(materials: Material[], subjectId?: string): Chunk[] {
  const all: Chunk[] = []
  for (const m of materials) {
    if (m.status !== 'ready' || !m.text_content) continue
    // 指定科目时仅分块该科目资料
    if (subjectId && m.subject_id !== subjectId) continue
    all.push(...chunkText(m.text_content, m.id, m.filename, m.subject_id))
  }
  return all
}

// ---------- 关键词检索（BM25 + 字符 n-gram 模糊匹配） ----------
const STOP_WORDS = new Set([
  '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '上',
  '也', '很', '到', '说', '要', '去', '你', '会', '着', '看', '好', '自己',
  '这', '那', '它', '他', '她', '什么', '怎么', '为什么', '如何', '可以',
  '请', '帮', '给', '一下', '这个', '那个', '一个', '一些', '什么',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these',
  'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which',
  'who', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'some',
  'any', 'no', 'not', 'or', 'and', 'but', 'if', 'then', 'else', 'for',
  'of', 'to', 'in', 'on', 'at', 'by', 'with', 'about', 'as', 'into',
])

/** 分词：英文按单词，中文按 2-gram + 3-gram */
function tokenize(text: string): string[] {
  const tokens: string[] = []
  // 英文单词
  const enWords = text.toLowerCase().match(/[a-z][a-z0-9_]*/g) || []
  for (const w of enWords) {
    if (w.length > 1 && !STOP_WORDS.has(w)) tokens.push(w)
  }
  // 中文：2-gram + 3-gram
  const chinese = text.match(/[\u4e00-\u9fff]+/g) || []
  for (const seg of chinese) {
    for (let i = 0; i < seg.length - 1; i++) {
      const bi = seg.slice(i, i + 2)
      if (!STOP_WORDS.has(bi)) tokens.push(bi)
    }
    for (let i = 0; i < seg.length - 2; i++) {
      tokens.push(seg.slice(i, i + 3))
    }
  }
  return tokens
}

function termFreq(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>()
  for (const t of tokens) {
    tf.set(t, (tf.get(t) || 0) + 1)
  }
  return tf
}

/** 字符 2-gram（用于模糊匹配，处理错别字、近义词） */
function charBigrams(text: string): string[] {
  // 去空白、小写后按相邻字符生成 2-gram
  const normalized = text.toLowerCase().replace(/\s+/g, '')
  const bigrams: string[] = []
  for (let i = 0; i < normalized.length - 1; i++) {
    bigrams.push(normalized.slice(i, i + 2))
  }
  return bigrams
}

/**
 * BM25 评分
 * score(q, d) = Σ IDF(qi) * (f(qi, d) * (k1 + 1)) / (f(qi, d) + k1 * (1 - b + b * |d| / avgdl))
 */
function bm25Score(
  queryTF: Map<string, number>,
  chunkTF: Map<string, number>,
  chunkLen: number,
  avgdl: number,
  df: Map<string, number>,
  N: number,
): number {
  let score = 0
  for (const [term] of queryTF) {
    const cf = chunkTF.get(term) || 0
    if (cf === 0) continue
    const dfVal = df.get(term) || 0
    // BM25 IDF（加 1 保证非负）
    const idf = Math.log(1 + (N - dfVal + 0.5) / (dfVal + 0.5))
    const denom = cf + BM25_K1 * (1 - BM25_B + BM25_B * (chunkLen / (avgdl || 1)))
    score += idf * ((cf * (BM25_K1 + 1)) / denom)
  }
  return score
}

/** 字符 n-gram 相似度：查询 bigram 在 chunk 中的命中率（0~1） */
function ngramSimilarity(queryBigrams: string[], chunkBigramSet: Set<string>): number {
  if (queryBigrams.length === 0 || chunkBigramSet.size === 0) return 0
  let matches = 0
  for (const bg of queryBigrams) {
    if (chunkBigramSet.has(bg)) matches++
  }
  return matches / queryBigrams.length
}

interface ScoredChunk {
  chunk: Chunk
  score: number
}

/**
 * 检索与查询最相关的分块（BM25 + n-gram 混合检索 + 多样化策略）
 * @param chunks 所有资料分块
 * @param query 用户问题
 * @param tokenBudget 返回分块的总 token 上限
 * @param subjectId 可选，按科目隔离检索
 * @param topK 检索结果硬上限（默认 8）
 * @param minK 检索结果下限（默认 4）
 */
export function retrieveChunks(
  chunks: Chunk[],
  query: string,
  tokenBudget: number,
  subjectId?: string,
  topK: number = TOPK_DEFAULT,
  minK: number = TOPK_MIN,
): Chunk[] {
  // 按科目隔离
  let candidates = chunks
  if (subjectId) {
    candidates = chunks.filter((c) => c.subjectId === subjectId)
  }
  if (candidates.length === 0) return []

  const queryTokens = tokenize(query)
  const queryBigrams = charBigrams(query)

  // 无法提取任何关键词 → 返回前 minK 块直到预算用完
  if (queryTokens.length === 0 && queryBigrams.length === 0) {
    const result: Chunk[] = []
    let used = 0
    for (const c of candidates) {
      if (result.length >= minK && used + c.tokens > tokenBudget) break
      if (c.tokens > tokenBudget) continue
      result.push(c)
      used += c.tokens
      if (result.length >= topK) break
    }
    return result
  }

  const queryTF = termFreq(queryTokens)

  // 预计算每个 chunk 的 token、TF、bigram、长度
  const prepared = candidates.map((chunk) => {
    const tokens = tokenize(chunk.text)
    const bigrams = charBigrams(chunk.text)
    return {
      chunk,
      tf: termFreq(tokens),
      bigramSet: new Set(bigrams),
      len: tokens.length,
    }
  })

  // 计算 DF（在候选集合中）
  const df = new Map<string, number>()
  for (const p of prepared) {
    for (const t of p.tf.keys()) {
      df.set(t, (df.get(t) || 0) + 1)
    }
  }
  const N = prepared.length
  const avgdl = prepared.reduce((sum, p) => sum + p.len, 0) / (N || 1)

  // 计算 BM25 + n-gram 原始分数
  const rawScored = prepared.map((p) => {
    const bm25 = bm25Score(queryTF, p.tf, p.len, avgdl, df, N)
    const ngram = ngramSimilarity(queryBigrams, p.bigramSet)
    return { chunk: p.chunk, bm25, ngram }
  })

  // 归一化到 [0, 1]（除以最大值），便于加权融合
  const maxBm25 = Math.max(...rawScored.map((s) => s.bm25), 1e-9)
  const maxNgram = Math.max(...rawScored.map((s) => s.ngram), 1e-9)

  // 最终分数 = 0.7 * BM25 + 0.3 * n-gram
  const scored: ScoredChunk[] = rawScored.map((s) => ({
    chunk: s.chunk,
    score: BM25_WEIGHT * (s.bm25 / maxBm25) + NGRAM_WEIGHT * (s.ngram / maxNgram),
  }))

  // 按分数降序
  scored.sort((a, b) => b.score - a.score)

  // 多样化策略：先从每份资料取最高分的 1 个分块（轮询），确保全覆盖
  const picked: Chunk[] = []
  const pickedKeys = new Set<string>()
  let used = 0

  const keyOf = (c: Chunk) => c.materialId + ':' + c.index

  // 按资料分组，取每份资料最高分的分块
  const byMaterial = new Map<string, ScoredChunk[]>()
  for (const s of scored) {
    if (!byMaterial.has(s.chunk.materialId)) {
      byMaterial.set(s.chunk.materialId, [])
    }
    byMaterial.get(s.chunk.materialId)!.push(s)
  }

  // 第一轮：每份资料取 1 个最高分块
  for (const [, group] of byMaterial) {
    if (group.length === 0) continue
    if (picked.length >= topK) break
    const best = group[0]
    if (best.chunk.tokens > tokenBudget) continue // 单块超预算，跳过
    if (best.score <= 0 && picked.length >= minK) continue
    if (picked.length >= minK && used + best.chunk.tokens > tokenBudget) continue
    picked.push(best.chunk)
    pickedKeys.add(keyOf(best.chunk))
    used += best.chunk.tokens
  }

  // 第二轮：按全局分数填充剩余预算，直到 topK 或预算用完
  for (const { chunk, score } of scored) {
    if (picked.length >= topK) break
    const key = keyOf(chunk)
    if (pickedKeys.has(key)) continue
    if (chunk.tokens > tokenBudget) continue // 单块超预算，永远跳过
    if (picked.length >= minK) {
      // 已达下限：分数为 0 停止，超出预算跳过
      if (score <= 0) break
      if (used + chunk.tokens > tokenBudget) continue
    }
    // 未达下限：强制纳入（即使略超预算），保证最少返回 minK 个
    picked.push(chunk)
    pickedKeys.add(key)
    used += chunk.tokens
  }

  // 按资料 + 原始顺序排列，便于阅读
  picked.sort((a, b) => {
    if (a.materialId !== b.materialId) return 0
    return a.index - b.index
  })
  return picked
}

/** 将检索到的分块组装成上下文文本 */
export function chunksToContext(chunks: Chunk[]): string {
  if (chunks.length === 0) return ''
  // 按资料分组
  const byMaterial = new Map<string, { name: string; chunks: Chunk[] }>()
  for (const c of chunks) {
    if (!byMaterial.has(c.materialId)) {
      byMaterial.set(c.materialId, { name: c.materialName, chunks: [] })
    }
    byMaterial.get(c.materialId)!.chunks.push(c)
  }

  const parts: string[] = []
  for (const [, { name, chunks: cs }] of byMaterial) {
    cs.sort((a, b) => a.index - b.index)
    const text = cs.map((c) => c.text).join('\n\n')
    parts.push(`=== 资料：${name} ===\n${text}`)
  }
  return parts.join('\n\n').trim()
}
