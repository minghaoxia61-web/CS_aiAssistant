// 向量语义检索层：transformers.js（all-MiniLM-L6-v2，384维）+ BM25 混合召回
// 模型加载与向量化在 Web Worker 后台线程执行（不阻塞 UI），向量持久化到 IndexedDB vectors 表
// 检索时：有向量 → BM25×0.4 + 向量×0.6 混合召回；无向量 → 回退纯 BM25（降级兼容）
import type { Chunk } from './rag'
import { submitEmbedTask } from './worker-pool'
import { getAllByIndex, bulkPut, clearBySubject, type StoreName } from './db'

// ---------- 混合检索权重 ----------
export const VECTOR_WEIGHT = 0.6
export const BM25_IN_HYBRID = 0.4

/** vectors 表记录结构 */
export interface VectorRecord {
  chunkId: string
  subjectId: string
  materialId: string
  /** 384 维归一化向量 */
  vector: number[]
}

/** chunk 唯一键（与 chunks 表 id、vectors 表 chunkId 一致） */
function chunkKey(materialId: string, index: number): string {
  return `${materialId}:${index}`
}

// ---------- 向量加载 ----------
/** 加载某科目的全部向量（chunkId -> Float32Array） */
export async function loadSubjectVectors(subjectId: string): Promise<Map<string, Float32Array>> {
  const records = await getAllByIndex<VectorRecord>('vectors', 'subject_id', subjectId)
  const map = new Map<string, Float32Array>()
  for (const r of records) {
    map.set(r.chunkId, new Float32Array(r.vector))
  }
  return map
}

// ---------- 向量构建 ----------
/** 批量构建并持久化向量（仅构建缺失的，已存在的跳过） */
export async function buildAndPersistVectors(
  subjectId: string,
  chunks: Chunk[],
  onProgress?: (current: number, total: number, message: string) => void,
): Promise<void> {
  if (chunks.length === 0) return
  const existing = await loadSubjectVectors(subjectId)
  const toEmbed: Chunk[] = []
  for (const c of chunks) {
    if (!existing.has(chunkKey(c.materialId, c.index))) toEmbed.push(c)
  }
  if (toEmbed.length === 0) return

  onProgress?.(0, toEmbed.length, '加载向量模型...')
  const texts = toEmbed.map((c) => c.text)
  const { vectors } = await submitEmbedTask(texts, (p) => {
    onProgress?.(p.current, p.total, p.message || '向量化中')
  })

  const records: VectorRecord[] = toEmbed.map((c, i) => ({
    chunkId: chunkKey(c.materialId, c.index),
    subjectId,
    materialId: c.materialId,
    vector: vectors[i],
  }))
  await bulkPut('vectors', records)
}

// ---------- 构建去重 ----------
// 同一科目正在构建向量的 Promise，避免后台预构建与问答触发重复构建
const buildingPromises = new Map<string, Promise<void>>()

/**
 * 确保某科目的向量已构建并持久化，返回向量 Map。
 * - 后台预构建与问答检索共用此入口，自动去重
 * - 失败时返回空 Map（调用方回退纯 BM25）
 */
export async function ensureSubjectVectors(
  subjectId: string,
  chunks: Chunk[],
  onProgress?: (current: number, total: number, message: string) => void,
): Promise<Map<string, Float32Array>> {
  // 等待已在进行的构建
  const pending = buildingPromises.get(subjectId)
  if (pending) {
    try {
      await pending
    } catch {
      // 忽略，下面重新检查
    }
  }

  let vectors = await loadSubjectVectors(subjectId)
  const missing = chunks.filter((c) => !vectors.has(chunkKey(c.materialId, c.index)))
  if (missing.length === 0) return vectors

  // 构建缺失向量
  const p = buildAndPersistVectors(subjectId, missing, onProgress)
    .catch(() => {
      // 构建失败静默处理，问答回退纯 BM25
    })
    .finally(() => {
      buildingPromises.delete(subjectId)
    })
  buildingPromises.set(subjectId, p)
  await p
  return loadSubjectVectors(subjectId)
}

// ---------- 模型加载状态（供 UI 展示进度） ----------
export type ModelStatus = 'idle' | 'loading' | 'ready' | 'error'
const modelListeners = new Set<(status: ModelStatus) => void>()
let modelStatus: ModelStatus = 'idle'

export function getModelStatus(): ModelStatus {
  return modelStatus
}

/** 订阅模型状态变化，立即回调一次当前状态 */
export function onModelStatusChange(cb: (status: ModelStatus) => void): () => void {
  modelListeners.add(cb)
  cb(modelStatus)
  return () => {
    modelListeners.delete(cb)
  }
}

function setModelStatus(s: ModelStatus): void {
  modelStatus = s
  for (const cb of modelListeners) cb(s)
}

// ---------- 查询向量化 ----------
/** 单条查询向量化（失败返回 null，调用方回退纯 BM25） */
export async function embedQuery(text: string): Promise<Float32Array | null> {
  setModelStatus('loading')
  try {
    const { vectors } = await submitEmbedTask([text], (p) => {
      // Worker 在加载模型阶段会发送 message='loading-model'
      if (p.message === 'loading-model') {
        setModelStatus('loading')
      } else if (modelStatus === 'loading') {
        setModelStatus('ready')
      }
    })
    setModelStatus('ready')
    return new Float32Array(vectors[0])
  } catch {
    setModelStatus('error')
    return null
  }
}

// ---------- 相似度计算 ----------
/**
 * 余弦相似度。向量已归一化（transformers.js normalize:true），等价于点积。
 * 保留通用实现以增强鲁棒性。
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0
  let normA = 0
  let normB = 0
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

// ---------- 清理 ----------
/** 删除某科目的全部向量（分块重建时调用，清除陈旧向量） */
export async function clearSubjectVectors(subjectId: string): Promise<void> {
  await clearBySubject('vectors' as StoreName, subjectId)
}
