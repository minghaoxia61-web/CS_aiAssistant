// Worker 池管理：管理多个 Web Worker，任务队列 + 并发限制 + 取消
// 批量上传时排队处理，避免浏览器内存爆满
import type { TaskProgress } from '@/shared/types'

// ---------- 消息类型（与 rag-worker.ts 对齐） ----------
interface WorkerResponse {
  taskId: string
  event: 'progress' | 'done' | 'error'
  current?: number
  total?: number
  message?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result?: any
}

export interface ParseTaskResult {
  text: string
  filetype: string
}

export interface EmbedTaskResult {
  vectors: number[][]
}

interface QueuedTask {
  taskId: string
  kind: 'parse' | 'embed'
  // parse 参数
  buffer?: ArrayBuffer
  filename?: string
  // embed 参数
  texts?: string[]
  // 回调
  onProgress?: (p: TaskProgress) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resolve: (result: any) => void
  reject: (error: Error) => void
  // 分配的 worker 索引（运行时设置）
  workerIndex?: number
}

// ---------- Worker 池 ----------
const MAX_WORKERS = Math.min((navigator.hardwareConcurrency || 4) - 1, 2) || 1
let workers: Worker[] = []
let workerBusy: boolean[] = []
const taskQueue: QueuedTask[] = []
const activeTasks = new Map<string, QueuedTask>()
let initialized = false

/** 懒初始化 Worker 池（首次提交任务时创建） */
function ensureWorkers(): void {
  if (initialized) return
  initialized = true
  for (let i = 0; i < MAX_WORKERS; i++) {
    const worker = new Worker(new URL('../workers/rag-worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      handleWorkerMessage(i, e.data)
    }
    worker.onerror = (e) => {
      console.error(`Worker ${i} 错误:`, e.message)
    }
    workers.push(worker)
    workerBusy.push(false)
  }
}

/** 处理 Worker 返回的消息 */
function handleWorkerMessage(workerIndex: number, msg: WorkerResponse): void {
  const task = activeTasks.get(msg.taskId)
  if (!task) return

  if (msg.event === 'progress') {
    task.onProgress?.({
      taskId: msg.taskId,
      type: task.kind,
      status: 'running',
      current: msg.current || 0,
      total: msg.total || 1,
      message: msg.message,
    })
  } else if (msg.event === 'done') {
    if (msg.message === 'cancelled') {
      task.reject(new DOMException('Aborted', 'AbortError'))
    } else {
      task.resolve(msg.result)
    }
    finishTask(workerIndex, msg.taskId)
  } else if (msg.event === 'error') {
    task.reject(new Error(msg.message || '未知错误'))
    finishTask(workerIndex, msg.taskId)
  }
}

/** 完成任务：释放 Worker，处理队列 */
function finishTask(workerIndex: number, taskId: string): void {
  activeTasks.delete(taskId)
  workerBusy[workerIndex] = false
  // 处理队列中的下一个任务
  dispatchNext()
}

/** 分配队列中的任务到空闲 Worker */
function dispatchNext(): void {
  while (taskQueue.length > 0) {
    // 找一个空闲 Worker
    const idleIdx = workerBusy.findIndex((busy) => !busy)
    if (idleIdx === -1) break // 所有 Worker 都忙
    const task = taskQueue.shift()!
    task.workerIndex = idleIdx
    activeTasks.set(task.taskId, task)
    workerBusy[idleIdx] = true
    // 发送消息到 Worker
    if (task.kind === 'parse') {
      workers[idleIdx].postMessage({
        kind: 'parse',
        taskId: task.taskId,
        buffer: task.buffer,
        filename: task.filename,
      })
    } else if (task.kind === 'embed') {
      workers[idleIdx].postMessage({
        kind: 'embed',
        taskId: task.taskId,
        texts: task.texts,
      })
    }
  }
}

// ---------- 公开 API ----------
/**
 * 提交文件解析任务
 * @param file File 对象
 * @param onProgress 进度回调
 * @returns 解析结果（text + filetype）
 */
export async function submitParseTask(
  file: File,
  onProgress?: (p: TaskProgress) => void,
): Promise<ParseTaskResult> {
  ensureWorkers()
  const taskId = crypto.randomUUID()
  const buffer = await file.arrayBuffer()

  return new Promise<ParseTaskResult>((resolve, reject) => {
    const task: QueuedTask = {
      taskId,
      kind: 'parse',
      buffer,
      filename: file.name,
      onProgress,
      resolve,
      reject,
    }
    taskQueue.push(task)
    dispatchNext()
  })
}

/**
 * 提交批量向量化任务
 * @param texts 待向量化的文本数组
 * @param onProgress 进度回调
 * @returns 向量数组（每个文本对应一个 384 维向量）
 */
export async function submitEmbedTask(
  texts: string[],
  onProgress?: (p: TaskProgress) => void,
): Promise<EmbedTaskResult> {
  ensureWorkers()
  const taskId = crypto.randomUUID()

  return new Promise<EmbedTaskResult>((resolve, reject) => {
    const task: QueuedTask = {
      taskId,
      kind: 'embed',
      texts,
      onProgress,
      resolve: (vectors: number[][]) => resolve({ vectors }),
      reject,
    }
    taskQueue.push(task)
    dispatchNext()
  })
}

/** 取消指定任务 */
export function cancelTask(taskId: string): void {
  // 从队列中移除
  const queueIdx = taskQueue.findIndex((t) => t.taskId === taskId)
  if (queueIdx >= 0) {
    const task = taskQueue.splice(queueIdx, 1)[0]
    task.reject(new DOMException('Aborted', 'AbortError'))
    return
  }
  // 通知 Worker 取消
  if (activeTasks.has(taskId)) {
    for (const worker of workers) {
      worker.postMessage({ kind: 'cancel', taskId })
    }
  }
}

/** 取消所有任务 */
export function cancelAllTasks(): void {
  // 移除所有队列任务
  while (taskQueue.length > 0) {
    const task = taskQueue.shift()!
    task.reject(new DOMException('Aborted', 'AbortError'))
  }
  // 取消所有活动任务
  for (const taskId of activeTasks.keys()) {
    for (const worker of workers) {
      worker.postMessage({ kind: 'cancel', taskId })
    }
  }
}

/** 获取 Worker 池状态 */
export function getPoolStatus(): {
  maxWorkers: number
  busyWorkers: number
  queuedTasks: number
  activeTasks: number
} {
  return {
    maxWorkers: MAX_WORKERS,
    busyWorkers: workerBusy.filter((b) => b).length,
    queuedTasks: taskQueue.length,
    activeTasks: activeTasks.size,
  }
}
