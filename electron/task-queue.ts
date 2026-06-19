// 异步后台任务队列：管理文件解析与 AI 生成任务
// - 最大并发数 2（worker_threads 池）
// - 批量文件（>10 份）自动拆分为每批 5 份，批次顺序执行
// - 文件解析缓存：MD5 哈希，命中则跳过解析
// - 任务状态：pending | running | done | error | cancelled
import { Worker } from 'worker_threads';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { app } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import type { ApiConfig, LlmMessage, TaskProgress } from '../src/shared/types';

const MAX_CONCURRENCY = 2;   // 最大并发 worker 数
const BATCH_SIZE = 5;        // 每批文件数
const BATCH_THRESHOLD = 10;  // 超过此数量才拆批

type TaskType = 'parse' | 'generate';
type TaskStatus = 'pending' | 'running' | 'done' | 'error' | 'cancelled';

export interface ParseFileInput {
  path: string;
  type: string;
}

export interface EnqueueOptions {
  type: TaskType;
  files?: ParseFileInput[];   // parse 任务
  config?: ApiConfig;         // generate 任务
  messages?: LlmMessage[];    // generate 任务
  temperature?: number;
  maxTokens?: number;
}

interface QueueTask {
  id: string;
  type: TaskType;
  status: TaskStatus;
  // parse
  batches: ParseFileInput[][];  // 拆分后的批次
  currentBatch: number;         // 当前批次索引
  // generate
  config?: ApiConfig;
  messages?: LlmMessage[];
  temperature?: number;
  maxTokens?: number;
  // 结果与进度
  results: unknown[];
  error?: string;
  completed: number;
  total: number;
  cancelled: boolean;
  activeWorkers: Map<string, Worker>;  // unitId -> Worker
}

// ---------- Worker 消息类型（与 worker.ts 对齐） ----------
interface StartParseMessage {
  kind: 'start';
  taskId: string;
  type: 'parse';
  filePath: string;
}

interface StartGenerateMessage {
  kind: 'start';
  taskId: string;
  type: 'generate';
  config: ApiConfig;
  messages: LlmMessage[];
  temperature?: number;
  maxTokens?: number;
}

interface CancelMessage {
  kind: 'cancel';
  taskId: string;
}

interface WorkerMessage {
  taskId: string;
  event: 'progress' | 'token' | 'done' | 'error';
  current?: number;
  total?: number;
  message?: string;
  result?: unknown;
  token?: string;
}

// ---------- 状态 ----------
const tasks = new Map<string, QueueTask>();
const pendingQueue: { taskId: string; unitId: string }[] = [];
const runningWorkers = new Map<string, Worker>();  // unitId -> Worker
const progressCallbacks = new Set<(progress: TaskProgress) => void>();

// ---------- 解析缓存 ----------
interface ParseCacheEntry {
  hash: string;
  text: string;
  filetype: string;
  parsedAt: number;
}
const parseCache = new Map<string, ParseCacheEntry>();

function getCacheDir(): string {
  const dir = path.join(app.getPath('userData'), 'data', 'parse-cache');
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    console.error('创建解析缓存目录失败:', err);
  }
  return dir;
}

function fileHash(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(buffer).digest('hex');
}

function getCache(hash: string): ParseCacheEntry | undefined {
  const mem = parseCache.get(hash);
  if (mem) return mem;
  const cachePath = path.join(getCacheDir(), `${hash}.json`);
  if (fs.existsSync(cachePath)) {
    try {
      const entry = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as ParseCacheEntry;
      parseCache.set(hash, entry);
      return entry;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function setCache(hash: string, text: string, filetype: string): void {
  const entry: ParseCacheEntry = { hash, text, filetype, parsedAt: Date.now() };
  parseCache.set(hash, entry);
  try {
    fs.writeFileSync(path.join(getCacheDir(), `${hash}.json`), JSON.stringify(entry, null, 2), 'utf-8');
  } catch (err) {
    console.error('写入解析缓存失败:', err);
  }
}

export function clearParseCache(): void {
  parseCache.clear();
  const dir = getCacheDir();
  try {
    if (fs.existsSync(dir)) {
      for (const file of fs.readdirSync(dir)) {
        fs.unlinkSync(path.join(dir, file));
      }
    }
  } catch (err) {
    console.error('清理解析缓存失败:', err);
  }
}

// ---------- 进度通知 ----------
function emitProgress(progress: TaskProgress): void {
  for (const cb of progressCallbacks) {
    try {
      cb(progress);
    } catch (err) {
      console.error('进度回调异常:', err);
    }
  }
}

export function onProgress(cb: (progress: TaskProgress) => void): () => void {
  progressCallbacks.add(cb);
  return () => {
    progressCallbacks.delete(cb);
  };
}

// ---------- 入队 ----------
export function enqueue(opts: EnqueueOptions): string {
  const id = uuidv4();
  const files = opts.files || [];

  // 拆分批次：>10 份时每批 5 份
  const batches: ParseFileInput[][] = [];
  if (opts.type === 'parse' && files.length > BATCH_THRESHOLD) {
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      batches.push(files.slice(i, i + BATCH_SIZE));
    }
  } else {
    batches.push(files);
  }

  const task: QueueTask = {
    id,
    type: opts.type,
    status: 'pending',
    batches,
    currentBatch: 0,
    config: opts.config,
    messages: opts.messages,
    temperature: opts.temperature,
    maxTokens: opts.maxTokens,
    results: [],
    completed: 0,
    total: opts.type === 'parse' ? files.length : 1,
    cancelled: false,
    activeWorkers: new Map(),
  };

  tasks.set(id, task);
  emitProgress({ taskId: id, type: task.type, status: 'pending', current: 0, total: task.total });

  // 入队第一批
  enqueueBatch(task);
  processQueue();

  return id;
}

function enqueueBatch(task: QueueTask): void {
  if (task.cancelled) return;
  if (task.currentBatch >= task.batches.length) return;
  const batch = task.batches[task.currentBatch];
  for (let i = 0; i < batch.length; i++) {
    pendingQueue.push({ taskId: task.id, unitId: `${task.id}-b${task.currentBatch}-i${i}` });
  }
}

// ---------- 队列调度 ----------
function processQueue(): void {
  while (runningWorkers.size < MAX_CONCURRENCY && pendingQueue.length > 0) {
    const { taskId, unitId } = pendingQueue.shift()!;
    const task = tasks.get(taskId);
    if (!task || task.cancelled) continue;
    startWorkUnit(task, unitId);
  }
}

function startWorkUnit(task: QueueTask, unitId: string): void {
  task.status = 'running';

  if (task.type === 'parse') {
    const batch = task.batches[task.currentBatch];
    const unitIndex = parseInt(unitId.split('-i')[1], 10);
    const file = batch[unitIndex];

    // 检查缓存
    try {
      const hash = fileHash(file.path);
      const cached = getCache(hash);
      if (cached) {
        task.results.push({ path: file.path, text: cached.text, filetype: cached.filetype, cached: true });
        task.completed++;
        emitProgress({
          taskId: task.id,
          type: task.type,
          status: 'running',
          current: task.completed,
          total: task.total,
          message: `缓存命中: ${file.path}`,
        });
        onUnitDone(task);
        return;
      }
      spawnParseWorker(task, unitId, file, hash);
    } catch (err) {
      task.results.push({ path: file.path, text: '', filetype: '', error: (err as Error).message });
      task.completed++;
      emitProgress({
        taskId: task.id,
        type: task.type,
        status: 'running',
        current: task.completed,
        total: task.total,
        message: `解析失败(哈希计算): ${file.path}`,
      });
      onUnitDone(task);
    }
  } else if (task.type === 'generate') {
    spawnGenerateWorker(task, unitId);
  }
}

function spawnParseWorker(task: QueueTask, unitId: string, file: ParseFileInput, hash: string): void {
  const worker = new Worker(path.join(__dirname, 'worker.js'));
  task.activeWorkers.set(unitId, worker);
  runningWorkers.set(unitId, worker);

  worker.on('message', (msg: WorkerMessage) => {
    if (msg.event === 'done') {
      const result = msg.result as { text: string; filetype: string } | undefined;
      if (result) {
        setCache(hash, result.text, result.filetype);
        task.results.push({ path: file.path, ...result, cached: false });
      } else {
        task.results.push({ path: file.path, text: '', filetype: '', error: '空结果' });
      }
      task.completed++;
      emitProgress({
        taskId: task.id,
        type: task.type,
        status: 'running',
        current: task.completed,
        total: task.total,
        message: `已解析: ${file.path}`,
      });
      cleanupWorker(task, unitId);
      onUnitDone(task);
    } else if (msg.event === 'error') {
      task.results.push({ path: file.path, text: '', filetype: '', error: msg.message });
      task.completed++;
      emitProgress({
        taskId: task.id,
        type: task.type,
        status: 'running',
        current: task.completed,
        total: task.total,
        message: `解析失败: ${file.path} - ${msg.message}`,
      });
      cleanupWorker(task, unitId);
      onUnitDone(task);
    }
  });

  worker.on('error', (err: Error) => {
    task.results.push({ path: file.path, text: '', filetype: '', error: err.message });
    task.completed++;
    emitProgress({
      taskId: task.id,
      type: task.type,
      status: 'running',
      current: task.completed,
      total: task.total,
      message: `Worker 异常: ${file.path} - ${err.message}`,
    });
    cleanupWorker(task, unitId);
    onUnitDone(task);
  });

  const startMsg: StartParseMessage = { kind: 'start', taskId: task.id, type: 'parse', filePath: file.path };
  worker.postMessage(startMsg);
}

function spawnGenerateWorker(task: QueueTask, unitId: string): void {
  const worker = new Worker(path.join(__dirname, 'worker.js'));
  task.activeWorkers.set(unitId, worker);
  runningWorkers.set(unitId, worker);

  worker.on('message', (msg: WorkerMessage) => {
    if (msg.event === 'token') {
      emitProgress({
        taskId: task.id,
        type: task.type,
        status: 'running',
        current: 0,
        total: 1,
        message: msg.token,
      });
    } else if (msg.event === 'done') {
      task.results.push(msg.result);
      task.completed++;
      task.status = 'done';
      emitProgress({
        taskId: task.id,
        type: task.type,
        status: 'done',
        current: 1,
        total: 1,
        result: msg.result,
      });
      cleanupWorker(task, unitId);
    } else if (msg.event === 'error') {
      task.error = msg.message;
      task.status = 'error';
      emitProgress({
        taskId: task.id,
        type: task.type,
        status: 'error',
        current: 0,
        total: 1,
        message: msg.message,
      });
      cleanupWorker(task, unitId);
    }
  });

  worker.on('error', (err: Error) => {
    task.error = err.message;
    task.status = 'error';
    emitProgress({
      taskId: task.id,
      type: task.type,
      status: 'error',
      current: 0,
      total: 1,
      message: err.message,
    });
    cleanupWorker(task, unitId);
  });

  const startMsg: StartGenerateMessage = {
    kind: 'start',
    taskId: task.id,
    type: 'generate',
    config: task.config!,
    messages: task.messages!,
    temperature: task.temperature,
    maxTokens: task.maxTokens,
  };
  worker.postMessage(startMsg);
}

function cleanupWorker(task: QueueTask, unitId: string): void {
  const worker = task.activeWorkers.get(unitId);
  if (worker) {
    task.activeWorkers.delete(unitId);
    runningWorkers.delete(unitId);
    worker.terminate().catch(() => {
      // 终止失败则忽略
    });
  }
}

function onUnitDone(task: QueueTask): void {
  if (task.cancelled) {
    finalizeTask(task);
    return;
  }

  // 判断当前批次是否全部完成
  const batchStart = task.batches.slice(0, task.currentBatch).reduce((sum, b) => sum + b.length, 0);
  const batchEnd = batchStart + task.batches[task.currentBatch].length;

  if (task.completed >= batchEnd) {
    // 当前批次完成，推进到下一批
    task.currentBatch++;
    if (task.currentBatch < task.batches.length) {
      enqueueBatch(task);
    } else {
      // 所有批次完成
      finalizeTask(task);
      return;
    }
  }

  processQueue();
}

function finalizeTask(task: QueueTask): void {
  if (task.activeWorkers.size > 0) return; // 还有 worker 在跑，等它们结束

  if (task.cancelled) {
    task.status = 'cancelled';
    emitProgress({
      taskId: task.id,
      type: task.type,
      status: 'cancelled',
      current: task.completed,
      total: task.total,
    });
  } else if (task.type === 'parse') {
    task.status = 'done';
    emitProgress({
      taskId: task.id,
      type: task.type,
      status: 'done',
      current: task.completed,
      total: task.total,
      result: task.results,
    });
  }
  // generate 任务的 done/error 状态在 spawnGenerateWorker 中已设置
}

// ---------- 取消 ----------
export function cancel(taskId: string): void {
  const task = tasks.get(taskId);
  if (!task) return;
  task.cancelled = true;
  task.status = 'cancelled';

  // 从待处理队列中移除
  for (let i = pendingQueue.length - 1; i >= 0; i--) {
    if (pendingQueue[i].taskId === taskId) {
      pendingQueue.splice(i, 1);
    }
  }

  // 取消活动 worker
  for (const [unitId, worker] of task.activeWorkers) {
    const cancelMsg: CancelMessage = { kind: 'cancel', taskId };
    worker.postMessage(cancelMsg);
    runningWorkers.delete(unitId);
    worker.terminate().catch(() => {
      // 终止失败则忽略
    });
  }
  task.activeWorkers.clear();

  emitProgress({
    taskId,
    type: task.type,
    status: 'cancelled',
    current: task.completed,
    total: task.total,
  });
}
