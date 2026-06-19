// LLM 调用客户端 + 提示词构建器
// 通过 IPC 转发到主进程发起请求，避免渲染进程 CORS 问题，且 API Key 不暴露到前端
import type { ApiConfig, Material, QuizQuestion, QuizQuestionType, QuizDifficulty, QuizRatios, LlmMessage, UserProfile } from '@/shared/types'

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
  if (!res.ok) throw new Error((res as { error: string }).error)
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  return res.content
}

// ---------- 上下文构建 ----------
/**
 * 直接拼接资料上下文（按 token 预算截断）
 * GLM-4-Flash 支持 128k 上下文，默认预算 60k token 留足输出空间
 */
export function buildContext(materials: Material[], maxTokens = 60000): string {
  const parts: string[] = []
  let total = 0
  for (const m of materials) {
    if (m.status !== 'ready' || !m.text_content) continue
    const header = `\n\n=== 资料：${m.filename} ===\n`
    let content = m.text_content
    const t = estimateTokens(content)
    if (total + t > maxTokens) {
      // 按比例截断
      const remaining = maxTokens - total
      const ratio = remaining / t
      const cutPoint = Math.floor(content.length * ratio)
      content = content.slice(0, Math.max(0, cutPoint)) + '\n...[内容已截断]'
    }
    parts.push(header + content)
    total += estimateTokens(content)
    if (total >= maxTokens) break
  }
  return parts.join('\n').trim()
}

/** 估算资料的 token 数（粗略：中文约 1.5 字/token，英文约 4 字符/token） */
export function estimateTokens(text: string): number {
  if (!text) return 0
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length
  const otherChars = text.length - chineseChars
  return Math.ceil(chineseChars / 1.5 + otherChars / 4)
}

/** 计算多份资料的总 token 估算 */
export function estimateMaterialsTokens(materials: Material[]): number {
  return materials.reduce((sum, m) => sum + estimateTokens(m.text_content || ''), 0)
}

// ---------- Map-Reduce：资料多时先逐份压缩再合并 ----------
/** 单份资料的 token 数 */
export function estimateMaterialTokens(m: Material): number {
  return estimateTokens(m.text_content || '')
}

/** 压缩单份资料为高密度摘要（保留所有知识点） */
export async function summarizeMaterial(
  material: Material,
  config: ApiConfig,
  signal?: AbortSignal,
): Promise<string> {
  const text = material.text_content || ''
  const tokens = estimateTokens(text)
  // 资料本身很短则直接返回原文，无需浪费一次 API 调用
  if (tokens < 1500) return text

  const result = await chatJSON({
    config,
    messages: [
      {
        role: 'system',
        content:
          '你是一个资料压缩助手。请将资料压缩为信息密度最高的摘要，保留所有关键概念、定义、公式、重点结论和考点，去除冗余叙述和重复内容。用简洁的条目式表达，不要丢失任何知识点。',
      },
      {
        role: 'user',
        content: `请压缩以下资料：\n\n=== 资料：${material.filename} ===\n${text}`,
      },
    ],
    signal,
    temperature: 0.3,
  })
  return result
}

/**
 * 智能构建上下文：资料少时直接拼接，资料多时先逐份压缩总结再合并
 * @param onProgress 进度回调（显示"正在总结第 N 份..."）
 */
export async function buildContextSmart(
  materials: Material[],
  config: ApiConfig,
  signal?: AbortSignal,
  onProgress?: (msg: string) => void,
): Promise<string> {
  const DIRECT_BUDGET = 60000 // 6 万 token 以内直接拼接
  const totalTokens = estimateMaterialsTokens(materials)

  if (totalTokens <= DIRECT_BUDGET) {
    return buildContext(materials, DIRECT_BUDGET)
  }

  // Map-Reduce：逐份压缩
  onProgress?.(`资料较多（约 ${Math.round(totalTokens / 1000)}k token），正在分批压缩 ${materials.length} 份资料…`)
  const summaries: string[] = []
  for (let i = 0; i < materials.length; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    onProgress?.(`正在压缩第 ${i + 1}/${materials.length} 份：${materials[i].filename}`)
    const summary = await summarizeMaterial(materials[i], config, signal)
    summaries.push(`=== 资料：${materials[i].filename}（摘要）===\n${summary}`)
  }
  onProgress?.('资料压缩完成，正在生成内容…')
  return summaries.join('\n\n').trim()
}

/** 根据用户信息构建个性化系统提示词 */
export function buildChatSystemPrompt(profile?: UserProfile | null): string {
  let prompt = `你是"CS_Assistant"，一位耐心、严谨的计算机专业复习辅导老师。请基于用户提供的课程资料回答问题，做到：
1. 综合参考用户提供的所有资料，不要只关注第一份。若多份资料涉及同一问题，需交叉对比、整合回答。
2. 优先使用资料中的内容，引用时注明出处资料名；若资料文本中含页码标记（如 [Page N]），请一并标注来源页码，方便用户定位。
3. 解释清晰、层次分明，必要时用代码示例、表格、列表辅助说明。
4. 若资料中未涉及该问题，明确告知并基于通用知识作答，标注"资料外补充"。
5. 回答使用 Markdown 格式，代码块标注语言。
6. 数学公式使用 LaTeX 语法：行内公式用 $...$，独立公式用 $$...$$。
7. 涉及流程、结构、关系时，主动使用 Mermaid 代码块（\`\`\`mermaid）绘制流程图、状态图、硬件结构图、时序图等，帮助直观理解。`

  if (profile) {
    const parts: string[] = []
    if (profile.nickname) parts.push(`用户昵称：${profile.nickname}（对话时可自然称呼）`)
    if (profile.grade) parts.push(`身份/年级：${profile.grade}`)
    if (profile.goal) parts.push(`学习目标：${profile.goal}`)
    if (profile.weakAreas) parts.push(`薄弱方向：${profile.weakAreas}（在这些方向上多给基础解释和练习建议）`)
    if (profile.preferredStyle) parts.push(`偏好风格：${profile.preferredStyle}`)
    if (parts.length > 0) {
      prompt += `\n\n以下是用户的个人信息，请在回答时参考并适当调整表达方式：\n${parts.join('\n')}`
    }
  }
  return prompt
}

// ---------- 系统提示词 ----------
export const SYSTEM_PROMPTS = {
  chat: `你是"CS_Assistant"，一位耐心、严谨的计算机专业复习辅导老师。请基于用户提供的课程资料回答问题，做到：
1. 综合参考用户提供的所有资料，不要只关注第一份。若多份资料涉及同一问题，需交叉对比、整合回答。
2. 优先使用资料中的内容，引用时注明出处资料名。
3. 解释清晰、层次分明，必要时用代码示例、表格、列表辅助说明。
4. 若资料中未涉及该问题，明确告知并基于通用知识作答，标注"资料外补充"。
5. 回答使用 Markdown 格式，代码块标注语言。
6. 数学公式使用 LaTeX 语法：行内公式用 $...$，独立公式用 $$...$$。
7. 涉及流程、结构、关系时，主动使用 Mermaid 代码块（\`\`\`mermaid）绘制流程图、状态图、硬件结构图、时序图等，帮助直观理解。`,

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
    "explanation": "解析说明",
    "chapter": "所属章节"
  }
]
题型说明：
- "single"(单选)：4 个选项，answer 为正确选项的完整文本。
- "multiple"(多选)：4 个选项，answer 为多个正确选项的完整文本，用 " | " 分隔。
- "short"(简答)：options 为空数组，answer 为参考答案要点。
- "code"(代码计算题)：options 为空数组，answer 为参考代码或标准答案（可含关键步骤），explanation 为解题思路与关键步骤。题干中应明确给出输入输出要求或代码任务。
难度分层：
- "基础"：考查概念记忆、定义辨识、基本计算。
- "中档"：考查理解应用、综合判断、典型例题变形。
- "综合大题"：考查综合分析、多知识点结合、代码实现、复杂计算。
要求：题目紧扣资料内容，覆盖不同知识点，每题必含 explanation 与 chapter（章节标题或主题词）。`,

  grade: `你是"CS_Assistant"。请批改用户的测验作答。对每道题判断对错并给出详细解析。
严格按以下 JSON 数组格式输出，不要输出任何其他内容：
[
  {
    "correct": true,
    "explanation": "批改解析",
    "score": 100,
    "issues": [{"type": "syntax", "description": "问题描述", "line": 1}],
    "standard_solution": "分步标准实现",
    "scoring_points": [{"point": "得分点描述", "awarded": true, "source": "来源课件/章节"}]
  }
]
判断规则与输出要求：
- 单选/多选：与标准答案一致即正确，只需 correct 与 explanation，其余字段可省略。
- 简答题(short)：按得分点逐条评判，必须输出 scoring_points 数组，每个得分点标注 point(得分点描述)、awarded(是否得分)、source(对应课件或章节来源，可参考题目的 chapter 字段)。correct 为是否全部关键得分点达成。explanation 汇总得分情况。
- 代码题(code)：必须逐条标注问题，输出 issues 数组，每项含 type("syntax"语法错误/"logic"逻辑漏洞/"complexity"时间复杂度问题)、description(问题描述)、line(行号，可选)。附带分步标准实现 standard_solution。给出 0-100 分数 score（完全正确 100，有语法错误扣 20-30/处，逻辑漏洞扣 30-40/处，复杂度问题扣 10-20/处）。correct 为 score>=60。explanation 为总体评价。`,
} as const

// ---------- 出题/批改辅助 ----------
export interface QuizGenConfig {
  count: number
  types: QuizQuestionType[]
  difficulty: QuizDifficulty
  /** 题型占比（百分比 0-100），未指定的题型平均分配 */
  ratios?: QuizRatios
  /** 定向章节关键词，为空则全资料出题 */
  chapters?: string[]
  /** 仅从错题集中出题 */
  wrongOnly?: boolean
  /** 错题集（wrongOnly=true 时使用） */
  wrongQuestions?: QuizQuestion[]
  /** 计时模式总时长（分钟），用于模拟考场 */
  timer?: number
}

export function buildQuizPrompt(context: string, cfg: QuizGenConfig): string {
  const typeMap: Record<QuizQuestionType, string> = {
    single: '单选题',
    multiple: '多选题',
    short: '简答题',
    code: '代码计算题',
  }
  const typeDesc = cfg.types.map((t) => typeMap[t]).join('、')

  // 题型占比提示
  let ratioHint = ''
  if (cfg.ratios) {
    const parts = cfg.types
      .map((t) => ({ t, r: cfg.ratios?.[t] }))
      .filter((x) => typeof x.r === 'number' && x.r! > 0)
    if (parts.length > 0) {
      ratioHint =
        '\n题型占比要求：' +
        parts.map((p) => `${typeMap[p.t]}约占 ${p.r}%`).join('，') +
        '。请按占比分配题量。'
    }
  }

  // 章节定向提示
  const chapterHint =
    cfg.chapters && cfg.chapters.length > 0
      ? `\n定向章节要求：仅围绕以下章节/主题出题：${cfg.chapters.join('、')}。`
      : ''

  // 错题集出题提示
  let wrongHint = ''
  if (cfg.wrongOnly && cfg.wrongQuestions && cfg.wrongQuestions.length > 0) {
    const wrongList = cfg.wrongQuestions
      .map((q, i) => `(${i + 1}) [${typeMap[q.type]}] ${q.question}`)
      .join('\n')
    wrongHint = `\n错题集专项出题：请参考以下用户曾做错的题目，生成同类型、同知识点的变式题（不要原题重复）：\n${wrongList}\n`
  }

  // 计时模式提示
  const timerHint = cfg.timer ? `\n本次为模拟考场计时模式，总时长 ${cfg.timer} 分钟，请按真实考试难度出题。` : ''

  const contextBlock = context ? `以下是课程资料：\n${context}\n` : ''
  return `${contextBlock}
请生成 ${cfg.count} 道${cfg.difficulty}难度的${typeDesc}。${ratioHint}${chapterHint}${wrongHint}${timerHint}
题目须基于上述资料，覆盖不同知识点。严格按系统提示中的 JSON 格式输出，每题必含 chapter 字段。`
}

export function buildGradePrompt(questions: QuizQuestion[]): string {
  const items = questions.map((q, i) => {
    const opts = q.options.length ? `\n选项：${q.options.map((o, j) => `${String.fromCharCode(65 + j)}. ${o}`).join('\n')}` : ''
    const chapter = q.chapter ? `\n所属章节：${q.chapter}` : ''
    return `第${i + 1}题（${q.type}）：\n题干：${q.question}${opts}${chapter}\n标准答案：${q.answer}\n用户作答：${q.user_answer || '（未作答）'}`
  }).join('\n\n')
  return `请批改以下测验作答，按系统提示中的 JSON 数组格式输出每题的批改结果。
注意：简答题必须输出 scoring_points，代码题必须输出 issues、standard_solution、score。
${items}`
}

/** 批改结果项（与 SYSTEM_PROMPTS.grade 输出格式对应） */
export interface GradeResult {
  correct: boolean
  explanation: string
  score?: number
  issues?: { type: 'syntax' | 'logic' | 'complexity'; description: string; line?: number }[]
  standard_solution?: string
  scoring_points?: { point: string; awarded: boolean; source?: string }[]
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
