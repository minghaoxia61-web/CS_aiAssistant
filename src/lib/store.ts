// 全局状态管理（Zustand）
import { create } from 'zustand'
import type { ApiConfig, Subject } from '@/shared/types'

interface AppState {
  // 配置
  config: ApiConfig | null
  configLoaded: boolean
  loadConfig: () => Promise<void>
  saveConfig: (cfg: ApiConfig) => Promise<void>

  // 科目
  subjects: Subject[]
  currentSubjectId: string | null
  loadSubjects: () => Promise<void>
  createSubject: (name: string, color: string) => Promise<Subject>
  deleteSubject: (id: string) => Promise<void>
  selectSubject: (id: string | null) => void
}

export const useStore = create<AppState>((set, get) => ({
  config: null,
  configLoaded: false,

  async loadConfig() {
    const cfg = await window.api.getConfig()
    set({ config: cfg, configLoaded: true })
  },

  async saveConfig(cfg) {
    await window.api.saveConfig(cfg)
    set({ config: cfg })
  },

  subjects: [],
  currentSubjectId: null,

  async loadSubjects() {
    const subjects = await window.api.listSubjects()
    set({ subjects })
    const cur = get().currentSubjectId
    if (!cur && subjects.length > 0) {
      set({ currentSubjectId: subjects[0].id })
    }
  },

  async createSubject(name, color) {
    const subject = await window.api.createSubject(name, color)
    set((s) => ({ subjects: [subject, ...s.subjects], currentSubjectId: subject.id }))
    return subject
  },

  async deleteSubject(id) {
    await window.api.deleteSubject(id)
    set((s) => {
      const subjects = s.subjects.filter((x) => x.id !== id)
      const currentSubjectId = s.currentSubjectId === id ? (subjects[0]?.id ?? null) : s.currentSubjectId
      return { subjects, currentSubjectId }
    })
  },

  selectSubject(id) {
    set({ currentSubjectId: id })
  },
}))

export const hasConfig = (s: AppState) => !!s.config?.apiKey
