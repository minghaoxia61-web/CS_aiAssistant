import type { Material, QuizSession, WrongQuestion } from '@/shared/types'

export interface KnowledgeNode {
  id: string
  title: string
  level: number
  summary: string
  materialId: string
  materialName: string
  locator: string
}

export interface KnowledgeEdge {
  from: string
  to: string
  type: 'contains' | 'prerequisite'
}

export interface KnowledgeGraph {
  nodes: KnowledgeNode[]
  edges: KnowledgeEdge[]
}

export type MasteryStatus = 'unseen' | 'weak' | 'developing' | 'mastered'

export interface KnowledgeMastery {
  id: string
  title: string
  score: number
  confidence: number
  attempts: number
  correct: number
  averageSeconds: number
  status: MasteryStatus
  materialId?: string
}

export interface AdaptiveTask {
  id: string
  kind: 'review' | 'practice' | 'learn'
  title: string
  description: string
  minutes: number
  chapter?: string
  materialId?: string
  priority: number
}

function cleanTitle(value: string): string {
  return value
    .replace(/^第[一二三四五六七八九十\d]+[章节课]\s*/u, '')
    .replace(/^[一二三四五六七八九十\d]+[、.\s-]+/u, '')
    .replace(/[：:]\s*$/, '')
    .trim()
}

function normalize(value: string): string {
  return cleanTitle(value).toLowerCase().replace(/[\s《》【】()[\]（）_-]/g, '')
}

export function buildKnowledgeGraph(materials: Material[], maxNodes = 80): KnowledgeGraph {
  const nodes: KnowledgeNode[] = []
  const edges: KnowledgeEdge[] = []

  for (const material of materials.filter((item) => item.status === 'ready' && item.text_content)) {
    const lines = material.text_content.split('\n')
    const materialNodes: KnowledgeNode[] = []

    lines.forEach((line, lineIndex) => {
      const match = line.trim().match(/^(#{1,4})\s+(.+)$/)
      if (!match || nodes.length >= maxNodes) return
      const title = cleanTitle(match[2])
      if (title.length < 2 || title.length > 70) return
      const summary = lines
        .slice(lineIndex + 1, lineIndex + 7)
        .filter((item) => item.trim() && !/^#{1,4}\s+/.test(item.trim()))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 180)
      const node: KnowledgeNode = {
        id: `${material.id}:${lineIndex}`,
        title,
        level: match[1].length,
        summary: summary || `来自《${material.filename}》的知识节点`,
        materialId: material.id,
        materialName: material.filename,
        locator: `文本第 ${lineIndex + 1} 行`,
      }
      nodes.push(node)
      materialNodes.push(node)
    })

    if (materialNodes.length === 0 && nodes.length < maxNodes) {
      const fallback: KnowledgeNode = {
        id: `${material.id}:root`,
        title: material.filename.replace(/\.[^.]+$/, ''),
        level: 1,
        summary: material.text_content.replace(/\s+/g, ' ').trim().slice(0, 180),
        materialId: material.id,
        materialName: material.filename,
        locator: '全文',
      }
      nodes.push(fallback)
      materialNodes.push(fallback)
    }

    const stack: KnowledgeNode[] = []
    const previousAtLevel = new Map<number, KnowledgeNode>()
    for (const node of materialNodes) {
      while (stack.length && stack[stack.length - 1].level >= node.level) stack.pop()
      const parent = stack[stack.length - 1]
      if (parent) edges.push({ from: parent.id, to: node.id, type: 'contains' })
      const previous = previousAtLevel.get(node.level)
      if (previous) {
        edges.push({ from: previous.id, to: node.id, type: 'prerequisite' })
      }
      previousAtLevel.set(node.level, node)
      for (const level of previousAtLevel.keys()) {
        if (level > node.level) previousAtLevel.delete(level)
      }
      stack.push(node)
    }
  }

  return { nodes, edges }
}

function matchNode(chapter: string, nodes: KnowledgeNode[]): KnowledgeNode | undefined {
  const target = normalize(chapter)
  if (!target) return undefined
  return nodes.find((node) => {
    const candidate = normalize(node.title)
    return candidate === target || candidate.includes(target) || target.includes(candidate)
  })
}

export function calculateMastery(
  graph: KnowledgeGraph,
  sessions: QuizSession[],
): KnowledgeMastery[] {
  const entries = new Map<
    string,
    { node?: KnowledgeNode; title: string; attempts: number; correct: number; weighted: number; weight: number; seconds: number }
  >()

  for (const node of graph.nodes) {
    entries.set(node.id, {
      node,
      title: node.title,
      attempts: 0,
      correct: 0,
      weighted: 0,
      weight: 0,
      seconds: 0,
    })
  }

  const now = Date.now()
  for (const session of sessions) {
    for (const question of session.questions) {
      if (!question.user_answer?.trim()) continue
      const chapter = question.chapter?.trim() || '未分类知识点'
      const node = matchNode(chapter, graph.nodes)
      const key = node?.id || `chapter:${normalize(chapter)}`
      const entry = entries.get(key) || {
        node,
        title: chapter,
        attempts: 0,
        correct: 0,
        weighted: 0,
        weight: 0,
        seconds: 0,
      }
      const ageDays = Math.max(0, (now - (session.last_attempt_at || session.created_at)) / 86_400_000)
      const recencyWeight = Math.max(0.45, Math.exp(-ageDays / 45))
      const speedFactor = question.time_spent && question.time_spent > 180 ? 0.88 : 1
      entry.attempts += 1
      entry.correct += question.correct ? 1 : 0
      entry.weighted += (question.correct ? 1 : 0) * recencyWeight * speedFactor
      entry.weight += recencyWeight
      entry.seconds += question.time_spent || 0
      entries.set(key, entry)
    }
  }

  return Array.from(entries.entries())
    .map(([id, entry]) => {
      const raw = entry.weight ? (entry.weighted / entry.weight) * 100 : 0
      const confidence = Math.min(100, Math.round((1 - Math.exp(-entry.attempts / 3)) * 100))
      const score = Math.round(raw * (0.65 + confidence * 0.0035))
      const status: MasteryStatus =
        entry.attempts === 0
          ? 'unseen'
          : score < 50
            ? 'weak'
            : score < 80
              ? 'developing'
              : 'mastered'
      return {
        id,
        title: entry.title,
        score,
        confidence,
        attempts: entry.attempts,
        correct: entry.correct,
        averageSeconds: entry.attempts ? Math.round(entry.seconds / entry.attempts) : 0,
        status,
        materialId: entry.node?.materialId,
      }
    })
    .sort((a, b) => {
      if (a.status === 'unseen' && b.status !== 'unseen') return 1
      if (b.status === 'unseen' && a.status !== 'unseen') return -1
      return a.score - b.score
    })
}

export function buildAdaptivePlan(
  mastery: KnowledgeMastery[],
  wrongQuestions: WrongQuestion[],
  maxTasks = 4,
): AdaptiveTask[] {
  const tasks: AdaptiveTask[] = []
  const dueWrong = wrongQuestions.filter(
    (item) => !item.reviewed || !item.review_schedule || item.review_schedule.dueAt <= Date.now(),
  )
  if (dueWrong.length) {
    tasks.push({
      id: 'review-due',
      kind: 'review',
      title: `复习 ${dueWrong.length} 道到期错题`,
      description: '先处理遗忘风险最高的题目，并根据反馈重新安排间隔。',
      minutes: Math.min(25, Math.max(8, dueWrong.length * 3)),
      priority: 100,
    })
  }

  mastery
    .filter((item) => item.status === 'weak' || item.status === 'developing')
    .slice(0, 2)
    .forEach((item, index) => {
      tasks.push({
        id: `practice:${item.id}`,
        kind: 'practice',
        title: `${item.title}专项练习`,
        description: `当前掌握度 ${item.score}% · 证据置信度 ${item.confidence}%`,
        minutes: 12,
        chapter: item.title,
        materialId: item.materialId,
        priority: 90 - index,
      })
    })

  const unseen = mastery.find((item) => item.status === 'unseen')
  if (unseen) {
    tasks.push({
      id: `learn:${unseen.id}`,
      kind: 'learn',
      title: `预习 ${unseen.title}`,
      description: '先基于课件完成概念理解，再进行一次低难度检验。',
      minutes: 15,
      chapter: unseen.title,
      materialId: unseen.materialId,
      priority: 60,
    })
  }

  if (tasks.length === 0) {
    tasks.push({
      id: 'maintenance',
      kind: 'practice',
      title: '完成一次综合保持测验',
      description: '当前没有明显薄弱点，用混合题维持长期记忆。',
      minutes: 15,
      priority: 40,
    })
  }

  return tasks.sort((a, b) => b.priority - a.priority).slice(0, maxTasks)
}
