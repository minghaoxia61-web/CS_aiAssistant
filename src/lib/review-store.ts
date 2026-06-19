// 复习中心全局状态：生成状态提升到 store 层，切换页面不打断生成
import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { streamChat, chatJSON, buildContextSmart, SYSTEM_PROMPTS, extractJSON } from '@/lib/llm'
import { formatTime } from '@/lib/utils'
import type { ApiConfig, Material, ReviewDoc, ReviewDocType } from '@/shared/types'

interface Flashcard { q: string; a: string }

interface ReviewState {
  generating: boolean
  generatingType: ReviewDocType | null
  streamText: string
  currentDoc: ReviewDoc | null
  flashcards: Flashcard[]
  error: string
  // 当前生成所属的 subjectId，用于防止切换科目后混淆
  activeSubjectId: string | null

  generate: (type: ReviewDocType, ctxMaterials: Material[], config: ApiConfig, subjectId: string) => Promise<void>
  openDoc: (doc: ReviewDoc) => void
  clearError: () => void
  resetView: () => void
}

let abortController: AbortController | null = null

export const useReviewStore = create<ReviewState>((set, get) => ({
  generating: false,
  generatingType: null,
  streamText: '',
  currentDoc: null,
  flashcards: [],
  error: '',
  activeSubjectId: null,

  generate: async (type, ctxMaterials, config, subjectId) => {
    if (!config || ctxMaterials.length === 0) return

    // 中止之前的生成
    if (abortController) abortController.abort()

    set({
      generating: true,
      generatingType: type,
      streamText: '',
      flashcards: [],
      currentDoc: null,
      error: '',
      activeSubjectId: subjectId,
    })

    abortController = new AbortController()
    // 智能构建上下文：资料少直接拼接，资料多先逐份压缩（Map-Reduce）
    const context = await buildContextSmart(
      ctxMaterials,
      config,
      abortController.signal,
      (msg) => {
        // 显示压缩进度
        if (get().activeSubjectId === subjectId) {
          set({ streamText: msg })
        }
      },
    )
    const userContent = `以下是课程资料，请基于这些内容生成${type === 'summary' ? '章节总结' : type === 'outline' ? '复习大纲' : '速记卡片'}：\n${context}`

    try {
      if (type === 'flashcards') {
        const raw = await chatJSON({
          config,
          messages: [
            { role: 'system', content: SYSTEM_PROMPTS.flashcards },
            { role: 'user', content: userContent },
          ],
          signal: abortController.signal,
          temperature: 0.5,
        })
        const arr = extractJSON(raw) as Flashcard[]
        const doc: ReviewDoc = {
          id: uuidv4(),
          subject_id: subjectId,
          type,
          title: `速记卡片 · ${formatTime(Date.now())}`,
          content: JSON.stringify(arr),
          created_at: Date.now(),
        }
        await window.api.saveReviewDoc(doc)
        set({ flashcards: arr, currentDoc: doc, generating: false, generatingType: null })
      } else {
        const prompt = type === 'summary' ? SYSTEM_PROMPTS.summary : SYSTEM_PROMPTS.outline
        let acc = ''
        await streamChat({
          config,
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: userContent },
          ],
          signal: abortController.signal,
          onToken: (t) => {
            acc += t
            // 只有当前生成属于同一科目时才更新（防止切换科目后串数据）
            if (get().activeSubjectId === subjectId) {
              set({ streamText: acc })
            }
          },
        })
        const doc: ReviewDoc = {
          id: uuidv4(),
          subject_id: subjectId,
          type,
          title: `${type === 'summary' ? '章节总结' : '复习大纲'} · ${formatTime(Date.now())}`,
          content: acc,
          created_at: Date.now(),
        }
        await window.api.saveReviewDoc(doc)
        set({ currentDoc: doc, generating: false, generatingType: null })
      }
    } catch (e) {
      const err = e as Error
      if (err.name === 'AbortError') {
        set({ generating: false, generatingType: null })
      } else {
        set({ error: err.message, generating: false, generatingType: null })
      }
    } finally {
      abortController = null
    }
  },

  openDoc: (doc) => {
    set({
      currentDoc: doc,
      streamText: doc.type === 'flashcards' ? '' : doc.content,
      flashcards: doc.type === 'flashcards' ? safeParse(doc.content) : [],
      error: '',
    })
  },

  clearError: () => set({ error: '' }),

  resetView: () => {
    if (abortController) abortController.abort()
    set({
      streamText: '',
      flashcards: [],
      currentDoc: null,
      error: '',
    })
  },
}))

function safeParse(s: string): Flashcard[] {
  try {
    return JSON.parse(s) as Flashcard[]
  } catch {
    return []
  }
}
