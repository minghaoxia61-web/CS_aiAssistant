// Web 版 HTTP 适配器：实现 ElectronAPI 接口，用 fetch/SSE 替代 IPC
// 在 VITE_WEB_MODE=true 时由 api-mock.ts 安装到 window.api
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
  LlmStreamOptions,
  LlmTokenEvent,
  LlmDoneEvent,
  LlmErrorEvent,
  UserProfile,
  TaskProgress,
} from '@/shared/types'

const API_BASE = ''

// 用户隔离：从 localStorage 获取或生成唯一用户 ID
function getUserId(): string {
  let id = localStorage.getItem('cs_user_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('cs_user_id', id)
  }
  return id
}

/** 为请求添加 X-User-Id 头 */
function withUserHeaders(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers)
  headers.set('X-User-Id', getUserId())
  return { ...init, headers }
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, withUserHeaders(init))
  return res.json() as Promise<T>
}

// ========== 文件上传：假 path 映射 ==========
const fileStore = new Map<string, File>()

function generateFakePath(file: File): string {
  const id = crypto.randomUUID()
  const fakePath = `web://${id}/${file.name}`
  fileStore.set(fakePath, file)
  return fakePath
}

// capture-phase drop 监听器：拖拽时注入假 path（Library.tsx 读取 file.path）
if (typeof document !== 'undefined') {
  document.addEventListener(
    'drop',
    (e) => {
      const files = e.dataTransfer?.files
      if (!files) return
      for (const f of Array.from(files)) {
        if (!(f as File & { path?: string }).path) {
          Object.defineProperty(f, 'path', {
            value: generateFakePath(f),
            configurable: true,
          })
        }
      }
    },
    { capture: true },
  )
}

// ========== LLM 流式：回调注册 ==========
const tokenCallbacks = new Set<(p: LlmTokenEvent) => void>()
const doneCallbacks = new Set<(p: LlmDoneEvent) => void>()
const errorCallbacks = new Set<(p: LlmErrorEvent) => void>()
const abortControllers = new Map<string, AbortController>()

// ========== Material 更新：SSE 订阅 ==========
const materialCallbacks = new Set<(p: { id: string; status: string; filetype?: string }) => void>()
let eventSource: EventSource | null = null

function ensureEventSource(): void {
  if (eventSource) return
  eventSource = new EventSource(`${API_BASE}/api/events`)
  eventSource.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data)
      if (data.type === 'material:updated') {
        for (const cb of materialCallbacks) {
          cb({ id: data.id, status: data.status, filetype: data.filetype })
        }
      }
    } catch {
      // 忽略解析错误
    }
  }
}

export function createHttpApi(): ElectronAPI {
  return {
    // ---------- 配置 ----------
    async getConfig() {
      return json<ApiConfig>('/api/config')
    },
    async saveConfig(cfg) {
      await json('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      })
      return true
    },
    async listConfigs() {
      return json<ApiConfigItem[]>('/api/configs')
    },
    async saveConfigItem(item) {
      return json<ApiConfigItem>('/api/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      })
    },
    async deleteConfigItem(id) {
      await json(`/api/configs/${id}`, { method: 'DELETE' })
      return true
    },
    async setActiveConfig(id) {
      return json<ApiConfig>(`/api/configs/${id}/active`, { method: 'POST' })
    },

    // ---------- 用户信息 ----------
    async getProfile() {
      return json<UserProfile>('/api/profile')
    },
    async saveProfile(profile) {
      await json('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      })
      return true
    },

    // ---------- 科目 ----------
    async listSubjects() {
      return json<Subject[]>('/api/subjects')
    },
    async createSubject(name, color) {
      return json<Subject>('/api/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      })
    },
    async deleteSubject(id) {
      await json(`/api/subjects/${id}`, { method: 'DELETE' })
      return true
    },

    // ---------- 资料 ----------
    async uploadMaterials(subjectId, filePaths) {
      const formData = new FormData()
      let hasFiles = false
      for (const p of filePaths) {
        const file = fileStore.get(p)
        if (file) {
          formData.append('files[]', file, file.name)
          fileStore.delete(p)
          hasFiles = true
        }
      }
      if (!hasFiles) return []
      const res = await fetch(`${API_BASE}/api/subjects/${subjectId}/materials`, withUserHeaders({
        method: 'POST',
        body: formData,
      }))
      return res.json() as Promise<Material[]>
    },
    async getMaterials(subjectId) {
      return json<Material[]>(`/api/subjects/${subjectId}/materials`)
    },
    async updateMaterial(id, patch) {
      await json(`/api/materials/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      return true
    },
    async deleteMaterial(id) {
      await json(`/api/materials/${id}`, { method: 'DELETE' })
      return true
    },
    onMaterialUpdated(cb) {
      ensureEventSource()
      materialCallbacks.add(cb)
      return () => {
        materialCallbacks.delete(cb)
      }
    },

    // ---------- 对话 ----------
    async listChatSessions(subjectId) {
      return json<ChatSession[]>(`/api/subjects/${subjectId}/chats`)
    },
    async saveChatSession(session) {
      await json('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(session),
      })
      return true
    },
    async deleteChatSession(id) {
      await json(`/api/chats/${id}`, { method: 'DELETE' })
      return true
    },

    // ---------- 复习资料 ----------
    async saveReviewDoc(doc) {
      await json('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(doc),
      })
      return true
    },
    async listReviewDocs(subjectId) {
      return json<ReviewDoc[]>(`/api/subjects/${subjectId}/reviews`)
    },
    async deleteReviewDoc(id) {
      await json(`/api/reviews/${id}`, { method: 'DELETE' })
      return true
    },

    // ---------- 测验 ----------
    async saveQuizSession(session) {
      await json('/api/quizzes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(session),
      })
      return true
    },
    async listQuizSessions(subjectId) {
      return json<QuizSession[]>(`/api/subjects/${subjectId}/quizzes`)
    },
    async deleteQuizSession(id) {
      await json(`/api/quizzes/${id}`, { method: 'DELETE' })
      return true
    },

    // ---------- 错题本 ----------
    async listWrongQuestions(subjectId) {
      const query = subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : ''
      return json<WrongQuestion[]>(`/api/wrong-questions${query}`)
    },
    async addWrongQuestion(wq) {
      await json('/api/wrong-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(wq),
      })
      return true
    },
    async deleteWrongQuestion(id) {
      await json(`/api/wrong-questions/${id}`, { method: 'DELETE' })
      return true
    },
    async markWrongReviewed(id, reviewed) {
      await json(`/api/wrong-questions/${id}/reviewed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewed }),
      })
      return true
    },
    async generateWrongQuiz(subjectId, count) {
      return json<WrongQuestion[]>(`/api/subjects/${subjectId}/wrong-quiz?count=${count}`)
    },

    // ---------- LLM 流式 ----------
    async llmStream(opts: LlmStreamOptions) {
      const requestId = crypto.randomUUID()
      const controller = new AbortController()
      abortControllers.set(requestId, controller)

      // 异步读取 SSE，不阻塞 requestId 返回
      fetch(`${API_BASE}/api/llm/stream`, withUserHeaders({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...opts, requestId }),
        signal: controller.signal,
      }))
        .then(async (res) => {
          const reader = res.body!.getReader()
          const decoder = new TextDecoder()
          let buffer = ''
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''
            for (const line of lines) {
              if (!line.startsWith('data:')) continue
              try {
                const evt = JSON.parse(line.slice(5).trim())
                if (evt.type === 'token') {
                  for (const cb of tokenCallbacks) {
                    cb({ requestId: evt.requestId, token: evt.token })
                  }
                } else if (evt.type === 'done') {
                  for (const cb of doneCallbacks) {
                    cb({ requestId: evt.requestId, full: evt.full })
                  }
                  abortControllers.delete(evt.requestId)
                } else if (evt.type === 'error') {
                  for (const cb of errorCallbacks) {
                    cb({ requestId: evt.requestId, message: evt.message })
                  }
                  abortControllers.delete(evt.requestId)
                }
              } catch {
                // 忽略不完整 JSON
              }
            }
          }
        })
        .catch((e) => {
          if (e.name !== 'AbortError') {
            for (const cb of errorCallbacks) {
              cb({ requestId, message: e.message })
            }
          }
          abortControllers.delete(requestId)
        })

      return requestId
    },
    async llmAbort(requestId) {
      const controller = abortControllers.get(requestId)
      if (controller) {
        controller.abort()
        abortControllers.delete(requestId)
      }
      // 通知服务端中止
      fetch(`${API_BASE}/api/llm/abort/${requestId}`, { method: 'POST' }).catch(() => {})
      return true
    },
    async llmJSON(opts) {
      const res = await fetch(`${API_BASE}/api/llm/json`, withUserHeaders({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts),
      }))
      return res.json()
    },
    onLlmToken(cb) {
      tokenCallbacks.add(cb)
      return () => {
        tokenCallbacks.delete(cb)
      }
    },
    onLlmDone(cb) {
      doneCallbacks.add(cb)
      return () => {
        doneCallbacks.delete(cb)
      }
    },
    onLlmError(cb) {
      errorCallbacks.add(cb)
      return () => {
        errorCallbacks.delete(cb)
      }
    },

    // ---------- 异步任务队列（前端未调用，no-op） ----------
    async parseBatch() {
      return 'no-op'
    },
    onTaskProgress(_cb: (progress: TaskProgress) => void) {
      void _cb
      return () => {}
    },
    async cancelTask() {
      return
    },
    async clearParseCache() {
      await fetch(`${API_BASE}/api/parse-cache`, { method: 'DELETE' })
    },

    // ---------- 检索索引缓存 ----------
    async saveSubjectIndex(subjectId, indexData) {
      await json(`/api/subjects/${subjectId}/index`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(indexData),
      })
      return true
    },
    async loadSubjectIndex(subjectId) {
      const res = await fetch(`${API_BASE}/api/subjects/${subjectId}/index`)
      const data = await res.json()
      return data || undefined
    },

    // ---------- 缓存清理 ----------
    async clearCache(types) {
      await json('/api/cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ types }),
      })
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
          resolve(files.map(generateFakePath))
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
