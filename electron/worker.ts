// Worker 线程：在子线程中执行文件解析与 LLM 流式生成，避免阻塞主进程
// 通过 parentPort 与主进程通信：接收 start/cancel 指令，回传 progress/token/done/error 事件
import { parentPort } from 'worker_threads';
import { parseFile } from './parsers';
import { streamChat } from './llm';
import type { ApiConfig, LlmMessage } from '../src/shared/types';

// ---------- 主进程 → Worker 消息 ----------
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

type IncomingMessage = StartParseMessage | StartGenerateMessage | CancelMessage;

// ---------- Worker → 主进程 消息 ----------
interface WorkerMessage {
  taskId: string;
  event: 'progress' | 'token' | 'done' | 'error';
  current?: number;
  total?: number;
  message?: string;
  result?: unknown;
  token?: string;
}

function send(msg: WorkerMessage): void {
  parentPort?.postMessage(msg);
}

// 当前进行中的 abort 句柄（用于取消）
let activeAbort: { abort: () => void } | null = null;
// 是否已取消（用于 parse 任务忽略结果）
let cancelled = false;

parentPort?.on('message', (msg: IncomingMessage) => {
  if (msg.kind === 'cancel') {
    cancelled = true;
    if (activeAbort) {
      activeAbort.abort();
      activeAbort = null;
    }
    send({ taskId: msg.taskId, event: 'done', message: 'cancelled' });
    return;
  }

  // start
  cancelled = false;
  const { taskId, type } = msg;

  if (type === 'parse') {
    const { filePath } = msg as StartParseMessage;
    send({ taskId, event: 'progress', current: 0, total: 1, message: `开始解析: ${filePath}` });
    parseFile(filePath)
      .then((result) => {
        if (cancelled) return;
        send({ taskId, event: 'progress', current: 1, total: 1 });
        send({ taskId, event: 'done', result });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        send({ taskId, event: 'error', message: (err as Error).message });
      });
  } else if (type === 'generate') {
    const { config, messages, temperature, maxTokens } = msg as StartGenerateMessage;
    activeAbort = streamChat(
      { config, messages, temperature, maxTokens, stream: true },
      {
        onToken: (token) => {
          if (cancelled) return;
          send({ taskId, event: 'token', token });
        },
        onDone: (full) => {
          activeAbort = null;
          if (cancelled) return;
          send({ taskId, event: 'done', result: full });
        },
        onError: (message) => {
          activeAbort = null;
          if (cancelled) return;
          send({ taskId, event: 'error', message });
        },
      },
    );
  }
});

parentPort?.on('error', (err: Error) => {
  send({ taskId: '', event: 'error', message: `Worker 异常: ${err.message}` });
});
