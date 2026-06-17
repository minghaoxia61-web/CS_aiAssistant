// LLM 调用客户端 + 提示词构建器
// 通过 IPC 转发到主进程发起请求，避免渲染进程 CORS 问题，且 API Key 不暴露到前端
import type { ApiConfig, Material, QuizQuestion, QuizQuestionType, LlmMessage } from '@/shared/types'

export interface StreamChatOptions {
  config: ApiConfig
  messages: LlmMessage[]
  onToken: (token: string) => void
  signal?: AbortSignal
  temperature?: number
  maxTokens?: number
}

/** 流式调用：通过主进程 IPC 转发，逐 token 回调 */
export async function streamChat(opts: StreamChatOptions): Promise<string> {
  const { config, messages, onToken, signal, temperature, maxTokens } = opts
  const requestId = await window.api.llmStream({ config, messages, temperature, maxTokens })

  return new Promise<string>((resolve, reject) => {
    let full = ''
    let settled = false

    const cleanup = () => {
      offToken()
      offDone()
      offError()
    }

    const offToken = window.api.onLlmToken((payload) => {
      if (payload.requestId !== requestId || settled) return
      full += payload.token
      onToken(payload.token)
    })

    const offDone = window.api.onLlmDone((payload) => {
      if (payload.requestId !== requestId || settled) return
      settled = true
      cleanup()
      resolve(payload.full)
    })

    const offError = window.api.onLlmError((payload) => {
      if (payload.requestId !== requestId || settled) return
      settled = true
      cleanup()
      reject(new Error(payload.message))
    })

    // 支持中止
    if (signal) {
      if (signal.aborted) {
        settled = true
        cleanup()
        window.api.llmAbort(requestId)
        reject(new DOMException('Aborted', 'AbortError'))
        return
      }
      signal.addEventListener(
        'abort',
        () => {
          if (settled) return
          window.api.llmAbort(requestId)
        },
        { once: true },
      )
    }
  })
}

/** 非流式调用（用于结构化 JSON 输出，如出题/批改） */
export async function chatJSON(opts: Omit<StreamChatOptions, 'onToken'>): Promise<string> {
  const { config, messages, signal, temperature, maxTokens } = opts
  const res = await window.api.llmJSON({ config, messages, temperature, maxTokens })
  if (!res.ok) throw new Error(res.error)
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  return res.content
}

// ---------- 上下文构建 ----------
export function buildContext(materials: Material[], maxChars = 24000): string {
  const parts: string[] = []
  let total = 0
  for (const m of materials) {
    if (m.status !== 'ready' || !m.text_content) continue
    const header = `\n\n=== 资料：${m.filename} ===\n`
    let content = m.text_content
    if (total + content.length > maxChars) {
      content = content.slice(0, Math.max(0, maxChars - total)) + '\n...[内容已截断]'
    }
    parts.push(header + content)
    total += content.length
    if (total >= maxChars) break
  }
  return parts.join('\n').trim()
}

// ---------- 系统提示词 ----------
export const SYSTEM_PROMPTS = {
  chat: `你是"CS_Assistant"，一位耐心、严谨的计算机专业复习辅导老师。请基于用户提供的课程资料回答问题，做到：
1. 优先使用资料中的内容，引用时注明出处资料名。
2. 解释清晰、层次分明，必要时用代码示例、表格、列表辅助说明。
3. 若资料中未涉及该问题，明确告知并基于通用知识作答，标注"资料外补充"。
4. 回答使用 Markdown 格式，代码块标注语言。`,

  summary: `你是"CS_Assistant"。请基于用户提供的课程资料，生成结构化的章节复习总结。要求：
1. 按主题/章节组织，使用二级/三级标题。
2. 提炼核心概念、定义、公式、关键结论。
3. 对易混淆点做对比说明，标注重点与考点。
4. 输出 Markdown 格式，简洁但信息密度高。`,

  outline: `你是"CS_Assistant"。请基于用户提供的课程资料，生成一份完整的复习大纲。要求：
1. 用层级列表呈现知识结构（一级/二级/三级）。
2. 每个知识点后简要标注掌握要求（了解/理解/掌握/熟练）。
3. 标注高频考点与常见题型。
4. 输出 Markdown 格式。`,

  flashcards: `你是"CS_Assistant"。请基于用户提供的课程资料，提取关键术语与核心概念，生成问答速记卡。
严格按以下 JSON 数组格式输出，不要输出任何其他内容：
[
  {"q": "问题/术语", "a": "简洁答案/解释"}
]
要求：生成 10-15 张卡片，问答精炼，覆盖核心考点。`,

  quiz: `你是"CS_Assistant"。请基于用户提供的课程资料，按要求生成测验题目。
严格按以下 JSON 数组格式输出，不要输出任何其他内容：
[
  {
    "type": "single",
    "question": "题干",
    "options": ["选项A", "选项B", "选项C", "选项D"],
    "answer": "正确选项的完整文本",
    "explanation": "解析说明"
  }
]
题型说明：type 可为 "single"(单选)、"multiple"(多选，answer 为多个选项用 | 分隔)、"short"(简答，options 为空数组)。
要求：题目紧扣资料内容，难度适中，每题必含 explanation。`,

  grade: `你是"CS_Assistant"。请批改用户的测验作答。对每道题判断对错并给出解析。
严格按以下 JSON 数组格式输出，不要输出任何其他内容：
[
  {
    "correct": true,
    "explanation": "批改解析"
  }
]
判断规则：单选/多选与标准答案一致即正确；简答题意相近即正确。`,
} as const

// ---------- 出题/批改辅助 ----------
export interface QuizGenConfig {
  count: number
  types: QuizQuestionType[]
  difficulty: '基础' | '中等' | '进阶'
}

export function buildQuizPrompt(materials: Material[], cfg: QuizGenConfig): string {
  const context = buildContext(materials)
  const typeMap: Record<QuizQuestionType, string> = {
    single: '单选题',
    multiple: '多选题',
    short: '简答题',
  }
  const typeDesc = cfg.types.map((t) => typeMap[t]).join('、')
  return `以下是课程资料：
${context}

请生成 ${cfg.count} 道${cfg.difficulty}难度的${typeDesc}。
题目须基于上述资料，覆盖不同知识点。严格按系统提示中的 JSON 格式输出。`
}

export function buildGradePrompt(questions: QuizQuestion[]): string {
  const items = questions.map((q, i) => {
    const opts = q.options.length ? `\n选项：${q.options.map((o, j) => `${String.fromCharCode(65 + j)}. ${o}`).join('\n')}` : ''
    return `第${i + 1}题（${q.type}）：\n题干：${q.question}${opts}\n标准答案：${q.answer}\n用户作答：${q.user_answer || '（未作答）'}`
  }).join('\n\n')
  return `请批改以下测验作答，按系统提示中的 JSON 数组格式输出每题的 correct 与 explanation：
${items}`
}

/** 从 LLM 输出中提取 JSON 数组 */
export function extractJSON(text: string): unknown[] {
  // 去除可能的 ```json 包裹
  let t = text.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) t = fence[1].trim()
  const start = t.indexOf('[')
  const end = t.lastIndexOf(']')
  if (start >= 0 && end > start) {
    t = t.slice(start, end + 1)
  }
  return JSON.parse(t)
}
