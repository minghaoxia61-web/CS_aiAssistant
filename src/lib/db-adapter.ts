// IndexedDB 适配器：实现 ElectronAPI 接口，数据存浏览器 IndexedDB
// LLM 调用委托给 api-http.ts（HTTP → 服务端 → LLM API），API key 不暴露给前端
// 文件解析走 /api/parse（服务端无状态解析代理），阶段 2 将替换为 Web Worker
import type { ElectronAPI } from '@/global.d'
import type {
  ApiConfig,
  ApiConfigItem,
  Subject,
  Material,
  ChatSession,
  ReviewDoc,
  QuizSession,
  WrongQuestion,
  UserProfile,
  TaskProgress,
} from '@/shared/types'
import { createHttpApi } from './api-http'
import { submitParseTask, cancelAllTasks } from './worker-pool'
import {
  openDB,
  put,
  bulkPut,
  get,
  getAll,
  getAllByIndex,
  del,
  count,
  clearBySubject,
  deleteSubjectCascade,
  deleteMaterialCascade,
  clearCacheByType,
  clearExpiredCache,
  cacheGet,
  cacheSet,
  type StoreName,
} from './db'

// ---------- 内部状态 ----------
const httpApi = createHttpApi() // LLM 委托

// 文件假路径映射（与 api-http.ts 一致，由 drop 监听器注入）
const fileStore = new Map<string, File>()

// material:updated 事件回调（替代服务端 SSE）
const materialCallbacks = new Set<(p: { id: string; status: string; filetype?: string }) => void>()

function emitMaterialUpdated(p: { id: string; status: string; filetype?: string }) {
  for (const cb of materialCallbacks) cb(p)
}

// 任务进度回调（批量上传）
const taskProgressCallbacks = new Set<(p: TaskProgress) => void>()
function emitTaskProgress(p: TaskProgress) {
  for (const cb of taskProgressCallbacks) cb(p)
}

// 可取消的任务映射
const cancellableTasks = new Map<string, { cancelled: boolean }>()

// ---------- 配置存储（cache 表） ----------
const CONFIG_KEY = 'config:active'
const CONFIG_LIST_KEY = 'config:list'

// ---------- 默认配置 ----------
const DEFAULT_CONFIG: ApiConfig = {
  baseUrl: 'https://api.deepseek.com',
  apiKey: '',
  model: 'deepseek-v4-flash',
  temperature: 0.7,
  maxTokens: 0,
  topP: 1,
}

// ---------- 科目知识库种子（首次启动从服务端拉取并注入 IndexedDB） ----------
const SEED_SUBJECT_ID = '__knowledge_base__'

interface KnowledgeArticle {
  slug: string
  category: string
  categoryName: string
  title: string
  order: number
  content: string
}

async function seedKnowledgeBaseIfNeeded(): Promise<void> {
  const existing = await get<Subject>('subjects', SEED_SUBJECT_ID)
  if (existing) {
    // 科目已存在，检查是否需要补充文章（用户清理缓存后重建）
    const materials = await getAllByIndex<Material>('materials', 'subject_id', SEED_SUBJECT_ID)
    if (materials.length > 0) return // 已有文章，跳过
  } else {
    // 创建科目
    const seed: Subject = {
      id: SEED_SUBJECT_ID,
      name: '计算机知识库',
      color: '#4a9eff',
      created_at: Date.now(),
    }
    await put('subjects', seed)
  }

  // 从服务端拉取知识库文章
  try {
    const res = await fetch('/api/knowledge')
    if (!res.ok) return
    const articles: KnowledgeArticle[] = await res.json()
    const materials: Material[] = articles.map((a) => ({
      id: crypto.randomUUID(),
      subject_id: SEED_SUBJECT_ID,
      filename: `${a.title}.md`,
      filetype: 'md',
      size: a.content.length,
      status: 'ready' as const,
      text_content: a.content,
      created_at: Date.now(),
      tag: 'lecture' as const,
    }))
    await bulkPut('materials', materials)
  } catch {
    // 拉取失败不影响主流程，下次启动会重试
  }
}

// ---------- 创建适配器 ----------
export async function createDbApi(): Promise<ElectronAPI> {
  // 确保 DB 已打开 + 知识库种子注入
  await openDB()
  // 清理过期缓存（不阻塞主流程）
  clearExpiredCache().catch(() => {})
  await seedKnowledgeBaseIfNeeded()

  return {
    // ---------- 配置 ----------
    async getConfig() {
      const cfg = await cacheGet<ApiConfig>(CONFIG_KEY)
      return cfg || { ...DEFAULT_CONFIG }
    },
    async saveConfig(cfg) {
      await cacheSet(CONFIG_KEY, cfg)
      return true
    },
    async listConfigs() {
      const list = await cacheGet<ApiConfigItem[]>(CONFIG_LIST_KEY)
      return list || []
    },
    async saveConfigItem(item) {
      const list = (await cacheGet<ApiConfigItem[]>(CONFIG_LIST_KEY)) || []
      if (item.id) {
        // 更新已有
        const idx = list.findIndex((c) => c.id === item.id)
        if (idx >= 0) {
          list[idx] = { ...list[idx], ...item } as ApiConfigItem
        } else {
          list.push({ ...item, id: item.id } as ApiConfigItem)
        }
      } else {
        // 新建
        const newItem: ApiConfigItem = {
          ...(item as ApiConfig),
          id: crypto.randomUUID(),
          name: item.name || '未命名配置',
          createdAt: Date.now(),
        }
        list.push(newItem)
        // 若是第一个配置，自动设为激活
        if (list.length === 1) {
          await cacheSet(CONFIG_KEY, { ...newItem })
        }
      }
      await cacheSet(CONFIG_LIST_KEY, list)
      // 返回保存的项
      const saved = item.id
        ? list.find((c) => c.id === item.id)!
        : list[list.length - 1]
      return saved
    },
    async deleteConfigItem(id) {
      const list = (await cacheGet<ApiConfigItem[]>(CONFIG_LIST_KEY)) || []
      const filtered = list.filter((c) => c.id !== id)
      await cacheSet(CONFIG_LIST_KEY, filtered)
      // 若删除的是当前激活配置，切到第一个
      const active = await cacheGet<ApiConfig>(CONFIG_KEY)
      if (active && list.find((c) => c.id === id)) {
        const isActive = list.find((c) => c.id === id && c.baseUrl === active.baseUrl && c.apiKey === active.apiKey && c.model === active.model)
        if (isActive && filtered.length > 0) {
          await cacheSet(CONFIG_KEY, { ...filtered[0] })
        } else if (isActive) {
          await cacheSet(CONFIG_KEY, { ...DEFAULT_CONFIG })
        }
      }
      return true
    },
    async setActiveConfig(id) {
      const list = (await cacheGet<ApiConfigItem[]>(CONFIG_LIST_KEY)) || []
      const found = list.find((c) => c.id === id)
      if (found) {
        const { id: _id, name: _name, createdAt: _createdAt, ...cfg } = found
        void _id; void _name; void _createdAt
        await cacheSet(CONFIG_KEY, cfg)
        return cfg
      }
      return await cacheGet<ApiConfig>(CONFIG_KEY) || { ...DEFAULT_CONFIG }
    },

    // ---------- 用户信息 ----------
    async getProfile() {
      const p = await cacheGet<UserProfile>('profile')
      return p || { nickname: '', grade: '', goal: '', weakAreas: '', preferredStyle: '' }
    },
    async saveProfile(profile) {
      await cacheSet('profile', profile)
      return true
    },

    // ---------- 科目 ----------
    async listSubjects() {
      const all = await getAll<Subject>('subjects')
      all.sort((a, b) => b.created_at - a.created_at)
      return all
    },
    async createSubject(name, color) {
      const sub: Subject = {
        id: crypto.randomUUID(),
        name,
        color,
        created_at: Date.now(),
      }
      await put('subjects', sub)
      return sub
    },
    async deleteSubject(id) {
      if (id === SEED_SUBJECT_ID) return true // 知识库不可删除
      await deleteSubjectCascade(id)
      return true
    },

    // ---------- 资料 ----------
    async uploadMaterials(subjectId, filePaths) {
      // 收集 File 对象
      const files: File[] = []
      for (const p of filePaths) {
        const f = fileStore.get(p)
        if (f) {
          files.push(f)
          fileStore.delete(p)
        }
      }
      if (files.length === 0) return []

      // 立即创建 parsing 状态记录并返回
      const created: Material[] = files.map((f) => ({
        id: crypto.randomUUID(),
        subject_id: subjectId,
        filename: f.name,
        filetype: f.name.split('.').pop() || 'unknown',
        size: f.size,
        status: 'parsing' as const,
        text_content: '',
        created_at: Date.now(),
      }))
      await bulkPut('materials', created)

      // 异步解析：逐个提交到 Web Worker 池（并发受限，避免内存爆满）
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const material = created[i]
        submitParseTask(file)
          .then(async (result) => {
            const updated: Material = {
              ...material,
              status: 'ready',
              text_content: result.text,
              filetype: result.filetype,
            }
            await put('materials', updated)
            emitMaterialUpdated({ id: material.id, status: 'ready', filetype: result.filetype })
          })
          .catch(async (err) => {
            if ((err as Error).name === 'AbortError') return // 取消的不更新
            const updated = { ...material, status: 'failed' as const }
            await put('materials', updated)
            emitMaterialUpdated({ id: material.id, status: 'failed' })
          })
      }

      return created
    },
    async getMaterials(subjectId) {
      const list = await getAllByIndex<Material>('materials', 'subject_id', subjectId)
      list.sort((a, b) => b.created_at - a.created_at)
      return list
    },
    async updateMaterial(id, patch) {
      const m = await get<Material>('materials', id)
      if (m) {
        await put('materials', { ...m, ...patch })
      }
      return true
    },
    async deleteMaterial(id) {
      await deleteMaterialCascade(id)
      await del('materials', id)
      return true
    },
    onMaterialUpdated(cb) {
      materialCallbacks.add(cb)
      return () => {
        materialCallbacks.delete(cb)
      }
    },

    // ---------- 对话 ----------
    async listChatSessions(subjectId) {
      const list = await getAllByIndex<ChatSession>('chatSessions', 'subject_id', subjectId)
      list.sort((a, b) => b.created_at - a.created_at)
      return list
    },
    async saveChatSession(session) {
      await put('chatSessions', session)
      return true
    },
    async deleteChatSession(id) {
      await del('chatSessions', id)
      return true
    },

    // ---------- 复习资料 ----------
    async saveReviewDoc(doc) {
      await put('reviewDocs', doc)
      return true
    },
    async listReviewDocs(subjectId) {
      const list = await getAllByIndex<ReviewDoc>('reviewDocs', 'subject_id', subjectId)
      list.sort((a, b) => b.created_at - a.created_at)
      return list
    },
    async deleteReviewDoc(id) {
      await del('reviewDocs', id)
      return true
    },

    // ---------- 测验 ----------
    async saveQuizSession(session) {
      await put('quizSessions', session)
      return true
    },
    async listQuizSessions(subjectId) {
      const list = await getAllByIndex<QuizSession>('quizSessions', 'subject_id', subjectId)
      list.sort((a, b) => b.created_at - a.created_at)
      return list
    },
    async deleteQuizSession(id) {
      await del('quizSessions', id)
      return true
    },

    // ---------- 错题本 ----------
    async listWrongQuestions(subjectId) {
      if (subjectId) {
        return getAllByIndex<WrongQuestion>('wrongQuestions', 'subject_id', subjectId)
      }
      return getAll<WrongQuestion>('wrongQuestions')
    },
    async addWrongQuestion(wq) {
      await put('wrongQuestions', wq)
      return true
    },
    async deleteWrongQuestion(id) {
      await del('wrongQuestions', id)
      return true
    },
    async markWrongReviewed(id, reviewed) {
      const wq = await get<WrongQuestion>('wrongQuestions', id)
      if (wq) {
        await put('wrongQuestions', { ...wq, reviewed, review_count: wq.review_count + 1 })
      }
      return true
    },
    async generateWrongQuiz(subjectId, count) {
      // 从该科目错题中随机抽取 count 道未复习的
      const all = await getAllByIndex<WrongQuestion>('wrongQuestions', 'subject_id', subjectId)
      const candidates = all.filter((w) => !w.reviewed)
      // 洗牌取前 count 个
      const shuffled = [...candidates].sort(() => Math.random() - 0.5)
      return shuffled.slice(0, count)
    },

    // ---------- LLM 流式（委托 HTTP 适配器） ----------
    llmStream: httpApi.llmStream,
    llmAbort: httpApi.llmAbort,
    llmJSON: httpApi.llmJSON,
    onLlmToken: httpApi.onLlmToken,
    onLlmDone: httpApi.onLlmDone,
    onLlmError: httpApi.onLlmError,

    // ---------- 异步任务队列（批量解析） ----------
    async parseBatch(files) {
      const taskId = crypto.randomUUID()
      const task = { cancelled: false }
      cancellableTasks.set(taskId, task)

      // 异步执行批量解析
      ;(async () => {
        const total = files.length
        emitTaskProgress({
          taskId,
          type: 'parse',
          status: 'running',
          current: 0,
          total,
          message: `开始解析 ${total} 个文件`,
        })

        let current = 0
        for (const f of files) {
          if (task.cancelled) {
            emitTaskProgress({ taskId, type: 'parse', status: 'cancelled', current, total, message: '已取消' })
            return
          }
          try {
            // 通过 /api/parse 解析单个文件
            const file = fileStore.get(f.path)
            if (!file) {
              current++
              continue
            }
            fileStore.delete(f.path)
            const formData = new FormData()
            formData.append('files[]', file, file.name)
            const userId = localStorage.getItem('cs_user_id') || ''
            const res = await fetch('/api/parse', {
              method: 'POST',
              headers: { 'X-User-Id': userId },
              body: formData,
            })
            const results = await res.json()
            current++
            emitTaskProgress({
              taskId,
              type: 'parse',
              status: 'running',
              current,
              total,
              message: `已解析 ${file.name}`,
              result: results[0],
            })
          } catch (e) {
            current++
            emitTaskProgress({
              taskId,
              type: 'parse',
              status: 'running',
              current,
              total,
              message: `解析失败: ${(e as Error).message}`,
            })
          }
        }
        emitTaskProgress({ taskId, type: 'parse', status: 'done', current, total, message: '全部完成' })
        cancellableTasks.delete(taskId)
      })()

      return taskId
    },
    onTaskProgress(cb) {
      taskProgressCallbacks.add(cb)
      return () => {
        taskProgressCallbacks.delete(cb)
      }
    },
    async cancelTask(taskId) {
      const task = cancellableTasks.get(taskId)
      if (task) task.cancelled = true
    },
    async clearParseCache() {
      // 清掉 cache 表中以 parse: 开头的条目
      const db = await openDB()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('cache', 'readwrite')
        const store = tx.objectStore('cache')
        const cursorReq = store.openCursor()
        cursorReq.onsuccess = () => {
          const c = cursorReq.result
          if (c) {
            const entry = c.value as { key: string }
            if (entry.key.startsWith('parse:')) c.delete()
            c.continue()
          }
        }
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      })
    },

    // ---------- 检索索引持久化缓存 ----------
    async saveSubjectIndex(subjectId, indexData) {
      const data = indexData as {
        subjectId: string
        built_at: number
        materialSignatures: Record<string, number>
        chunks: Array<{ materialId: string; materialName: string; text: string; tokens: number; index: number; subjectId?: string }>
      }
      // 先清掉该科目的旧分块与陈旧向量（分块重建后 chunkId 可能变化，向量需重新计算）
      await clearBySubject('chunks', subjectId)
      await clearBySubject('vectors', subjectId)
      // 写入新分块（id = materialId:index 保证唯一）
      const chunksWithId = data.chunks.map((c) => ({
        id: `${c.materialId}:${c.index}`,
        ...c,
      }))
      await bulkPut('chunks', chunksWithId)
      // 元数据存 cache 表
      await cacheSet(`index:${subjectId}`, {
        subjectId,
        built_at: data.built_at,
        materialSignatures: data.materialSignatures,
      })
      return true
    },
    async loadSubjectIndex(subjectId) {
      const meta = await cacheGet<{ subjectId: string; built_at: number; materialSignatures: Record<string, number> }>(
        `index:${subjectId}`,
      )
      if (!meta) return undefined
      const chunks = await getAllByIndex<{
        id: string
        materialId: string
        materialName: string
        text: string
        tokens: number
        index: number
        subjectId?: string
      }>('chunks', 'subject_id', subjectId)
      // 去掉内部 id 字段，还原为 Chunk 结构
      const cleanChunks = chunks.map(({ id: _id, ...rest }) => {
        void _id
        return rest
      })
      return {
        subjectId: meta.subjectId,
        built_at: meta.built_at,
        materialSignatures: meta.materialSignatures,
        chunks: cleanChunks,
      }
    },

    // ---------- 缓存清理 ----------
    async clearCache(types) {
      await clearCacheByType(types)
      return true
    },

    // ---------- 系统 ----------
    async pickFiles() {
      return new Promise<string[]>((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.multiple = true
        input.accept = '.pdf,.docx,.pptx,.txt,.md,.jpg,.jpeg,.png'
        input.onchange = () => {
          const files = Array.from(input.files || [])
          const paths: string[] = []
          for (const f of files) {
            const id = crypto.randomUUID()
            const fakePath = `web://${id}/${f.name}`
            fileStore.set(fakePath, f)
            paths.push(fakePath)
          }
          resolve(paths)
        }
        input.click()
      })
    },
    async openExternal(url) {
      window.open(url, '_blank')
      return true
    },
  }
}

// ---------- 暴露 fileStore 给 drop 监听器（与 api-http.ts 一致） ----------
// drop 监听器在 capture 阶段注入假 path，这里注册同样的逻辑
if (typeof document !== 'undefined') {
  document.addEventListener(
    'drop',
    (e) => {
      const files = e.dataTransfer?.files
      if (!files) return
      for (const f of Array.from(files)) {
        if (!(f as File & { path?: string }).path) {
          const id = crypto.randomUUID()
          const fakePath = `web://${id}/${f.name}`
          fileStore.set(fakePath, f)
          Object.defineProperty(f, 'path', {
            value: fakePath,
            configurable: true,
          })
        }
      }
    },
    { capture: true },
  )
}

// 暴露给 api-mock.ts 用于检查 IndexedDB 是否可用
export function isIndexedDBAvailable(): boolean {
  return typeof indexedDB !== 'undefined'
}

// 表记录数（供 Setup 页面展示）
export async function getTableCount(store: StoreName): Promise<number> {
  return count(store)
}
