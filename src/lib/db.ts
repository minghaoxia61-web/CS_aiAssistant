// IndexedDB 封装层：原生 API + 薄封装
// 9 张表：subjects / materials / chunks / vectors / chatSessions / quizSessions / wrongQuestions / reviewDocs / cache
// 支持外键索引、按科目级联删除、过期缓存清理、存储占用统计
import type { Material } from '@/shared/types'

const DB_NAME = 'cs-assistant-db'
const DB_VERSION = 1

/** 所有表名 */
export const STORES = [
  'subjects',
  'materials',
  'chunks',
  'vectors',
  'chatSessions',
  'quizSessions',
  'wrongQuestions',
  'reviewDocs',
  'cache',
] as const

export type StoreName = (typeof STORES)[number]

let dbPromise: Promise<IDBDatabase> | null = null

/** 打开数据库（单例，首次调用时创建表与索引） */
export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('当前环境不支持 IndexedDB'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      // subjects：keyPath=id
      if (!db.objectStoreNames.contains('subjects')) {
        db.createObjectStore('subjects', { keyPath: 'id' })
      }
      // materials：keyPath=id，索引 subject_id / status
      if (!db.objectStoreNames.contains('materials')) {
        const s = db.createObjectStore('materials', { keyPath: 'id' })
        s.createIndex('subject_id', 'subject_id', { unique: false })
        s.createIndex('status', 'status', { unique: false })
      }
      // chunks：keyPath=id，索引 subject_id / material_id / [subject_id+index]
      if (!db.objectStoreNames.contains('chunks')) {
        const s = db.createObjectStore('chunks', { keyPath: 'id' })
        s.createIndex('subject_id', 'subjectId', { unique: false })
        s.createIndex('material_id', 'materialId', { unique: false })
        s.createIndex('subject_idx', ['subjectId', 'index'], { unique: false })
      }
      // vectors：keyPath=chunkId，索引 subject_id
      if (!db.objectStoreNames.contains('vectors')) {
        const s = db.createObjectStore('vectors', { keyPath: 'chunkId' })
        s.createIndex('subject_id', 'subjectId', { unique: false })
      }
      // chatSessions：keyPath=id，索引 subject_id / created_at
      if (!db.objectStoreNames.contains('chatSessions')) {
        const s = db.createObjectStore('chatSessions', { keyPath: 'id' })
        s.createIndex('subject_id', 'subject_id', { unique: false })
        s.createIndex('created_at', 'created_at', { unique: false })
      }
      // quizSessions：keyPath=id，索引 subject_id / created_at
      if (!db.objectStoreNames.contains('quizSessions')) {
        const s = db.createObjectStore('quizSessions', { keyPath: 'id' })
        s.createIndex('subject_id', 'subject_id', { unique: false })
        s.createIndex('created_at', 'created_at', { unique: false })
      }
      // wrongQuestions：keyPath=id，索引 subject_id / [subject_id+reviewed]
      if (!db.objectStoreNames.contains('wrongQuestions')) {
        const s = db.createObjectStore('wrongQuestions', { keyPath: 'id' })
        s.createIndex('subject_id', 'subject_id', { unique: false })
        s.createIndex('subject_reviewed', ['subject_id', 'reviewed'], { unique: false })
      }
      // reviewDocs：keyPath=id，索引 subject_id
      if (!db.objectStoreNames.contains('reviewDocs')) {
        const s = db.createObjectStore('reviewDocs', { keyPath: 'id' })
        s.createIndex('subject_id', 'subject_id', { unique: false })
      }
      // cache：keyPath=key，索引 expires_at（用于过期清理）
      if (!db.objectStoreNames.contains('cache')) {
        const s = db.createObjectStore('cache', { keyPath: 'key' })
        s.createIndex('expires_at', 'expires_at', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

/** 将 IDBRequest 转为 Promise */
function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** 事务封装：自动 wait，支持在回调中执行多个操作 */
export async function tx<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest | IDBRequest[] | void,
): Promise<T> {
  const db = await openDB()
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(store, mode)
    const objectStore = transaction.objectStore(store)
    let result: unknown
    try {
      const r = fn(objectStore)
      if (r instanceof IDBRequest) {
        r.onsuccess = () => (result = r.result)
      } else if (Array.isArray(r)) {
        // 多个请求：以最后一个为结果
        const last = r[r.length - 1]
        if (last instanceof IDBRequest) last.onsuccess = () => (result = last.result)
      }
    } catch (e) {
      reject(e)
      return
    }
    transaction.oncomplete = () => resolve(result as T)
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

// ---------- 通用 CRUD ----------
/** 写入/覆盖一条记录 */
export async function put<T>(store: StoreName, value: T): Promise<void> {
  await tx(store, 'readwrite', (s) => s.put(value))
}

/** 批量写入 */
export async function bulkPut<T>(store: StoreName, values: T[]): Promise<void> {
  if (values.length === 0) return
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(store, 'readwrite')
    const objectStore = transaction.objectStore(store)
    for (const v of values) objectStore.put(v)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

/** 按 key 取一条 */
export async function get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDB()
  return reqToPromise(db.transaction(store, 'readonly').objectStore(store).get(key) as IDBRequest<T | undefined>)
}

/** 按 key 删除 */
export async function del(store: StoreName, key: IDBValidKey): Promise<void> {
  await tx(store, 'readwrite', (s) => s.delete(key))
}

/** 取全表 */
export async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDB()
  return reqToPromise(db.transaction(store, 'readonly').objectStore(store).getAll() as IDBRequest<T[]>)
}

/** 按索引取多条（等值匹配） */
export async function getAllByIndex<T>(
  store: StoreName,
  indexName: string,
  value: IDBValidKey | IDBValidKey[],
): Promise<T[]> {
  const db = await openDB()
  const idx = db.transaction(store, 'readonly').objectStore(store).index(indexName)
  return reqToPromise(idx.getAll(value) as IDBRequest<T[]>)
}

/** 清空一张表 */
export async function clearStore(store: StoreName): Promise<void> {
  await tx(store, 'readwrite', (s) => s.clear())
}

/** 表记录数 */
export async function count(store: StoreName): Promise<number> {
  const db = await openDB()
  return reqToPromise(db.transaction(store, 'readonly').objectStore(store).count())
}

// ---------- 按科目级联删除 ----------
/**
 * 删除指定科目在某张表中的全部记录（按 subject_id 索引）
 * 用于删除科目时级联清理关联数据
 */
export async function clearBySubject(store: StoreName, subjectId: string): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(store, 'readwrite')
    const objectStore = transaction.objectStore(store)
    const idx = objectStore.index('subject_id')
    const cursorReq = idx.openCursor(IDBKeyRange.only(subjectId))
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result
      if (cursor) {
        cursor.delete()
        cursor.continue()
      }
    }
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

/**
 * 删除科目及其所有关联数据
 * 顺序清理：materials / chunks / vectors / chatSessions / quizSessions / wrongQuestions / reviewDocs / subjects
 */
export async function deleteSubjectCascade(subjectId: string): Promise<void> {
  const stores: StoreName[] = [
    'materials',
    'chunks',
    'vectors',
    'chatSessions',
    'quizSessions',
    'wrongQuestions',
    'reviewDocs',
  ]
  for (const s of stores) {
    try {
      await clearBySubject(s, subjectId)
    } catch {
      // 部分表可能无 subject_id 索引（如 cache），忽略
    }
  }
  await del('subjects', subjectId)
}

// ---------- 按 materialId 级联 ----------
/** 删除某份资料的分块与向量 */
export async function deleteMaterialCascade(materialId: string): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(['chunks', 'vectors'], 'readwrite')
    const chunksStore = transaction.objectStore('chunks')
    const vectorsStore = transaction.objectStore('vectors')
    // chunks 按 materialId 索引删除
    const chunkCursor = chunksStore.index('material_id').openCursor(IDBKeyRange.only(materialId))
    chunkCursor.onsuccess = () => {
      const c = chunkCursor.result
      if (c) {
        c.delete()
        c.continue()
      }
    }
    // vectors：需要遍历，因为没建 material_id 索引
    const vectorCursor = vectorsStore.openCursor()
    vectorCursor.onsuccess = () => {
      const c = vectorCursor.result
      if (c) {
        const v = c.value as { chunkId: string; materialId?: string }
        if (v.materialId === materialId) c.delete()
        c.continue()
      }
    }
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

// ---------- 缓存表：TTL 与清理 ----------
export interface CacheEntry<T = unknown> {
  key: string
  value: T
  createdAt: number
  expiresAt: number // 0 表示永不过期
}

/** 写入缓存（毫秒级 TTL，0 = 永久） */
export async function cacheSet<T>(key: string, value: T, ttlMs: number = 0): Promise<void> {
  const entry: CacheEntry<T> = {
    key,
    value,
    createdAt: Date.now(),
    expiresAt: ttlMs > 0 ? Date.now() + ttlMs : 0,
  }
  await put('cache', entry)
}

/** 读取缓存（过期则删除并返回 undefined） */
export async function cacheGet<T>(key: string): Promise<T | undefined> {
  const entry = await get<CacheEntry<T>>('cache', key)
  if (!entry) return undefined
  if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
    await del('cache', key)
    return undefined
  }
  return entry.value
}

/** 删除单个缓存 */
export async function cacheDelete(key: string): Promise<void> {
  await del('cache', key)
}

/** 清理所有过期缓存，返回清理条数 */
export async function clearExpiredCache(): Promise<number> {
  const db = await openDB()
  return new Promise<number>((resolve, reject) => {
    let cleared = 0
    const transaction = db.transaction('cache', 'readwrite')
    const idx = transaction.objectStore('cache').index('expires_at')
    const range = IDBKeyRange.upperBound(Date.now())
    const cursorReq = idx.openCursor(range)
    cursorReq.onsuccess = () => {
      const c = cursorReq.result
      if (c) {
        // 仅清理 expiresAt > 0 的过期项，永久缓存跳过
        const v = c.value as CacheEntry
        if (v.expiresAt > 0) {
          c.delete()
          cleared++
        }
        c.continue()
      }
    }
    transaction.oncomplete = () => resolve(cleared)
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

// ---------- 缓存清理：按类型 ----------
export type ClearCacheType = 'chunks' | 'index' | 'chats' | 'all' | 'parse'

/** 按类型清理缓存（对接 ElectronAPI.clearCache） */
export async function clearCacheByType(types: string[]): Promise<void> {
  for (const t of types) {
    if (t === 'all') {
      // 全部清空：保留 subjects 表（科目元数据）
      await clearStore('chunks')
      await clearStore('vectors')
      await clearStore('chatSessions')
      await clearStore('cache')
    } else if (t === 'chunks') {
      // 资料正文：清掉 chunks + materials 的 text_content + vectors
      const materials = await getAll<Material>('materials')
      for (const m of materials) {
        m.text_content = ''
        m.status = 'pending'
      }
      await bulkPut('materials', materials)
      await clearStore('chunks')
      await clearStore('vectors')
    } else if (t === 'index') {
      // 检索索引：chunks + vectors（保留 materials 正文）
      await clearStore('chunks')
      await clearStore('vectors')
    } else if (t === 'chats') {
      await clearStore('chatSessions')
    } else if (t === 'parse') {
      // 解析哈希缓存：清掉 cache 表中以 parse: 开头的条目
      await clearCacheByPrefix('parse:')
    }
  }
}

/** 删除 key 以指定前缀开头的缓存 */
async function clearCacheByPrefix(prefix: string): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('cache', 'readwrite')
    const store = transaction.objectStore('cache')
    const cursorReq = store.openCursor()
    cursorReq.onsuccess = () => {
      const c = cursorReq.result
      if (c) {
        const entry = c.value as CacheEntry
        if (entry.key.startsWith(prefix)) c.delete()
        c.continue()
      }
    }
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

// ---------- 存储占用统计 ----------
export interface StorageStats {
  quota: number | undefined
  usage: number | undefined
  tables: { name: StoreName; count: number }[]
}

/** 估算各表记录数 + Navigator.storage 配额 */
export async function getStorageStats(): Promise<StorageStats> {
  const tables: { name: StoreName; count: number }[] = []
  for (const s of STORES) {
    try {
      const c = await count(s)
      tables.push({ name: s, count: c })
    } catch {
      tables.push({ name: s, count: 0 })
    }
  }
  let quota: number | undefined
  let usage: number | undefined
  if (navigator.storage?.estimate) {
    try {
      const est = await navigator.storage.estimate()
      quota = est.quota
      usage = est.usage
    } catch {
      // 忽略
    }
  }
  return { quota, usage, tables }
}
