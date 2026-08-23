import assert from 'node:assert/strict'
import test from 'node:test'
import {
  executeStructuredWithRepair,
  parseJsonArray,
  validateStructuredOutput,
} from '../src/lib/structured-output'

const validQuiz = JSON.stringify([{
  type: 'single',
  question: '进程与线程的区别是什么？',
  options: ['资源分配单位与调度单位', '没有区别'],
  answer: '资源分配单位与调度单位',
  explanation: '进程拥有资源，线程参与调度。',
  chapter: '进程与线程',
}])

test('结构化解析兼容 JSON Markdown 代码块并输出规范 JSON', () => {
  const result = validateStructuredOutput(`说明\n\`\`\`json\n${validQuiz}\n\`\`\``, 'quiz')
  assert.deepEqual(parseJsonArray(result), JSON.parse(validQuiz))
})

test('结构化校验拒绝缺少答案和解析的残缺题目', () => {
  assert.throws(
    () => validateStructuredOutput('[{"type":"single","question":"题目","options":[]}]', 'quiz'),
    /缺少 answer/,
  )
})

test('结构化校验拒绝被截断的数组长度', () => {
  assert.throws(() => validateStructuredOutput(validQuiz, 'quiz', 2), /期望 2 项/)
})

test('首次无效时只进行一次低温修复并返回调用元数据', async () => {
  let calls = 0
  const result = await executeStructuredWithRepair('quiz', async (repair) => {
    calls += 1
    if (!repair) return '不是 JSON'
    assert.match(repair.prompt, /未通过程序校验/)
    return validQuiz
  })
  assert.equal(calls, 2)
  assert.equal(result.attempts, 2)
  assert.equal(result.repaired, true)
})

test('合法结构化输出不会产生额外模型调用', async () => {
  let calls = 0
  const result = await executeStructuredWithRepair('flashcards', async () => {
    calls += 1
    return '[{"q":"TCP 是什么？","a":"面向连接的传输层协议"}]'
  })
  assert.equal(calls, 1)
  assert.equal(result.repaired, false)
})

test('修复结果仍不合法时明确失败', async () => {
  await assert.rejects(
    executeStructuredWithRepair('grade', async () => '[{"correct":"yes"}]'),
    /结构化输出校验失败/,
  )
})
