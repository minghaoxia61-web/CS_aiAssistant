import test from 'node:test'
import assert from 'node:assert/strict'
import { chunksToContext, retrieveChunks, type Chunk } from '../src/lib/rag'

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
