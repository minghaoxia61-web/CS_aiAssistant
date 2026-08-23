import {
  executeStructuredWithRepair,
  type StructuredOutputResult,
} from '../src/lib/structured-output'
import type { LlmStructuredKind } from '../src/shared/types'

interface Fixture {
  id: string
  kind: LlmStructuredKind
  initial: string
  repair?: string
  expected: 'accepted' | 'repaired' | 'rejected'
}

const quiz = '[{"type":"single","question":"TCP 位于哪一层？","options":["传输层","网络层"],"answer":"传输层","explanation":"TCP 是传输层协议。","chapter":"计算机网络"}]'
const grade = '[{"correct":true,"explanation":"答案与标准答案一致。","score":100}]'
const cards = '[{"q":"什么是死锁？","a":"多个进程循环等待彼此持有的资源。"}]'
const graph = '[{"nodes":[{"key":"n1","title":"进程","kind":"concept","definition":"资源分配单位","evidence":"进程是资源分配的基本单位","material":"操作系统.md"}],"edges":[]}]'

const fixtures: Fixture[] = [
  { id: 'valid-quiz', kind: 'quiz', initial: quiz, expected: 'accepted' },
  { id: 'fenced-quiz', kind: 'quiz', initial: `\`\`\`json\n${quiz}\n\`\`\``, expected: 'accepted' },
  { id: 'invalid-json-repair', kind: 'quiz', initial: '题目如下：TCP', repair: quiz, expected: 'repaired' },
  { id: 'missing-fields-repair', kind: 'quiz', initial: '[{"type":"single"}]', repair: quiz, expected: 'repaired' },
  { id: 'invalid-score-repair', kind: 'grade', initial: '[{"correct":true,"explanation":"好","score":120}]', repair: grade, expected: 'repaired' },
  { id: 'flashcard-repair', kind: 'flashcards', initial: '[{"q":"死锁"}]', repair: cards, expected: 'repaired' },
  { id: 'graph-repair', kind: 'semantic_graph', initial: '[{"nodes":[],"edges":[]}]', repair: graph, expected: 'repaired' },
  { id: 'reject-after-repair', kind: 'grade', initial: 'bad', repair: '[{"correct":"yes"}]', expected: 'rejected' },
]

const rows: Array<{ id: string; expected: string; actual: string; attempts: number; passed: boolean }> = []
for (const fixture of fixtures) {
  let calls = 0
  let result: StructuredOutputResult | undefined
  let rejected = false
  try {
    result = await executeStructuredWithRepair(fixture.kind, async () => {
      calls += 1
      return calls === 1 ? fixture.initial : (fixture.repair || fixture.initial)
    })
  } catch {
    rejected = true
  }
  const actual = rejected ? 'rejected' : result?.repaired ? 'repaired' : 'accepted'
  rows.push({
    id: fixture.id,
    expected: fixture.expected,
    actual,
    attempts: calls,
    passed: actual === fixture.expected && calls <= 2,
  })
}

console.log(`LLM structured reliability benchmark · ${fixtures.length} fault scenarios`)
console.table(rows)
const passed = rows.filter((row) => row.passed).length
console.log(`Pass rate: ${passed}/${rows.length} (${Math.round(passed / rows.length * 100)}%)`)
if (passed !== rows.length) process.exitCode = 1
