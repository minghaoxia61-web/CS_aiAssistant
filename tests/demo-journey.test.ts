import assert from 'node:assert/strict'
import test from 'node:test'
import { DEMO_COURSES } from '../src/lib/demo-content'
import {
  createLearningAgentRun,
  reconcileLearningAgentRun,
  startNextAgentAction,
} from '../src/lib/learning-agent'
import { buildKnowledgeTracingModel } from '../src/lib/knowledge-tracing'
import { chunkMaterials, rankChunks } from '../src/lib/rag'
import type { Material, QuizSession } from '../src/shared/types'

function materials(): Material[] {
  return DEMO_COURSES.map((course, index) => ({
    id: `material-${index}`,
    subject_id: 'demo-subject',
    filename: course.fallbackName,
    filetype: 'md',
    size: course.fallbackText.length,
    status: 'ready',
    text_content: course.fallbackText,
    created_at: index + 1,
    tag: 'lecture',
  }))
}

function quiz(id: string, at: number, chapter: string, correct: boolean): QuizSession {
  return {
    id,
    subject_id: 'demo-subject',
    title: id,
    score: correct ? 1 : 0,
    total: 1,
    created_at: at,
    questions: [{
      id: `${id}-question`,
      session_id: id,
      type: 'single',
      question: `${chapter}测试题`,
      options: ['A', 'B'],
      answer: 'A',
      user_answer: correct ? 'A' : 'B',
      correct,
      explanation: '',
      chapter,
      time_spent: 60,
    }],
  }
}

test('四份内置课件在静态 PDF 全部缺失时仍可用', () => {
  assert.equal(DEMO_COURSES.length, 4)
  assert.equal(new Set(DEMO_COURSES.map((item) => item.chapter)).size, 4)
  for (const course of DEMO_COURSES) {
    assert.ok(course.fallbackText.length > 250, `${course.chapter} fallback is too short`)
    assert.match(course.fallbackName, /内置演示/)
  }
})

test('内置演示数据可完成检索、知识追踪与 Agent 验证闭环', () => {
  const demoMaterials = materials()
  const chunks = chunkMaterials(demoMaterials, 'demo-subject')
  const retrieval = rankChunks(chunks, '深度 k 的完全二叉树至少有多少节点', {
    subjectId: 'demo-subject',
    strategy: 'lexical-hybrid',
  })
  assert.match(retrieval[0].chunk.materialName, /树/)

  const before = [
    quiz('tree-1', 10, '树', false),
    quiz('tree-2', 20, '树', false),
    quiz('stack-1', 30, '栈与队列', true),
  ]
  const tracing = buildKnowledgeTracingModel(before, undefined, 100)
  assert.equal(tracing.trajectories[0].chapter, '树')

  const input = {
    subjectId: 'demo-subject',
    subjectName: '数据结构',
    materials: demoMaterials,
    quizzes: before,
    wrongQuestions: [],
    chats: [],
  }
  const run = createLearningAgentRun(input, 100)
  assert.equal(run.status, 'ready')
  assert.equal(run.chapter, '树')
  assert.ok(run.evidence.some((item) => item.materialName.includes('树')))

  const waiting = startNextAgentAction(run, 110)
  const completed = reconcileLearningAgentRun(
    waiting,
    { ...input, quizzes: [...before, quiz('tree-after', 200, '树', true)] },
    210,
  )
  assert.equal(completed.status, 'complete')
  assert.ok((completed.masteryAfter || 0) > (completed.masteryBefore || 0))
})
