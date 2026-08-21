import type { ChatSession, Material, QuizSession, WrongQuestion } from '@/shared/types'
import { buildKnowledgeTracingModel } from './knowledge-tracing'
import { chunkLocator, chunkMaterials, rankChunks } from './rag'
import { buildStudentModel, type LearningErrorType } from './student-model'

export type AgentState =
  | 'observe'
  | 'diagnose'
  | 'ground'
  | 'intervene'
  | 'verify'
  | 'update'
  | 'schedule'

export type AgentStepStatus = 'completed' | 'ready' | 'pending' | 'blocked'

export interface AgentTraceStep {
  state: AgentState
  status: AgentStepStatus
  title: string
  reasoning: string
  evidence: string[]
  at?: number
}

export interface AgentEvidence {
  materialId: string
  materialName: string
  locator: string
  excerpt: string
  score: number
}

export interface AgentAction {
  kind: 'chat' | 'quiz' | 'review'
  label: string
  path: string
  chapter: string
  prompt?: string
}

export interface LearningAgentRun {
  id: string
  subjectId: string
  subjectName: string
  createdAt: number
  updatedAt: number
  status: 'ready' | 'waiting_verification' | 'complete' | 'blocked'
  chapter?: string
  diagnosis?: LearningErrorType
  diagnosisLabel?: string
  masteryBefore?: number
  masteryAfter?: number
  predictedCorrect?: number
  attemptsAtStart: number
  evidence: AgentEvidence[]
  trace: AgentTraceStep[]
  intervention?: AgentAction
  verification?: AgentAction
  nextReviewAt?: number
  guardrails: string[]
}

export interface LearningAgentInput {
  subjectId: string
  subjectName: string
  materials: Material[]
  quizzes: QuizSession[]
  wrongQuestions: WrongQuestion[]
  chats?: ChatSession[]
}

const STORAGE_PREFIX = 'cs_learning_agent:v1:'

const ERROR_LABEL: Record<LearningErrorType, string> = {
  knowledge_gap: '知识缺口',
  careless: '粗心失误',
  misconception: '概念混淆',
  forgotten: '遗忘回退',
}

function step(
  state: AgentState,
  status: AgentStepStatus,
  title: string,
  reasoning: string,
  evidence: string[] = [],
  at?: number,
): AgentTraceStep {
  return { state, status, title, reasoning, evidence, at }
}

function interventionFor(chapter: string, diagnosis: LearningErrorType): AgentAction {
  if (diagnosis === 'careless') {
    return {
      kind: 'quiz',
      label: '开始限时验证',
      path: '/quiz',
      chapter,
    }
  }
  if (diagnosis === 'forgotten') {
    return {
      kind: 'review',
      label: '复习到期错题',
      path: '/wrong-book',
      chapter,
    }
  }
  const focus = diagnosis === 'misconception' ? '容易混淆的概念、区别与反例' : '核心概念、前置知识和一个例子'
  return {
    kind: 'chat',
    label: diagnosis === 'misconception' ? '进行对比讲解' : '先看证据讲解',
    path: '/chat',
    chapter,
    prompt: `请严格根据已上传资料讲解“${chapter}”，重点说明${focus}。资料中没有的内容请明确说明。`,
  }
}

function verificationFor(chapter: string): AgentAction {
  return {
    kind: 'quiz',
    label: '完成验证题',
    path: '/quiz',
    chapter,
  }
}

export function createLearningAgentRun(
  input: LearningAgentInput,
  now = Date.now(),
): LearningAgentRun {
  const guardrails = [
    '无课件证据时不生成确定性讲解',
    '未完成验证题时不更新掌握结论',
    '所有跳转和学习操作都需要用户确认',
  ]
  const tracing = buildKnowledgeTracingModel(input.quizzes, undefined, now)
  const baseline = buildStudentModel(input.quizzes, input.wrongQuestions, now)
  const target = tracing.trajectories[0]
  const fallbackChapter = input.wrongQuestions
    .filter((item) => !item.reviewed)
    .map((item) => item.question.chapter?.trim())
    .find(Boolean)
  const chapter = target?.chapter || fallbackChapter
  const trace: AgentTraceStep[] = [
    step(
      'observe',
      'completed',
      '观测学习状态',
      `读取 ${input.quizzes.length} 次测验、${input.wrongQuestions.length} 道错题和 ${input.materials.length} 份资料。`,
      [`BKT 可用作答记录 ${tracing.evaluation.sampleCount} 条`],
      now,
    ),
  ]

  if (!chapter) {
    trace.push(step('diagnose', 'blocked', '无法诊断', '尚无可用作答或错题记录，不伪造薄弱点。'))
    return {
      id: `${input.subjectId}:${now}`,
      subjectId: input.subjectId,
      subjectName: input.subjectName,
      createdAt: now,
      updatedAt: now,
      status: 'blocked',
      attemptsAtStart: 0,
      evidence: [],
      trace,
      guardrails,
    }
  }

  const baselineTarget = baseline.trajectories.find((item) => item.chapter === chapter)
  const diagnosis = baselineTarget?.dominantError || 'knowledge_gap'
  const attempts = target?.attempts || baselineTarget?.attempts || 0
  trace.push(step(
    'diagnose',
    'completed',
    `诊断为${ERROR_LABEL[diagnosis]}`,
    `选择“${chapter}”作为当前干预目标。`,
    [
      `BKT 掌握概率 ${target?.mastery ?? 0}%`,
      `下一题答对概率 ${target?.predictedCorrect ?? 0}%`,
      `作答证据 ${attempts} 次`,
    ],
    now,
  ))

  const chunks = chunkMaterials(input.materials, input.subjectId)
  const ranked = rankChunks(chunks, `${chapter} ${ERROR_LABEL[diagnosis]}`, {
    subjectId: input.subjectId,
    strategy: 'lexical-hybrid',
  }).filter((item) => item.score > 0).slice(0, 3)
  const evidence = ranked.map<AgentEvidence>(({ chunk, score }) => ({
    materialId: chunk.materialId,
    materialName: chunk.materialName,
    locator: chunkLocator(chunk),
    excerpt: chunk.text.replace(/\s+/g, ' ').slice(0, 160),
    score: Math.round(score * 100),
  }))
  if (evidence.length === 0) {
    trace.push(step('ground', 'blocked', '课件证据不足', `未在当前科目资料中定位“${chapter}”，已停止自动干预。`))
    return {
      id: `${input.subjectId}:${now}`,
      subjectId: input.subjectId,
      subjectName: input.subjectName,
      createdAt: now,
      updatedAt: now,
      status: 'blocked',
      chapter,
      diagnosis,
      diagnosisLabel: ERROR_LABEL[diagnosis],
      masteryBefore: target?.mastery,
      predictedCorrect: target?.predictedCorrect,
      attemptsAtStart: attempts,
      evidence: [],
      trace,
      guardrails,
    }
  }

  trace.push(
    step('ground', 'completed', '定位课件证据', `找到 ${evidence.length} 条当前科目内的可追溯证据。`, evidence.map((item) => `${item.materialName} · ${item.locator}`), now),
    step('intervene', 'ready', '选择个性化干预', `针对${ERROR_LABEL[diagnosis]}，先执行“${interventionFor(chapter, diagnosis).label}”。`),
    step('verify', 'pending', '验证是否学会', '干预后需要一次新的专项作答证据。'),
    step('update', 'pending', '更新 BKT', '只有新验证结果产生后才更新掌握概率。'),
    step('schedule', 'pending', '安排后续复习', '根据验证结果和错题调度计算下一次复习。'),
  )
  return {
    id: `${input.subjectId}:${now}`,
    subjectId: input.subjectId,
    subjectName: input.subjectName,
    createdAt: now,
    updatedAt: now,
    status: 'ready',
    chapter,
    diagnosis,
    diagnosisLabel: ERROR_LABEL[diagnosis],
    masteryBefore: target?.mastery,
    predictedCorrect: target?.predictedCorrect,
    attemptsAtStart: attempts,
    evidence,
    trace,
    intervention: interventionFor(chapter, diagnosis),
    verification: verificationFor(chapter),
    guardrails,
  }
}

export function startNextAgentAction(run: LearningAgentRun, now = Date.now()): LearningAgentRun {
  if (run.status === 'blocked' || run.status === 'complete') return run
  const intervention = run.trace.find((item) => item.state === 'intervene')
  const verification = run.trace.find((item) => item.state === 'verify')
  if (intervention?.status === 'ready') {
    return {
      ...run,
      updatedAt: now,
      status: 'waiting_verification',
      trace: run.trace.map((item) => item.state === 'intervene'
        ? { ...item, status: 'completed', at: now }
        : item.state === 'verify'
          ? { ...item, status: 'ready' }
          : item),
    }
  }
  if (verification?.status === 'ready') return { ...run, updatedAt: now, status: 'waiting_verification' }
  return run
}

export function reconcileLearningAgentRun(
  run: LearningAgentRun,
  input: LearningAgentInput,
  now = Date.now(),
): LearningAgentRun {
  if (run.status !== 'waiting_verification' || !run.chapter) return run
  const newQuestions = input.quizzes.flatMap((session) => {
    const at = session.last_attempt_at || session.created_at
    if (at <= run.createdAt) return []
    return session.questions.filter((question) =>
      question.user_answer?.trim() && (question.chapter?.trim() || '未分类知识点') === run.chapter,
    )
  })
  const reviewed = input.wrongQuestions.some((item) =>
    item.question.chapter?.trim() === run.chapter &&
    Boolean(item.review_schedule?.lastReviewedAt && item.review_schedule.lastReviewedAt > run.createdAt),
  )
  if (newQuestions.length === 0 && !reviewed) return run

  const tracing = buildKnowledgeTracingModel(input.quizzes, undefined, now)
  const target = tracing.trajectories.find((item) => item.chapter === run.chapter)
  const relevantSchedules = input.wrongQuestions
    .filter((item) => item.question.chapter?.trim() === run.chapter && item.review_schedule?.dueAt)
    .map((item) => item.review_schedule!.dueAt)
  const nextReviewAt = relevantSchedules.length ? Math.min(...relevantSchedules) : undefined
  return {
    ...run,
    updatedAt: now,
    status: 'complete',
    masteryAfter: target?.mastery,
    predictedCorrect: target?.predictedCorrect,
    nextReviewAt,
    trace: run.trace.map((item) => {
      if (item.state === 'verify') return { ...item, status: 'completed', reasoning: `已观测 ${newQuestions.length || 1} 条新验证证据。`, at: now }
      if (item.state === 'update') return { ...item, status: 'completed', reasoning: `BKT 掌握概率由 ${run.masteryBefore ?? '--'}% 更新为 ${target?.mastery ?? '--'}%。`, at: now }
      if (item.state === 'schedule') return { ...item, status: 'completed', reasoning: nextReviewAt ? `下一次复习已安排到 ${new Date(nextReviewAt).toLocaleDateString('zh-CN')}。` : '验证已完成，暂无到期错题调度。', at: now }
      return item
    }),
  }
}

export function nextAgentAction(run: LearningAgentRun): AgentAction | undefined {
  if (run.status === 'blocked' || run.status === 'complete') return undefined
  if (run.trace.find((item) => item.state === 'intervene')?.status === 'ready') return run.intervention
  if (run.trace.find((item) => item.state === 'verify')?.status === 'ready') return run.verification
  return undefined
}

export function loadLearningAgentRun(subjectId: string): LearningAgentRun | null {
  try {
    return JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}${subjectId}`) || 'null') as LearningAgentRun | null
  } catch {
    return null
  }
}

export function saveLearningAgentRun(run: LearningAgentRun): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${run.subjectId}`, JSON.stringify(run))
  } catch {
    // 持久化失败不影响当前计划执行
  }
}
