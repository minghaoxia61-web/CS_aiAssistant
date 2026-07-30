import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildAdaptivePlan,
  buildKnowledgeGraph,
  calculateMastery,
} from '../src/lib/learning-intelligence'
import { chunkMaterials } from '../src/lib/rag'
import { buildRagEvaluationCases, runRagBenchmark } from '../src/lib/rag-evaluation'
import type { Material, QuizSession, WrongQuestion } from '../src/shared/types'

const material: Material = {
  id: 'material-1',
  subject_id: 'subject-1',
  filename: '操作系统.md',
  filetype: 'md',
  size: 100,
  status: 'ready',
  text_content: `# 操作系统

## 进程

进程是资源分配的基本单位，拥有独立地址空间。

### 进程状态

进程可以处于就绪、运行和阻塞状态。

## 线程

线程是 CPU 调度的基本单位，同一进程内线程共享资源。

### 三次握手

三次握手用于建立 TCP 连接。`,
  created_at: 1,
}

test('课件标题会形成包含与前置关系', () => {
  const graph = buildKnowledgeGraph([material])
  assert.deepEqual(graph.nodes.map((node) => node.title), ['操作系统', '进程', '进程状态', '线程', '三次握手'])
  assert.ok(graph.edges.some((edge) => edge.type === 'contains'))
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.type === 'prerequisite' &&
        graph.nodes.find((node) => node.id === edge.from)?.title === '进程' &&
        graph.nodes.find((node) => node.id === edge.to)?.title === '线程',
    ),
  )
})

test('掌握度综合作答证据并优先安排薄弱知识点', () => {
  const graph = buildKnowledgeGraph([material])
  const session: QuizSession = {
    id: 'quiz-1',
    subject_id: 'subject-1',
    title: '测试',
    score: 1,
    total: 2,
    created_at: Date.now(),
    questions: [
      {
        id: 'q1',
        session_id: 'quiz-1',
        type: 'single',
        question: '进程是什么？',
        options: [],
        answer: '资源分配单位',
        user_answer: '不知道',
        correct: false,
        explanation: '',
        chapter: '进程',
        time_spent: 240,
      },
      {
        id: 'q2',
        session_id: 'quiz-1',
        type: 'single',
        question: '线程是什么？',
        options: [],
        answer: '调度单位',
        user_answer: '调度单位',
        correct: true,
        explanation: '',
        chapter: '线程',
        time_spent: 30,
      },
    ],
  }
  const mastery = calculateMastery(graph, [session])
  const process = mastery.find((item) => item.title === '进程')
  const thread = mastery.find((item) => item.title === '线程')
  assert.equal(process?.status, 'weak')
  assert.ok((thread?.score || 0) > (process?.score || 0))

  const plan = buildAdaptivePlan(mastery, [])
  assert.equal(plan[0].chapter, '进程')
  assert.equal(plan[0].kind, 'practice')
})

test('到期错题在自适应计划中拥有最高优先级', () => {
  const wrong: WrongQuestion = {
    id: 'wrong-1',
    subject_id: 'subject-1',
    quiz_session_id: 'quiz-1',
    question: {
      id: 'q1',
      session_id: 'quiz-1',
      type: 'single',
      question: '测试',
      options: [],
      answer: 'A',
      user_answer: 'B',
      correct: false,
      explanation: '',
      chapter: '进程',
    },
    user_answer: 'B',
    correct_answer: 'A',
    created_at: Date.now(),
    reviewed: false,
    review_count: 0,
  }
  const plan = buildAdaptivePlan([], [wrong])
  assert.equal(plan[0].kind, 'review')
})

test('RAG 基准计算 Hit@K 与 MRR', () => {
  const chunks = chunkMaterials([material], 'subject-1')
  const cases = buildRagEvaluationCases(chunks)
  const result = runRagBenchmark(chunks, cases, 'subject-1')
  assert.ok(result.caseCount > 0)
  assert.equal(result.hitAt5, 100)
  assert.ok(result.meanReciprocalRank > 0)
})
