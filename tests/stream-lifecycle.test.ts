import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'

import { abortOnPrematureResponseClose } from '../server/stream-lifecycle'

class FakeResponse extends EventEmitter {
  writableEnded = false
}

test('SSE 仅在响应提前断开时取消上游模型请求', () => {
  const premature = new FakeResponse()
  let prematureAborts = 0
  abortOnPrematureResponseClose(premature, () => { prematureAborts += 1 })
  premature.emit('close')
  assert.equal(prematureAborts, 1)

  const completed = new FakeResponse()
  let completedAborts = 0
  abortOnPrematureResponseClose(completed, () => { completedAborts += 1 })
  completed.writableEnded = true
  completed.emit('close')
  assert.equal(completedAborts, 0)
})
