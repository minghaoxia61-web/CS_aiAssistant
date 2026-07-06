// 全局状态管理（Zustand）
import { create } from 'zustand'
import type { ApiConfig, ApiConfigItem, Subject, UserProfile } from '@/shared/types'

interface AppState {
  // 配置
  config: ApiConfig | null
  configLoaded: boolean
  configs: ApiConfigItem[]
  activeConfigId: string | null
  loadConfig: () => Promise<void>
  saveConfig: (cfg: ApiConfig) => Promise<void>
  loadConfigs: () => Promise<void>
  saveConfigItem: (item: Partial<ApiConfigItem> & { id?: string }) => Promise<ApiConfigItem>
  deleteConfigItem: (id: string) => Promise<void>
  switchConfig: (id: string) => Promise<void>

  // 用户个人信息
  profile: UserProfile
  loadProfile: () => Promise<void>
  saveProfile: (profile: UserProfile) => Promise<void>

  // 科目
  subjects: Subject[]
  currentSubjectId: string | null
  loadSubjects: () => Promise<void>
  createSubject: (name: string, color: string) => Promise<Subject>
  deleteSubject: (id: string) => Promise<void>
  selectSubject: (id: string | null) => void

  // 主题
  theme: 'light' | 'dark'
  toggleTheme: () => void
  initTheme: () => void
}

export const useStore = create<AppState>((set, get) => ({
  config: null,
  configLoaded: false,
  configs: [],
  activeConfigId: null,

  async loadConfig() {
    const cfg = await window.api.getConfig()
    set({ config: cfg, configLoaded: true })
  },

  async saveConfig(cfg) {
    await window.api.saveConfig(cfg)
    set({ config: cfg })
  },

  async loadConfigs() {
    const configs = await window.api.listConfigs()
    const cfg = await window.api.getConfig()
    set({ configs, config: cfg, configLoaded: true })
  },

  async saveConfigItem(item) {
    const saved = await window.api.saveConfigItem(item)
    const configs = await window.api.listConfigs()
    const cfg = await window.api.getConfig()
    set({ configs, config: cfg })
    return saved
  },

  async deleteConfigItem(id) {
    await window.api.deleteConfigItem(id)
    const configs = await window.api.listConfigs()
    const cfg = await window.api.getConfig()
    set({ configs, config: cfg })
  },

  async switchConfig(id) {
    const cfg = await window.api.setActiveConfig(id)
    set({ config: cfg, activeConfigId: id })
  },

  // 用户个人信息
  profile: { nickname: '', grade: '', goal: '', weakAreas: '', preferredStyle: '' },

  async loadProfile() {
    const profile = await window.api.getProfile()
    set({ profile })
  },

  async saveProfile(profile) {
    await window.api.saveProfile(profile)
    set({ profile })
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

  // 主题
  theme: 'light',

  initTheme() {
    const saved = localStorage.getItem('theme') as 'light' | 'dark' | null
    // 默认使用浅色主题
    const theme = saved || 'light'
    set({ theme })
    document.documentElement.classList.toggle('dark', theme === 'dark')
  },

  toggleTheme() {
    const next = get().theme === 'light' ? 'dark' : 'light'
    localStorage.setItem('theme', next)
    document.documentElement.classList.add('theme-transition')
    document.documentElement.classList.toggle('dark', next === 'dark')
    set({ theme: next })
    setTimeout(() => document.documentElement.classList.remove('theme-transition'), 400)
  },
}))

// 默认配置始终可用（Pollinations 免费模型），故只要有 config 即视为就绪
export const hasConfig = (s: AppState) => !!s.config
