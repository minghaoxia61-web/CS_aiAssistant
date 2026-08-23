import type { LlmStructuredKind } from '../shared/types'

const QUIZ_TYPES = new Set(['single', 'multiple', 'short', 'code'])
const NODE_KINDS = new Set(['concept', 'algorithm', 'formula', 'definition', 'example'])
const EDGE_RELATIONS = new Set(['prerequisite', 'contains', 'contrast', 'causes', 'applies'])

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function nonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

export function parseJsonArray(text: string): unknown[] {
  let source = text.trim()
  const fence = source.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) source = fence[1].trim()
  const start = source.indexOf('[')
  const end = source.lastIndexOf(']')
  if (start >= 0 && end > start) source = source.slice(start, end + 1)
  const parsed = JSON.parse(source) as unknown
  if (!Array.isArray(parsed)) throw new Error('顶层必须是 JSON 数组')
  return parsed
}

function validateQuiz(items: unknown[]): string[] {
  if (!items.length) return ['题目数组不能为空']
  const errors: string[] = []
  items.forEach((value, index) => {
    const item = object(value)
    if (!item) {
      errors.push(`第 ${index + 1} 项不是对象`)
      return
    }
    if (!QUIZ_TYPES.has(String(item.type))) errors.push(`第 ${index + 1} 题 type 无效`)
    for (const field of ['question', 'answer', 'explanation', 'chapter']) {
      if (!nonEmptyString(item[field])) errors.push(`第 ${index + 1} 题缺少 ${field}`)
    }
    if (!Array.isArray(item.options)) errors.push(`第 ${index + 1} 题 options 必须是数组`)
    if ((item.type === 'single' || item.type === 'multiple') &&
      (!Array.isArray(item.options) || item.options.length < 2)) {
      errors.push(`第 ${index + 1} 题选择题选项不足`)
    }
  })
  return errors
}

function validateGrades(items: unknown[]): string[] {
  if (!items.length) return ['批改结果不能为空']
  const errors: string[] = []
  items.forEach((value, index) => {
    const item = object(value)
    if (!item) {
      errors.push(`第 ${index + 1} 项不是对象`)
      return
    }
    if (typeof item.correct !== 'boolean') errors.push(`第 ${index + 1} 项缺少布尔值 correct`)
    if (!nonEmptyString(item.explanation)) errors.push(`第 ${index + 1} 项缺少 explanation`)
    if (item.score !== undefined && (typeof item.score !== 'number' || item.score < 0 || item.score > 100)) {
      errors.push(`第 ${index + 1} 项 score 超出 0-100`)
    }
  })
  return errors
}

function validateFlashcards(items: unknown[]): string[] {
  if (!items.length) return ['速记卡数组不能为空']
  return items.flatMap((value, index) => {
    const item = object(value)
    if (!item) return [`第 ${index + 1} 项不是对象`]
    return [
      ...(!nonEmptyString(item.q) ? [`第 ${index + 1} 项缺少 q`] : []),
      ...(!nonEmptyString(item.a) ? [`第 ${index + 1} 项缺少 a`] : []),
    ]
  })
}

function validateSemanticGraph(items: unknown[]): string[] {
  if (items.length !== 1) return ['知识图谱顶层数组必须只包含一个对象']
  const graph = object(items[0])
  if (!graph) return ['知识图谱内容不是对象']
  if (!Array.isArray(graph.nodes) || !graph.nodes.length) return ['知识图谱 nodes 不能为空']
  if (!Array.isArray(graph.edges)) return ['知识图谱 edges 必须是数组']
  const errors: string[] = []
  graph.nodes.forEach((value, index) => {
    const node = object(value)
    if (!node) {
      errors.push(`第 ${index + 1} 个节点不是对象`)
      return
    }
    for (const field of ['key', 'title', 'definition', 'evidence', 'material']) {
      if (!nonEmptyString(node[field])) errors.push(`第 ${index + 1} 个节点缺少 ${field}`)
    }
    if (!NODE_KINDS.has(String(node.kind))) errors.push(`第 ${index + 1} 个节点 kind 无效`)
  })
  graph.edges.forEach((value, index) => {
    const edge = object(value)
    if (!edge || !nonEmptyString(edge.from) || !nonEmptyString(edge.to)) {
      errors.push(`第 ${index + 1} 条边缺少 from/to`)
    } else if (!EDGE_RELATIONS.has(String(edge.relation))) {
      errors.push(`第 ${index + 1} 条边 relation 无效`)
    }
  })
  return errors
}

export function validateStructuredOutput(
  text: string,
  kind: LlmStructuredKind,
  expectedItems?: number,
): string {
  let items: unknown[]
  try {
    items = parseJsonArray(text)
  } catch (error) {
    throw new Error(`结构化输出不是有效 JSON：${(error as Error).message}`)
  }
  const errors = kind === 'quiz'
    ? validateQuiz(items)
    : kind === 'grade'
      ? validateGrades(items)
      : kind === 'flashcards'
        ? validateFlashcards(items)
        : validateSemanticGraph(items)
  if (expectedItems !== undefined && items.length !== expectedItems) {
    errors.unshift(`期望 ${expectedItems} 项，实际返回 ${items.length} 项`)
  }
  if (errors.length) throw new Error(`结构化输出校验失败：${errors.slice(0, 5).join('；')}`)
  return JSON.stringify(items)
}

export function buildStructuredRepairPrompt(kind: LlmStructuredKind, reason: string): string {
  return `上一次 ${kind} 输出未通过程序校验：${reason}。请修复为完整、合法的 JSON 数组，保留原任务语义，不要输出 Markdown、解释或任何 JSON 之外的文字。`
}

export interface StructuredRepairInput {
  previous: string
  prompt: string
}

export interface StructuredOutputResult {
  content: string
  attempts: number
  repaired: boolean
}

export class StructuredOutputError extends Error {
  attempts = 2
  repaired = true
}

export async function executeStructuredWithRepair(
  kind: LlmStructuredKind,
  invoke: (repair?: StructuredRepairInput) => Promise<string>,
  expectedItems?: number,
): Promise<StructuredOutputResult> {
  const first = await invoke()
  try {
    return { content: validateStructuredOutput(first, kind, expectedItems), attempts: 1, repaired: false }
  } catch (error) {
    const second = await invoke({
      previous: first,
      prompt: buildStructuredRepairPrompt(kind, (error as Error).message),
    })
    try {
      return { content: validateStructuredOutput(second, kind, expectedItems), attempts: 2, repaired: true }
    } catch (secondError) {
      throw new StructuredOutputError((secondError as Error).message)
    }
  }
}
