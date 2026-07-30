import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateAnswerQuality, summarizeAnswerQuality } from '../src/lib/answer-evaluation'
import type { ChatCitation, ChatSession } from '../src/shared/types'

const citations: ChatCitation[] = [
  {
    materialId: 'os',
    materialName: '操作系统.pdf',
    excerpt: '进程是资源分配的基本单位，线程是 CPU 调度的基本单位。',
    rank: 1,
    locator: '第 12 页',
  },
]

test('有证据且引用编号有效的回答风险较低', () => {
  const result = evaluateAnswerQuality(
    '进程是资源分配的基本单位，线程是 CPU 调度的基本单位。[资料1]',
    citations,
  )
  assert.equal(result.citationValidity, 100)
  assert.equal(result.hallucinationRisk, 'low')
  assert.ok(result.evidenceAlignment >= 80)
})

test('没有证据时明确拒答可降低幻觉风险', () => {
  const result = evaluateAnswerQuality('当前资料未涉及这个知识点，无法从资料中得出答案。')
  assert.equal(result.refusalDetected, true)
  assert.notEqual(result.hallucinationRisk, 'high')
})

test('汇总指标会识别无证据却直接作答的高风险回答', () => {
  const sessions: ChatSession[] = [
    {
      id: 'chat-1',
      title: '测试',
      subject_id: 'subject-1',
      material_ids: [],
      created_at: 1,
      messages: [
        {
          id: 'answer-1',
          session_id: 'chat-1',
          role: 'assistant',
          content: '这是一个没有任何资料证据支持，但仍然给出大量确定性结论的回答。',
          created_at: 2,
        },
      ],
    },
  ]
  const result = summarizeAnswerQuality(sessions)
  assert.equal(result.evaluatedAnswers, 1)
  assert.equal(result.highRiskAnswers, 1)
  assert.equal(result.refusalAccuracy, 0)
})
