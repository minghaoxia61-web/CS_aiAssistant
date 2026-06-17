// 浏览器预览环境下的 window.api mock（Electron 中 window.api 已存在，跳过）
// 仅用于在普通浏览器中预览 UI，数据为空且不可持久化
import type { ElectronAPI } from '@/global.d'
import type { ApiConfig, Subject, Material, ChatSession, ReviewDoc, QuizSession } from '@/shared/types'

const DEFAULT_CONFIG: ApiConfig = {
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: '',
  model: 'deepseek-chat',
  temperature: 0.7,
  maxTokens: 2048,
  topP: 1,
}

const LS_KEY = 'cs-ai-tutor-preview'

function loadState(): {
  subjects: Subject[]
  materials: Material[]
  chats: ChatSession[]
  reviews: ReviewDoc[]
  quizzes: QuizSession[]
  config: ApiConfig
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
    async openExternal(url) {
      window.open(url, '_blank')
      return true
    },
  }

  ;(window as { api?: ElectronAPI }).api = mock
}
