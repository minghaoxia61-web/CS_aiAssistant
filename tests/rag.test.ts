import test from 'node:test'
import assert from 'node:assert/strict'
import { chunkLocator, chunksToContext, chunkText, retrieveChunks, type Chunk } from '../src/lib/rag'

const chunks: Chunk[] = [
  {
    materialId: 'os',
    materialName: '操作系统.md',
    subjectId: 'subject-1',
    index: 0,
    text: '进程是资源分配的基本单位，线程是 CPU 调度的基本单位。',
    tokens: 24,
  },
  {
    materialId: 'db',
    materialName: '数据库.md',
    subjectId: 'subject-1',
    index: 0,
    text: '数据库事务具有原子性、一致性、隔离性和持久性。',
    tokens: 22,
  },
  {
    materialId: 'net',
    materialName: '计算机网络.md',
    subjectId: 'subject-1',
    index: 0,
    text: 'TCP 提供可靠的面向连接传输，UDP 是无连接协议。',
    tokens: 20,
  },
]

test('RAG 优先召回与问题关键词相关的资料', () => {
  const result = retrieveChunks(chunks, '进程和线程有什么区别', 100, 'subject-1', 2, 1)
  assert.equal(result[0]?.materialId, 'os')
})

test('RAG 严格隔离不同科目的分块', () => {
  const foreign: Chunk = { ...chunks[0], materialId: 'foreign', subjectId: 'subject-2' }
  const result = retrieveChunks([...chunks, foreign], '进程', 100, 'subject-1', 4, 1)
  assert.ok(result.every((chunk) => chunk.subjectId === 'subject-1'))
})

test('上下文包含可辨识的资料名称', () => {
  const context = chunksToContext([chunks[1]])
  assert.match(context, /数据库\.md/)
  assert.match(context, /原子性/)
})

test('PDF 页码标记会转为可读引用且不会污染正文', () => {
  const [chunk] = chunkText(
    '[[PAGE:3]]\n进程是资源分配的基本单位。\n\n[[PAGE:4]]\n线程是调度的基本单位。',
    'os',
    '操作系统.pdf',
    'subject-1',
  )
  assert.equal(chunk.pageStart, 3)
  assert.equal(chunk.pageEnd, 4)
  assert.equal(chunkLocator(chunk), '第 3–4 页')
  assert.doesNotMatch(chunk.text, /\[\[PAGE:/)
})

test('幻灯片定位使用幻灯片编号', () => {
  const [chunk] = chunkText('[[SLIDE:7]]\n栈遵循后进先出原则。', 'ds', '数据结构.pptx')
  assert.equal(chunkLocator(chunk), '幻灯片 7')
})
