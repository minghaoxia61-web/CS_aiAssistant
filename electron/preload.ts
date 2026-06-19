// Preload 脚本：通过 contextBridge 暴露安全 IPC API
import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type FileFilter, type LlmStreamOptions, type LlmTokenEvent, type LlmDoneEvent, type LlmErrorEvent, type ApiConfigItem, type ApiConfig, type UserProfile, type WrongQuestion, type TaskProgress, type Material } from '../src/shared/types';

const api = {
  // 配置
  getConfig: () => ipcRenderer.invoke(IPC.GET_CONFIG),
  saveConfig: (cfg: ApiConfig) => ipcRenderer.invoke(IPC.SAVE_CONFIG, cfg),
  listConfigs: () => ipcRenderer.invoke(IPC.LIST_CONFIGS) as Promise<ApiConfigItem[]>,
  saveConfigItem: (item: Partial<ApiConfigItem> & { id?: string }) =>
    ipcRenderer.invoke(IPC.SAVE_CONFIG_ITEM, item) as Promise<ApiConfigItem>,
  deleteConfigItem: (id: string) => ipcRenderer.invoke(IPC.DELETE_CONFIG_ITEM, id),
  setActiveConfig: (id: string) => ipcRenderer.invoke(IPC.SET_ACTIVE_CONFIG, id) as Promise<ApiConfig>,

  // 用户个人信息
  getProfile: () => ipcRenderer.invoke(IPC.GET_PROFILE) as Promise<UserProfile>,
  saveProfile: (profile: UserProfile) => ipcRenderer.invoke(IPC.SAVE_PROFILE, profile),

  // 科目
  listSubjects: () => ipcRenderer.invoke(IPC.LIST_SUBJECTS),
  createSubject: (name: string, color: string) =>
    ipcRenderer.invoke(IPC.CREATE_SUBJECT, name, color),
  deleteSubject: (id: string) => ipcRenderer.invoke(IPC.DELETE_SUBJECT, id),

  // 资料
  uploadMaterials: (subjectId: string, filePaths: string[]) =>
    ipcRenderer.invoke(IPC.UPLOAD_MATERIALS, subjectId, filePaths),
  getMaterials: (subjectId: string) => ipcRenderer.invoke(IPC.GET_MATERIALS, subjectId),
  updateMaterial: (id: string, patch: Partial<Material>) =>
    ipcRenderer.invoke(IPC.UPDATE_MATERIAL, id, patch),
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

  // 错题本
  listWrongQuestions: (subjectId?: string) =>
    ipcRenderer.invoke(IPC.LIST_WRONG_QUESTIONS, subjectId) as Promise<WrongQuestion[]>,
  addWrongQuestion: (wq: WrongQuestion) => ipcRenderer.invoke(IPC.ADD_WRONG_QUESTION, wq),
  deleteWrongQuestion: (id: string) => ipcRenderer.invoke(IPC.DELETE_WRONG_QUESTION, id),
  markWrongReviewed: (id: string, reviewed: boolean) =>
    ipcRenderer.invoke(IPC.MARK_WRONG_REVIEWED, id, reviewed),
  generateWrongQuiz: (subjectId: string, count: number) =>
    ipcRenderer.invoke(IPC.GENERATE_WRONG_QUIZ, subjectId, count) as Promise<WrongQuestion[]>,

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

  // 异步后台任务队列
  parseBatch: (files: { path: string; type: string }[]) =>
    ipcRenderer.invoke(IPC.PARSE_BATCH, files) as Promise<string>,
  onTaskProgress: (cb: (progress: TaskProgress) => void) => {
    const handler = (_e: unknown, payload: TaskProgress) => cb(payload);
    ipcRenderer.on(IPC.TASK_PROGRESS, handler);
    return () => ipcRenderer.removeListener(IPC.TASK_PROGRESS, handler);
  },
  cancelTask: (taskId: string) =>
    ipcRenderer.invoke(IPC.CANCEL_TASK, taskId) as Promise<void>,
  clearParseCache: () =>
    ipcRenderer.invoke(IPC.CLEAR_PARSE_CACHE) as Promise<void>,

  // 科目检索索引持久化缓存
  saveSubjectIndex: (subjectId: string, indexData: unknown) =>
    ipcRenderer.invoke(IPC.SAVE_SUBJECT_INDEX, subjectId, indexData) as Promise<boolean>,
  loadSubjectIndex: (subjectId: string) =>
    ipcRenderer.invoke(IPC.LOAD_SUBJECT_INDEX, subjectId) as Promise<unknown | undefined>,

  // 缓存清理（chunks/index/chats）
  clearCache: (types: string[]) =>
    ipcRenderer.invoke(IPC.CLEAR_CACHE, types) as Promise<boolean>,

  // 系统
  pickFiles: (filters?: FileFilter[]) => ipcRenderer.invoke(IPC.PICK_FILES, filters),
  openExternal: (url: string) => ipcRenderer.invoke(IPC.OPEN_EXTERNAL, url),
};

contextBridge.exposeInMainWorld('api', api);

export type ElectronAPI = typeof api;
