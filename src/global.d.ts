// 全局类型声明：window.api（由 preload 通过 contextBridge 暴露）
import type {
  ApiConfig,
  ApiConfigItem,
  Subject,
  Material,
  ChatSession,
  ReviewDoc,
  QuizSession,
  WrongQuestion,
  FileFilter,
  LlmStreamOptions,
  LlmTokenEvent,
  LlmDoneEvent,
  LlmErrorEvent,
  UserProfile,
  TaskProgress,
} from './shared/types';

export interface ElectronAPI {
  getConfig(): Promise<ApiConfig>;
  saveConfig(cfg: ApiConfig): Promise<boolean>;
  listConfigs(): Promise<ApiConfigItem[]>;
  saveConfigItem(item: Partial<ApiConfigItem> & { id?: string }): Promise<ApiConfigItem>;
  deleteConfigItem(id: string): Promise<boolean>;
  setActiveConfig(id: string): Promise<ApiConfig>;
  listSubjects(): Promise<Subject[]>;
  createSubject(name: string, color: string): Promise<Subject>;
  deleteSubject(id: string): Promise<boolean>;
  uploadMaterials(subjectId: string, filePaths: string[]): Promise<Material[]>;
  getMaterials(subjectId: string): Promise<Material[]>;
  updateMaterial(id: string, patch: Partial<Material>): Promise<boolean>;
  deleteMaterial(id: string): Promise<boolean>;
  onMaterialUpdated(cb: (payload: { id: string; status: string; filetype?: string }) => void): () => void;
  listChatSessions(subjectId: string): Promise<ChatSession[]>;
  saveChatSession(session: ChatSession): Promise<boolean>;
  deleteChatSession(id: string): Promise<boolean>;
  saveReviewDoc(doc: ReviewDoc): Promise<boolean>;
  listReviewDocs(subjectId: string): Promise<ReviewDoc[]>;
  deleteReviewDoc(id: string): Promise<boolean>;
  saveQuizSession(session: QuizSession): Promise<boolean>;
  listQuizSessions(subjectId: string): Promise<QuizSession[]>;
  deleteQuizSession(id: string): Promise<boolean>;
  // 错题本
  listWrongQuestions(subjectId?: string): Promise<WrongQuestion[]>;
  addWrongQuestion(wq: WrongQuestion): Promise<boolean>;
  deleteWrongQuestion(id: string): Promise<boolean>;
  markWrongReviewed(id: string, reviewed: boolean): Promise<boolean>;
  generateWrongQuiz(subjectId: string, count: number): Promise<WrongQuestion[]>;
  // 用户个人信息
  getProfile(): Promise<UserProfile>;
  saveProfile(profile: UserProfile): Promise<boolean>;
  // LLM
  llmStream(opts: LlmStreamOptions): Promise<string>;
  llmAbort(requestId: string): Promise<boolean>;
  llmJSON(opts: LlmStreamOptions): Promise<{ ok: true; content: string } | { ok: false; error: string }>;
  onLlmToken(cb: (payload: LlmTokenEvent) => void): () => void;
  onLlmDone(cb: (payload: LlmDoneEvent) => void): () => void;
  onLlmError(cb: (payload: LlmErrorEvent) => void): () => void;
  // 异步后台任务队列
  parseBatch(files: { path: string; type: string }[]): Promise<string>;
  onTaskProgress(cb: (progress: TaskProgress) => void): () => void;
  cancelTask(taskId: string): Promise<void>;
  clearParseCache(): Promise<void>;
  // 科目检索索引持久化缓存
  saveSubjectIndex(subjectId: string, indexData: unknown): Promise<boolean>;
  loadSubjectIndex(subjectId: string): Promise<unknown | undefined>;
  // 缓存清理（chunks/index/chats）
  clearCache(types: string[]): Promise<boolean>;
  // 系统
  pickFiles(filters?: FileFilter[]): Promise<string[]>;
  openExternal(url: string): Promise<boolean>;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}

export {};
