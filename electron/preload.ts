// Preload 脚本：通过 contextBridge 暴露安全 IPC API
import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type FileFilter, type LlmStreamOptions, type LlmTokenEvent, type LlmDoneEvent, type LlmErrorEvent, type ApiConfigItem, type ApiConfig } from '../src/shared/types';

const api = {
  // 配置
  getConfig: () => ipcRenderer.invoke(IPC.GET_CONFIG),
  saveConfig: (cfg: ApiConfig) => ipcRenderer.invoke(IPC.SAVE_CONFIG, cfg),
  listConfigs: () => ipcRenderer.invoke(IPC.LIST_CONFIGS) as Promise<ApiConfigItem[]>,
  saveConfigItem: (item: Partial<ApiConfigItem> & { id?: string }) =>
    ipcRenderer.invoke(IPC.SAVE_CONFIG_ITEM, item) as Promise<ApiConfigItem>,
  deleteConfigItem: (id: string) => ipcRenderer.invoke(IPC.DELETE_CONFIG_ITEM, id),
  setActiveConfig: (id: string) => ipcRenderer.invoke(IPC.SET_ACTIVE_CONFIG, id) as Promise<ApiConfig>,

  // 科目
  listSubjects: () => ipcRenderer.invoke(IPC.LIST_SUBJECTS),
  createSubject: (name: string, color: string) =>
    ipcRenderer.invoke(IPC.CREATE_SUBJECT, name, color),
  deleteSubject: (id: string) => ipcRenderer.invoke(IPC.DELETE_SUBJECT, id),

  // 资料
  uploadMaterials: (subjectId: string, filePaths: string[]) =>
    ipcRenderer.invoke(IPC.UPLOAD_MATERIALS, subjectId, filePaths),
  getMaterials: (subjectId: string) => ipcRenderer.invoke(IPC.GET_MATERIALS, subjectId),
  deleteMaterial: (id: string) => ipcRenderer.invoke(IPC.DELETE_MATERIAL, id),
  onMaterialUpdated: (cb: (payload: { id: string; status: string; filetype?: string }) => void) => {
    const handler = (_e: unknown, payload: { id: string; status: string; filetype?: string }) => cb(payload);
    ipcRenderer.on('material:updated', handler);
    return () => ipcRenderer.removeListener('material:updated', handler);
  },

  // 对话
  listChatSessions: (subjectId: string) => ipcRenderer.invoke(IPC.LIST_CHAT_SESSIONS, subjectId),
  saveChatSession: (session: unknown) => ipcRenderer.invoke(IPC.SAVE_CHAT_SESSION, session),
  deleteChatSession: (id: string) => ipcRenderer.invoke(IPC.DELETE_CHAT_SESSION, id),

  // 复习
  saveReviewDoc: (doc: unknown) => ipcRenderer.invoke(IPC.SAVE_REVIEW_DOC, doc),
  listReviewDocs: (subjectId: string) => ipcRenderer.invoke(IPC.LIST_REVIEW_DOCS, subjectId),
  deleteReviewDoc: (id: string) => ipcRenderer.invoke(IPC.DELETE_REVIEW_DOC, id),

  // 测验
  saveQuizSession: (session: unknown) => ipcRenderer.invoke(IPC.SAVE_QUIZ_SESSION, session),
  listQuizSessions: (subjectId: string) => ipcRenderer.invoke(IPC.LIST_QUIZ_SESSIONS, subjectId),
  deleteQuizSession: (id: string) => ipcRenderer.invoke(IPC.DELETE_QUIZ_SESSION, id),

  // LLM 调用（主进程转发）
  llmStream: (opts: LlmStreamOptions) => ipcRenderer.invoke(IPC.LLM_STREAM, opts),
  llmAbort: (requestId: string) => ipcRenderer.invoke(IPC.LLM_ABORT, requestId),
  llmJSON: (opts: LlmStreamOptions) =>
    ipcRenderer.invoke(IPC.LLM_JSON, opts) as Promise<{ ok: true; content: string } | { ok: false; error: string }>,
  onLlmToken: (cb: (payload: LlmTokenEvent) => void) => {
    const handler = (_e: unknown, payload: LlmTokenEvent) => cb(payload);
    ipcRenderer.on('llm:token', handler);
    return () => ipcRenderer.removeListener('llm:token', handler);
  },
  onLlmDone: (cb: (payload: LlmDoneEvent) => void) => {
    const handler = (_e: unknown, payload: LlmDoneEvent) => cb(payload);
    ipcRenderer.on('llm:done', handler);
    return () => ipcRenderer.removeListener('llm:done', handler);
  },
  onLlmError: (cb: (payload: LlmErrorEvent) => void) => {
    const handler = (_e: unknown, payload: LlmErrorEvent) => cb(payload);
    ipcRenderer.on('llm:error', handler);
    return () => ipcRenderer.removeListener('llm:error', handler);
  },

  // 系统
  pickFiles: (filters?: FileFilter[]) => ipcRenderer.invoke(IPC.PICK_FILES, filters),
  openExternal: (url: string) => ipcRenderer.invoke(IPC.OPEN_EXTERNAL, url),
};

contextBridge.exposeInMainWorld('api', api);

export type ElectronAPI = typeof api;
