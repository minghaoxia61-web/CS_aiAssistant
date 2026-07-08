// 聊天全局状态：流式生成状态提升到 store 层，切换页面不打断生成
import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { streamChat, buildChatSystemPrompt, estimateMaterialsTokens, summarizeMaterial } from '@/lib/llm'
import { chunkMaterials, retrieveChunks, chunksToContext, type Chunk } from '@/lib/rag'
import { ensureSubjectVectors, loadSubjectVectors, embedQuery } from '@/lib/vector'
import type { ApiConfig, ChatSession, ChatMessage, Material, UserProfile } from '@/shared/types'

/** 持久化索引文件结构（与 electron/store.ts SubjectIndexData 对应） */
interface SubjectIndexData {
  subjectId: string
  built_at: number
  materialSignatures: Record<string, number>
  chunks: Chunk[]
}

/**
 * 获取某科目的分块：优先读持久化缓存，缓存过期或不存在则重建并落盘。
 * 缓存校验：对比当前 ready 资料的 (id -> text 长度) 签名，任一不一致即重建。
 * 这样首次上传分块一次，重启软件、重复提问不再重复分块。
 */
async function getOrBuildChunks(subjectId: string, materials: Material[]): Promise<Chunk[]> {
  // 仅取该科目下已就绪的资料
  const ready = materials.filter((m) => m.subject_id === subjectId && m.status === 'ready' && m.text_content)
  if (ready.length === 0) return []

  // 构建当前签名：materialId -> text_content 长度
  const signatures: Record<string, number> = {}
  for (const m of ready) {
    signatures[m.id] = (m.text_content || '').length
  }

  // 尝试加载缓存
  try {
    const cached = (await window.api.loadSubjectIndex(subjectId)) as SubjectIndexData | undefined
    if (cached && Array.isArray(cached.chunks) && cached.materialSignatures) {
      const cachedKeys = Object.keys(cached.materialSignatures)
      const currentKeys = Object.keys(signatures)
      // 签名完全一致（数量 + 每个资料文本长度）才使用缓存
      const valid =
        cachedKeys.length === currentKeys.length &&
        currentKeys.every((k) => cached.materialSignatures[k] === signatures[k])
      if (valid) {
        return cached.chunks
      }
    }
  } catch {
    // 缓存读取失败，走重建
  }

  // 重建分块并保存缓存
  const chunks = chunkMaterials(ready, subjectId)
  try {
    await window.api.saveSubjectIndex(subjectId, {
      subjectId,
      built_at: Date.now(),
      materialSignatures: signatures,
      chunks,
    })
  } catch {
    // 保存失败不影响主流程
  }
  // 后台构建向量索引（不阻塞问答，首次问答回退纯 BM25，构建完成后自动混合召回）
  ensureSubjectVectors(subjectId, chunks).catch(() => {
    // 静默失败：模型加载失败/无网络时降级为纯 BM25
  })
  return chunks
}

interface ChatState {
  sessions: ChatSession[]
  currentSession: ChatSession | null
  streaming: boolean
  streamPhase: 'idle' | 'retrieving' | 'reasoning' // 流式阶段提示
  error: string
  activeSubjectId: string | null
  localOnly: boolean // 强制约束：仅使用本地资料作答

  loadSessions: (subjectId: string) => Promise<void>
  selectSession: (s: ChatSession | null) => void
  send: (
    text: string,
    config: ApiConfig,
    subjectId: string,
    selectedMatIds: Set<string>,
    readyMaterials: Material[],
    profile?: UserProfile | null,
  ) => Promise<void>
  stop: () => void
  deleteSession: (id: string) => Promise<void>
  newSession: (subjectId: string) => ChatSession
  clearError: () => void
  setLocalOnly: (v: boolean) => void
}

let abortController: AbortController | null = null

/** 带重试的保存（防止偶发 IO 失败导致数据丢失） */
async function saveWithRetry(session: ChatSession, retries = 2): Promise<void> {
  for (let i = 0; i <= retries; i++) {
    try {
      await window.api.saveChatSession(session)
      return
    } catch (e) {
      console.error(`保存对话失败(第${i + 1}次):`, e)
      if (i < retries) await new Promise((r) => setTimeout(r, 300 * (i + 1)))
    }
  }
  console.error('保存对话最终失败，已用尽重试次数')
}

/** 多轮对话自动摘要：超过 6 轮时压缩早期问答 */
const MAX_TURNS_BEFORE_SUMMARY = 6
const TURNS_TO_SUMMARIZE = 4 // 压缩最早 4 轮（8 条消息）

async function summarizeHistory(
  messages: { role: string; content: string }[],
  config: ApiConfig,
): Promise<string | null> {
  try {
    const summaryPrompt = `请将以下对话历史压缩为简洁摘要（300字以内），保留关键信息点、用户关注的核心问题和AI回答的要点。用条目式列出：

${messages.map((m) => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content.slice(0, 500)}`).join('\n\n')}`

    const result = await streamChat({
      config,
      messages: [
        { role: 'system', content: '你是对话摘要助手，请将对话压缩为简洁要点。' },
        { role: 'user', content: summaryPrompt },
      ],
      signal: new AbortController().signal,
      onToken: () => {},
    })
    return result || null
  } catch {
    return null // 摘要失败不影响主流程
  }
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: [],
  currentSession: null,
  streaming: false,
  streamPhase: 'idle',
  error: '',
  activeSubjectId: null,
  localOnly: false,

  loadSessions: async (subjectId) => {
    const list = await window.api.listChatSessions(subjectId)
    // 合并：磁盘版本 + 内存中更新的版本（内存中消息数 >= 磁盘则保留内存）
    const memSessions = get().sessions
    const merged = list.map((disk) => {
      const mem = memSessions.find((s) => s.id === disk.id)
      if (mem && mem.messages.length >= disk.messages.length) return mem
      return disk
    })
    // 内存中有但磁盘没有的（刚创建还没保存的），也保留
    for (const mem of memSessions) {
      if (!merged.find((s) => s.id === mem.id) && mem.subject_id === subjectId) {
        merged.unshift(mem)
      }
    }
    merged.sort((a, b) => b.created_at - a.created_at)
    set({ sessions: merged })

    // currentSession 处理
    const cs = get().currentSession
    if (cs && cs.subject_id === subjectId) {
      // 同科目：保留 currentSession，但如果磁盘版本消息更多则更新
      const diskVer = list.find((s) => s.id === cs.id)
      if (diskVer && diskVer.messages.length > cs.messages.length) {
        set({ currentSession: diskVer })
      }
    } else {
      // 不同科目或 null：从磁盘选第一个
      if (list.length > 0) {
        set({ currentSession: list[0] })
      } else {
        set({ currentSession: null })
      }
    }
  },

  selectSession: (s) => set({ currentSession: s, error: '' }),

  newSession: (subjectId) => {
    const s: ChatSession = {
      id: uuidv4(),
      title: '新对话',
      subject_id: subjectId,
      material_ids: [],
      messages: [],
      created_at: Date.now(),
    }
    set({ currentSession: s, error: '' })
    return s
  },

  send: async (text, config, subjectId, selectedMatIds, readyMaterials, profile) => {
    if (!text.trim() || get().streaming) return

    // 获取或创建会话
    let session = get().currentSession
    if (!session) {
      session = get().newSession(subjectId)
    }

    const userMsg: ChatMessage = {
      id: uuidv4(),
      session_id: session.id,
      role: 'user',
      content: text.trim(),
      created_at: Date.now(),
    }
    const assistantMsg: ChatMessage = {
      id: uuidv4(),
      session_id: session.id,
      role: 'assistant',
      content: '',
      created_at: Date.now(),
    }

    const updatedMessages = [...session.messages, userMsg, assistantMsg]
    const title = session.messages.length === 0 ? text.trim().slice(0, 24) : session.title
    const updated: ChatSession = {
      ...session,
      title,
      material_ids: Array.from(selectedMatIds),
      messages: updatedMessages,
    }
    set({ currentSession: updated, error: '', activeSubjectId: subjectId })

    // 立即保存（用户消息 + 空 AI 消息），切换页面不丢
    await saveWithRetry(updated)
    set((state) => {
      const idx = state.sessions.findIndex((x) => x.id === updated.id)
      if (idx >= 0) {
        const copy = [...state.sessions]
        copy[idx] = updated
        return { sessions: copy }
      }
      return { sessions: [updated, ...state.sessions] }
    })

    // 构建上下文：RAG 检索 — 只发送与用户问题最相关的资料片段
    set({ streamPhase: 'retrieving' })
    // 提前创建 AbortController，使检索/Map-Reduce 阶段也可被 stop() 中断
    abortController = new AbortController()
    const ctxMaterials = readyMaterials.filter((m) => selectedMatIds.has(m.id))
    let context = ''
    if (ctxMaterials.length > 0) {
      const totalTokens = estimateMaterialsTokens(ctxMaterials)
      const RAG_BUDGET = 30000 // GLM-4-Flash 支持 128k 上下文，30k 足够且留有余量
      // 超过此份数启用 Map-Reduce：逐份压缩再合并，避免 RAG top-K 遗漏跨资料关联
      const MAPREDUCE_THRESHOLD = 5
      if (totalTokens <= RAG_BUDGET) {
        // 资料少时直接全量发送，保证完整性
        context = ctxMaterials
          .map((m) => `=== 资料：${m.filename} ===\n${m.text_content || ''}`)
          .join('\n\n')
          .trim()
      } else if (ctxMaterials.length >= MAPREDUCE_THRESHOLD) {
        // 资料多且份数多（≥5）：Map-Reduce 逐份压缩再合并
        // 复用复习资料生成的压缩逻辑，保留每份资料的核心知识点，避免 RAG 只取 top-K 片段导致跨资料内容遗漏
        const summaries: string[] = []
        for (let i = 0; i < ctxMaterials.length; i++) {
          if (abortController?.signal.aborted) throw new DOMException('Aborted', 'AbortError')
          const summary = await summarizeMaterial(ctxMaterials[i], config, abortController?.signal)
          summaries.push(`=== 资料：${ctxMaterials[i].filename}（摘要）===\n${summary}`)
        }
        context = summaries.join('\n\n').trim()
      } else {
        // 资料多但份数少（<5）：RAG 检索最相关片段（BM25 + 向量语义混合召回）
        // 使用持久化缓存：首次分块后落盘，重启/重复提问不重算
        const subjectChunks = await getOrBuildChunks(subjectId, readyMaterials)
        // 按用户选中的资料过滤分块（缓存含该科目全部 ready 资料）
        const selectedChunks = subjectChunks.filter((c) => selectedMatIds.has(c.materialId))
        // 向量语义检索：加载已构建的向量 + 查询向量化
        // （向量在后台异步构建，未就绪时 chunkVectors 为空，回退纯 BM25）
        const chunkVectors = await loadSubjectVectors(subjectId)
        const queryVector = chunkVectors.size > 0 ? await embedQuery(text) : null
        const retrieved = retrieveChunks(
          selectedChunks,
          text,
          RAG_BUDGET,
          subjectId,
          8,
          4,
          chunkVectors.size > 0 ? chunkVectors : undefined,
          queryVector || undefined,
        )
        context = chunksToContext(retrieved)
      }
    }

    // 强制约束：仅使用本地资料
    const localOnlySuffix = get().localOnly
      ? '\n\n⚠️ 重要约束：用户已开启「仅使用本地资料」模式。请严格基于上述资料回答，不得引入资料外的知识。若资料中无相关内容，请明确告知"本地资料中未涉及此内容"。'
      : ''

    const systemContent = context
      ? `${buildChatSystemPrompt(profile)}\n\n以下是用户提供的课程资料（来自多份文件），请综合参考所有资料内容回答，不要只关注第一份：\n${context}${localOnlySuffix}`
      : buildChatSystemPrompt(profile) + (get().localOnly ? '\n\n⚠️ 用户已开启「仅使用本地资料」模式，但当前未提供任何资料。请告知用户需要先上传资料。' : '')

    // 多轮对话自动摘要：超过 6 轮时压缩早期问答
    const historyMessages = updatedMessages
      .filter((m) => m.id !== assistantMsg.id)
      .map((m) => ({ role: m.role, content: m.content }))
    const userTurnCount = historyMessages.filter((m) => m.role === 'user').length

    let effectiveHistory = historyMessages
    if (userTurnCount > MAX_TURNS_BEFORE_SUMMARY) {
      // 取最早 TURNS_TO_SUMMARIZE 轮（每轮 = user + assistant）
      const toSummarize = historyMessages.slice(0, TURNS_TO_SUMMARIZE * 2)
      const recent = historyMessages.slice(TURNS_TO_SUMMARIZE * 2)
      const summary = await summarizeHistory(toSummarize, config)
      if (summary) {
        effectiveHistory = [
          { role: 'system' as const, content: `[早期对话摘要]\n${summary}` },
          ...recent,
        ]
      }
    }

    const apiMessages = [
      { role: 'system' as const, content: systemContent },
      ...effectiveHistory,
    ]

    set({ streamPhase: 'reasoning', streaming: true })
    let acc = ''
    try {
      await streamChat({
        config,
        messages: apiMessages,
        signal: abortController.signal,
        onToken: (t) => {
          acc += t
          // 只有当前生成属于同一科目时才更新
          if (get().activeSubjectId === subjectId) {
            set((state) => {
              if (!state.currentSession) return state
              const msgs = state.currentSession.messages.map((m) =>
                m.id === assistantMsg.id ? { ...m, content: acc } : m
              )
              return { currentSession: { ...state.currentSession, messages: msgs } }
            })
          }
        },
      })
      const finalMessages = updatedMessages.map((m) =>
        m.id === assistantMsg.id ? { ...m, content: acc } : m
      )
      const finalSession = { ...updated, messages: finalMessages }
      set({ currentSession: finalSession, streaming: false, streamPhase: 'idle' })
      await saveWithRetry(finalSession)
      set((state) => {
        const idx = state.sessions.findIndex((x) => x.id === finalSession.id)
        if (idx >= 0) {
          const copy = [...state.sessions]
          copy[idx] = finalSession
          return { sessions: copy }
        }
        return { sessions: [finalSession, ...state.sessions] }
      })
    } catch (e) {
      const err = e as Error
      const errText = err.name === 'AbortError' ? '（已停止）' : `⚠️ ${err.message}`
      const finalMessages = updatedMessages.map((m) =>
        m.id === assistantMsg.id ? { ...m, content: acc + '\n\n' + errText } : m
      )
      const finalSession = { ...updated, messages: finalMessages }
      set({ currentSession: finalSession, streaming: false, streamPhase: 'idle' })
      if (err.name !== 'AbortError') {
        set({ error: err.message })
      }
      await saveWithRetry(finalSession)
    } finally {
      abortController = null
      set({ streamPhase: 'idle' })
    }
  },

  stop: () => {
    abortController?.abort()
  },

  deleteSession: async (id) => {
    await window.api.deleteChatSession(id)
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== id),
      currentSession: state.currentSession?.id === id ? null : state.currentSession,
    }))
  },

  clearError: () => set({ error: '' }),
  setLocalOnly: (v) => set({ localOnly: v }),
}))
