// 共享类型定义（主进程与渲染进程共用）

export interface ApiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  topP: number;
}

export interface Subject {
  id: string;
  name: string;
  color: string;
  created_at: number;
}

export type MaterialStatus = 'pending' | 'parsing' | 'ready' | 'failed';

export interface Material {
  id: string;
  subject_id: string;
  filename: string;
  filetype: string;
  size: number;
  status: MaterialStatus;
  text_content: string;
  created_at: number;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: number;
}

export interface ChatSession {
  id: string;
  title: string;
  subject_id: string;
  material_ids: string[];
  messages: ChatMessage[];
  created_at: number;
}

export type ReviewDocType = 'summary' | 'outline' | 'flashcards';

export interface ReviewDoc {
  id: string;
  subject_id: string;
  type: ReviewDocType;
  title: string;
  content: string;
  created_at: number;
}

export type QuizQuestionType = 'single' | 'multiple' | 'short';

export interface QuizQuestion {
  id: string;
  session_id: string;
  type: QuizQuestionType;
  question: string;
  options: string[];
  answer: string;
  user_answer: string;
  correct: boolean;
  explanation: string;
}

export interface QuizSession {
  id: string;
  subject_id: string;
  title: string;
  score: number;
  total: number;
  questions: QuizQuestion[];
  created_at: number;
}

export interface FileFilter {
  name: string;
  extensions: string[];
}

// IPC 通道名常量
export const IPC = {
  GET_CONFIG: 'config:get',
  SAVE_CONFIG: 'config:save',
  LIST_SUBJECTS: 'subject:list',
  CREATE_SUBJECT: 'subject:create',
  DELETE_SUBJECT: 'subject:delete',
  UPLOAD_MATERIALS: 'material:upload',
  GET_MATERIALS: 'material:list',
  DELETE_MATERIAL: 'material:delete',
  LIST_CHAT_SESSIONS: 'chat:list',
  SAVE_CHAT_SESSION: 'chat:save',
  DELETE_CHAT_SESSION: 'chat:delete',
  SAVE_REVIEW_DOC: 'review:save',
  LIST_REVIEW_DOCS: 'review:list',
  DELETE_REVIEW_DOC: 'review:delete',
  SAVE_QUIZ_SESSION: 'quiz:save',
  LIST_QUIZ_SESSIONS: 'quiz:list',
  DELETE_QUIZ_SESSION: 'quiz:delete',
  PICK_FILES: 'sys:pickFiles',
  OPEN_EXTERNAL: 'sys:openExternal',
} as const;
