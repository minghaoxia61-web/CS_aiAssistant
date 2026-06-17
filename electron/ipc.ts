// IPC 处理器注册（主进程）
import { ipcMain, dialog, BrowserWindow, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { IPC, type ApiConfig, type ApiConfigItem, type Material, type FileFilter, type LlmStreamOptions } from '../src/shared/types';
import * as store from './store';
import { getConfig, saveConfig, listConfigs, saveConfigItem, deleteConfigItem, setActiveConfig, getActiveConfigId } from './config';
import { parseFile, getFileType } from './parsers';
import { streamChat, chatJSON } from './llm';

const now = () => Date.now();

function getMainWindow(): BrowserWindow | undefined {
  const wins = BrowserWindow.getAllWindows();
  return wins[0];
}

function emit(channel: string, payload: unknown): void {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload);
  }
}

export function registerIpc(): void {
  // ---------- 配置 ----------
  ipcMain.handle(IPC.GET_CONFIG, () => getConfig());
  ipcMain.handle(IPC.SAVE_CONFIG, (_e, cfg: ApiConfig) => {
    saveConfig(cfg);
    return true;
  });
  // 多配置管理
  ipcMain.handle(IPC.LIST_CONFIGS, () => listConfigs());
  ipcMain.handle(IPC.SAVE_CONFIG_ITEM, (_e, item: Partial<ApiConfigItem> & { id?: string }) => {
    return saveConfigItem(item);
  });
  ipcMain.handle(IPC.DELETE_CONFIG_ITEM, (_e, id: string) => {
    deleteConfigItem(id);
    return true;
  });
  ipcMain.handle(IPC.SET_ACTIVE_CONFIG, (_e, id: string) => {
    setActiveConfig(id);
    return getConfig();
  });

  // ---------- 科目 ----------
  ipcMain.handle(IPC.LIST_SUBJECTS, () => store.listSubjects());
  ipcMain.handle(IPC.CREATE_SUBJECT, (_e, name: string, color: string) =>
    store.createSubject(name, color)
  );
  ipcMain.handle(IPC.DELETE_SUBJECT, (_e, id: string) => {
    store.deleteSubject(id);
    return true;
  });

  // ---------- 资料 ----------
  ipcMain.handle(
    IPC.UPLOAD_MATERIALS,
    async (_e, subjectId: string, filePaths: string[]) => {
      // 先创建 parsing 状态记录并立即返回
      const created: Material[] = filePaths.map((p) => {
        const stat = fs.statSync(p);
        const material: Material = {
          id: uuidv4(),
          subject_id: subjectId,
          filename: path.basename(p),
          filetype: getFileType(p),
          size: stat.size,
          status: 'parsing',
          text_content: '',
          created_at: now(),
        };
        store.addMaterial(material);
        return material;
      });

      // 异步解析，逐个更新并通过事件通知渲染进程
      created.forEach(async (m) => {
        try {
          const filePath = filePaths.find((p) => path.basename(p) === m.filename)!;
          const result = await parseFile(filePath);
          store.updateMaterial(m.id, {
            status: 'ready',
            text_content: result.text,
            filetype: result.filetype,
          });
          emit('material:updated', {
            id: m.id,
            status: 'ready',
            filetype: result.filetype,
          });
        } catch (err) {
          store.updateMaterial(m.id, { status: 'failed' });
          emit('material:updated', { id: m.id, status: 'failed' });
        }
      });

      return created;
    }
  );

  ipcMain.handle(IPC.GET_MATERIALS, (_e, subjectId: string) =>
    store.getMaterials(subjectId)
  );

  ipcMain.handle(IPC.DELETE_MATERIAL, (_e, id: string) => {
    store.deleteMaterial(id);
    return true;
  });

  // 获取资料全文（供渲染进程组装上下文，不单独建通道，复用 list 返回的 text_content）

  // ---------- 对话 ----------
  ipcMain.handle(IPC.LIST_CHAT_SESSIONS, (_e, subjectId: string) =>
    store.listChatSessions(subjectId)
  );
  ipcMain.handle(IPC.SAVE_CHAT_SESSION, (_e, session: unknown) => {
    store.saveChatSession(session as Parameters<typeof store.saveChatSession>[0]);
    return true;
  });
  ipcMain.handle(IPC.DELETE_CHAT_SESSION, (_e, id: string) => {
    store.deleteChatSession(id);
    return true;
  });

  // ---------- 复习资料 ----------
  ipcMain.handle(IPC.SAVE_REVIEW_DOC, (_e, doc: unknown) => {
    store.saveReviewDoc(doc as Parameters<typeof store.saveReviewDoc>[0]);
    return true;
  });
  ipcMain.handle(IPC.LIST_REVIEW_DOCS, (_e, subjectId: string) =>
    store.listReviewDocs(subjectId)
  );
  ipcMain.handle(IPC.DELETE_REVIEW_DOC, (_e, id: string) => {
    store.deleteReviewDoc(id);
    return true;
  });

  // ---------- 测验 ----------
  ipcMain.handle(IPC.SAVE_QUIZ_SESSION, (_e, session: unknown) => {
    store.saveQuizSession(session as Parameters<typeof store.saveQuizSession>[0]);
    return true;
  });
  ipcMain.handle(IPC.LIST_QUIZ_SESSIONS, (_e, subjectId: string) =>
    store.listQuizSessions(subjectId)
  );
  ipcMain.handle(IPC.DELETE_QUIZ_SESSION, (_e, id: string) => {
    store.deleteQuizSession(id);
    return true;
  });

  // ---------- 系统 ----------
  ipcMain.handle(IPC.PICK_FILES, async (_e, filters?: FileFilter[]) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: filters || [
        { name: '文档', extensions: ['pdf', 'docx', 'pptx', 'txt', 'md', 'doc'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle(IPC.OPEN_EXTERNAL, (_e, url: string) => {
    shell.openExternal(url);
    return true;
  });

  // ---------- LLM 调用（主进程转发） ----------
  // 记录每个进行中的流式请求，便于中止
  const activeStreams = new Map<string, { abort: () => void }>();

  // 流式对话：返回 requestId，token 通过 llm:token / llm:done / llm:error 事件推送
  ipcMain.handle(IPC.LLM_STREAM, (_e, opts: LlmStreamOptions) => {
    const requestId = uuidv4();
    const handle = streamChat(
      { config: opts.config, messages: opts.messages, temperature: opts.temperature, maxTokens: opts.maxTokens, stream: true },
      {
        onToken: (token) => emit('llm:token', { requestId, token }),
        onDone: (full) => {
          activeStreams.delete(requestId);
          emit('llm:done', { requestId, full });
        },
        onError: (message) => {
          activeStreams.delete(requestId);
          emit('llm:error', { requestId, message });
        },
      },
    );
    activeStreams.set(requestId, handle);
    return requestId;
  });

  // 中止流式请求
  ipcMain.handle(IPC.LLM_ABORT, (_e, reqId: string) => {
    const handle = activeStreams.get(reqId);
    if (handle) {
      handle.abort();
      activeStreams.delete(reqId);
    }
    return true;
  });

  // 非流式调用（用于出题/批改等结构化 JSON 输出）
  ipcMain.handle(IPC.LLM_JSON, async (_e, opts: LlmStreamOptions) => {
    try {
      const content = await chatJSON({
        config: opts.config,
        messages: opts.messages,
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
        stream: false,
      });
      return { ok: true, content };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });
}
