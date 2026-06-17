// 全局类型声明：window.api（由 preload 通过 contextBridge 暴露）
import type {
  ApiConfig,
  Subject,
  Material,
  ChatSession,
  ReviewDoc,
  QuizSession,
  FileFilter,
} from './shared/types';

export interface ElectronAPI {
  getConfig(): Promise<ApiConfig>;
  saveConfig(cfg: ApiConfig): Promise<boolean>;
  listSubjects(): Promise<Subject[]>;
  createSubject(name: string, color: string): Promise<Subject>;
  deleteSubject(id: string): Promise<boolean>;
  uploadMaterials(subjectId: string, filePaths: string[]): Promise<Material[]>;
  getMaterials(subjectId: string): Promise<Material[]>;
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
  pickFiles(filters?: FileFilter[]): Promise<string[]>;
  openExternal(url: string): Promise<boolean>;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}

export {};
