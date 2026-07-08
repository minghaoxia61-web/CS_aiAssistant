// 浏览器预览环境下的 window.api mock（Electron 中 window.api 已存在，跳过）
// 仅用于在普通浏览器中预览 UI，数据为空且不可持久化
import type { ElectronAPI } from '@/global.d'
import type { ApiConfig, ApiConfigItem, Subject, Material, ChatSession, ReviewDoc, QuizSession, LlmStreamOptions, LlmTokenEvent, LlmDoneEvent, LlmErrorEvent, UserProfile, TaskProgress } from '@/shared/types'
import { createHttpApi } from './api-http'
import { createDbApi, isIndexedDBAvailable } from './db-adapter'

const DEFAULT_CONFIG: ApiConfig = {
  baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  apiKey: '',
  model: 'glm-4-flash-250414',
  temperature: 0.7,
  maxTokens: 0,
  topP: 1,
}

const LS_KEY = 'cs-ai-tutor-preview'

// ---------- 延迟代理：在 createDbApi() 异步初始化完成前排队的调用 ----------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let realApi: ElectronAPI | null = null
const pendingCalls: Array<() => void> = []

function makeLazyApi(): ElectronAPI {
  // 用 Proxy 拦截所有方法调用，realApi 就绪前排队，就绪后直接转发
  return new Proxy({} as ElectronAPI, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get(_target, prop: string) {
      if (realApi) return (realApi as any)[prop]
      // on* 方法返回同步退订函数，需特殊处理
      if (prop.startsWith('on')) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (cb: any) => {
          let realUnsub: (() => void) | null = null
          pendingCalls.push(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            realUnsub = (realApi as any)[prop](cb)
          })
          return () => {
            if (realUnsub) realUnsub()
          }
        }
      }
      // 其余方法返回 Promise，等 realApi 就绪后执行
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (...args: any[]) => {
        return new Promise((resolve, reject) => {
          pendingCalls.push(() => {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              Promise.resolve((realApi as any)[prop](...args)).then(resolve, reject)
            } catch (e) {
              reject(e)
            }
          })
        })
      }
    },
  })
}

function loadState(): {
  subjects: Subject[]
  materials: Material[]
  chats: ChatSession[]
  reviews: ReviewDoc[]
  quizzes: QuizSession[]
  config: ApiConfig
  profile?: UserProfile
} {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return { subjects: [], materials: [], chats: [], reviews: [], quizzes: [], config: DEFAULT_CONFIG }
}

function saveState(s: ReturnType<typeof loadState>) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

export function installMockIfNeeded() {
  if (typeof window !== 'undefined' && (window as { api?: ElectronAPI }).api) return

  // Web 部署模式：优先安装 IndexedDB 适配器（数据存浏览器，服务端仅做解析+LLM 代理）
  // 注意：Vite define 用 JSON.stringify 注入的是布尔值 true，不是字符串 'true'
  if (import.meta.env.VITE_WEB_MODE === true || import.meta.env.VITE_WEB_MODE === 'true') {
    if (isIndexedDBAvailable()) {
      // 先安装延迟代理，createDbApi() 完成后切换到真实适配器
      const lazy = makeLazyApi()
      ;(window as { api?: ElectronAPI }).api = lazy
      createDbApi()
        .then((api) => {
          realApi = api
          // 执行所有排队的调用
          const calls = pendingCalls.splice(0)
          for (const call of calls) call()
        })
        .catch((err) => {
          // IndexedDB 初始化失败：降级到 HTTP 适配器
          console.error('IndexedDB 初始化失败，降级到 HTTP 适配器:', err)
          const http = createHttpApi()
          realApi = http
          const calls = pendingCalls.splice(0)
          for (const call of calls) call()
        })
      return
    }
    // IndexedDB 不可用：直接用 HTTP 适配器
    ;(window as { api?: ElectronAPI }).api = createHttpApi()
    return
  }

  const mock: ElectronAPI = {
    async getConfig() {
      return loadState().config
    },
    async saveConfig(cfg) {
      const s = loadState()
      s.config = cfg
      saveState(s)
      return true
    },
    // 多配置 mock
    async listConfigs() {
      const s = loadState()
      if (s.config.apiKey) {
        return [{ ...s.config, id: 'mock-1', name: '预览配置', createdAt: Date.now() } as ApiConfigItem]
      }
      return []
    },
    async saveConfigItem(item) {
      const s = loadState()
      s.config = { ...DEFAULT_CONFIG, ...item }
      saveState(s)
      return { ...s.config, id: item.id || 'mock-1', name: item.name || '预览配置', createdAt: Date.now() } as ApiConfigItem
    },
    async deleteConfigItem() {
      const s = loadState()
      s.config = { ...DEFAULT_CONFIG }
      saveState(s)
      return true
    },
    async setActiveConfig(id) {
      return loadState().config
    },
    async listSubjects() {
      return loadState().subjects
    },
    async createSubject(name, color) {
      const s = loadState()
      const sub: Subject = { id: crypto.randomUUID(), name, color, created_at: Date.now() }
      s.subjects.unshift(sub)
      saveState(s)
      return sub
    },
    async deleteSubject(id) {
      const s = loadState()
      s.subjects = s.subjects.filter((x) => x.id !== id)
      s.materials = s.materials.filter((m) => m.subject_id !== id)
      saveState(s)
      return true
    },
    async uploadMaterials(subjectId, filePaths) {
      const s = loadState()
      const created: Material[] = filePaths.map((p) => {
        const name = p.split(/[\\/]/).pop() || 'file'
        return {
          id: crypto.randomUUID(),
          subject_id: subjectId,
          filename: name,
          filetype: name.split('.').pop() || 'unknown',
          size: 0,
          status: 'ready' as const,
          text_content: '（浏览器预览模式：文件解析不可用，请在桌面应用中上传以解析真实内容）',
          created_at: Date.now(),
        }
      })
      s.materials.push(...created)
      saveState(s)
      return created
    },
    async getMaterials(subjectId) {
      return loadState().materials.filter((m) => m.subject_id === subjectId)
    },
    async updateMaterial(id, patch) {
      const s = loadState()
      const idx = s.materials.findIndex((m) => m.id === id)
      if (idx >= 0) {
        s.materials[idx] = { ...s.materials[idx], ...patch }
        saveState(s)
      }
      return true
    },
    async deleteMaterial(id) {
      const s = loadState()
      s.materials = s.materials.filter((m) => m.id !== id)
      saveState(s)
      return true
    },
    onMaterialUpdated() {
      return () => {}
    },
    async listChatSessions(subjectId) {
      return loadState().chats.filter((c) => c.subject_id === subjectId)
    },
    async saveChatSession(session) {
      const s = loadState()
      const idx = s.chats.findIndex((c) => c.id === session.id)
      if (idx >= 0) s.chats[idx] = session
      else s.chats.unshift(session)
      saveState(s)
      return true
    },
    async deleteChatSession(id) {
      const s = loadState()
      s.chats = s.chats.filter((c) => c.id !== id)
      saveState(s)
      return true
    },
    async saveReviewDoc(doc) {
      const s = loadState()
      const idx = s.reviews.findIndex((r) => r.id === doc.id)
      if (idx >= 0) s.reviews[idx] = doc
      else s.reviews.unshift(doc)
      saveState(s)
      return true
    },
    async listReviewDocs(subjectId) {
      return loadState().reviews.filter((r) => r.subject_id === subjectId)
    },
    async deleteReviewDoc(id) {
      const s = loadState()
      s.reviews = s.reviews.filter((r) => r.id !== id)
      saveState(s)
      return true
    },
    async saveQuizSession(session) {
      const s = loadState()
      const idx = s.quizzes.findIndex((q) => q.id === session.id)
      if (idx >= 0) s.quizzes[idx] = session
      else s.quizzes.unshift(session)
      saveState(s)
      return true
    },
    async listQuizSessions(subjectId) {
      return loadState().quizzes.filter((q) => q.subject_id === subjectId)
    },
    async deleteQuizSession(id) {
      const s = loadState()
      s.quizzes = s.quizzes.filter((q) => q.id !== id)
      saveState(s)
      return true
    },
    async getProfile() {
      const s = loadState()
      return s.profile || { nickname: '', grade: '', goal: '', weakAreas: '', preferredStyle: '' }
    },
    async saveProfile(profile) {
      const s = loadState()
      s.profile = profile
      saveState(s)
      return true
    },
    async pickFiles() {
      // 浏览器中用 input 选择文件
      return new Promise<string[]>((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.multiple = true
        input.accept = '.pdf,.docx,.pptx,.txt,.md'
        input.onchange = () => {
          const files = Array.from(input.files || [])
          resolve(files.map((f) => (f as File & { path?: string }).path || f.name))
        }
        input.click()
      })
    },
    // LLM mock：浏览器预览中模拟流式回复
    async llmStream(opts: LlmStreamOptions) {
      const requestId = crypto.randomUUID()
      const reply = `（浏览器预览模式：未连接真实 API。请在桌面应用中配置 API Key 后使用。\n\n收到 ${opts.messages.length} 条消息，模型：${opts.config.model}）`
      // 逐字推送模拟流式效果
      const chars = Array.from(reply)
      let i = 0
      const timer = setInterval(() => {
        if (i >= chars.length) {
          clearInterval(timer)
          window.dispatchEvent(new CustomEvent('mock-llm-done', { detail: { requestId, full: reply } }))
          return
        }
        const token = chars[i]
        window.dispatchEvent(new CustomEvent('mock-llm-token', { detail: { requestId, token } }))
        i++
      }, 20)
      return requestId
    },
    async llmAbort() {
      return true
    },
    async llmJSON() {
      return { ok: false, error: '浏览器预览模式不支持 LLM 调用，请在桌面应用中使用' }
    },
    onLlmToken(cb: (payload: LlmTokenEvent) => void) {
      const handler = (e: Event) => cb((e as CustomEvent).detail)
      window.addEventListener('mock-llm-token', handler)
      return () => window.removeEventListener('mock-llm-token', handler)
    },
    onLlmDone(cb: (payload: LlmDoneEvent) => void) {
      const handler = (e: Event) => cb((e as CustomEvent).detail)
      window.addEventListener('mock-llm-done', handler)
      return () => window.removeEventListener('mock-llm-done', handler)
    },
    onLlmError(_cb: (payload: LlmErrorEvent) => void) {
      return () => {}
    },
    // 错题本 mock（浏览器预览模式不可用）
    async listWrongQuestions() {
      return []
    },
    async addWrongQuestion() {
      return true
    },
    async deleteWrongQuestion() {
      return true
    },
    async markWrongReviewed() {
      return true
    },
    async generateWrongQuiz() {
      return []
    },
    // 异步后台任务队列 mock（浏览器预览模式不可用）
    async parseBatch() {
      return 'mock-task-id'
    },
    onTaskProgress(_cb: (progress: TaskProgress) => void) {
      void _cb
      return () => {}
    },
    async cancelTask() {
      return
    },
    async clearParseCache() {
      return
    },
    // 科目检索索引持久化缓存 mock（浏览器预览模式不可用）
    async saveSubjectIndex() {
      return true
    },
    async loadSubjectIndex() {
      return undefined
    },
    // 缓存清理 mock
    async clearCache() {
      return true
    },
    async openExternal(url) {
      window.open(url, '_blank')
      return true
    },
  }

  ;(window as { api?: ElectronAPI }).api = mock
}
