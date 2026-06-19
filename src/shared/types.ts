// 共享类型定义（主进程与渲染进程共用）

export interface ApiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  topP: number;
}

// 带元信息的 API 配置项（用于多配置管理）
export interface ApiConfigItem extends ApiConfig {
  id: string;
  name: string;
  createdAt: number;
}

export interface Subject {
  id: string;
  name: string;
  color: string;
  created_at: number;
}

export type MaterialStatus = 'pending' | 'parsing' | 'ready' | 'failed';

/** 资料标签：讲义/试卷/习题/笔记 */
export type MaterialTag = 'lecture' | 'exam' | 'exercise' | 'notes' | '';

export interface Material {
  id: string;
  subject_id: string;
  filename: string;
  filetype: string;
  size: number;
  status: MaterialStatus;
  text_content: string;
  created_at: number;
  /** 资料标签：lecture 讲义 / exam 试卷 / exercise 习题 / notes 笔记 */
  tag?: MaterialTag;
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

export type QuizQuestionType = 'single' | 'multiple' | 'short' | 'code';

/** 难度分层 */
export type QuizDifficulty = '基础' | '中档' | '综合大题';

/** 出题规则：题型占比配置 */
export type QuizRatios = Partial<Record<QuizQuestionType, number>>;

/** 自定义出题规则 */
export interface QuizGenRule {
  count: number;
  types: QuizQuestionType[];
  ratios: QuizRatios; // 题型占比（百分比，0-100），未指定则平均分配
  difficulty: QuizDifficulty;
  chapters?: string[]; // 定向章节关键词，为空则全资料出题
  wrongOnly?: boolean; // 仅从错题集中出题
}

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
  /** 标记为错题（用于错题集） */
  is_wrong?: boolean;
  /** 所属章节（用于定向复习） */
  chapter?: string;
  /** 单题耗时（秒），计时模式下统计 */
  time_spent?: number;
  /** 代码题/简答题得分（0-100），由 AI 批改给出 */
  score?: number;
  /** 代码题问题列表（语法/逻辑/复杂度） */
  issues?: CodeIssue[];
  /** 代码题分步标准实现 */
  standard_solution?: string;
  /** 简答题得分点（逐条标注是否得分及对应课件来源） */
  scoring_points?: ScoringPoint[];
}

/** 代码题批改问题项 */
export interface CodeIssue {
  type: 'syntax' | 'logic' | 'complexity';
  description: string;
  line?: number;
}

/** 简答题得分点 */
export interface ScoringPoint {
  point: string;
  awarded: boolean;
  /** 对应课件来源 */
  source?: string;
}

export interface QuizSession {
  id: string;
  subject_id: string;
  title: string;
  score: number;
  total: number;
  questions: QuizQuestion[];
  created_at: number;
  /** 试卷是否已保存为可复用模板 */
  saved?: boolean;
  /** 作答次数 */
  attempts?: number;
  /** 最近一次作答时间 */
  last_attempt_at?: number;
}

/** 错题本条目 */
export interface WrongQuestion {
  id: string;
  subject_id: string;
  quiz_session_id: string;
  question: QuizQuestion;
  user_answer: string;
  correct_answer: string;
  explanation?: string;
  source?: string; // 来源课件
  created_at: number;
  reviewed: boolean; // 是否已复习
  review_count: number;
  /** 难度（用于筛选，手动录入或从测验中继承） */
  difficulty?: QuizDifficulty;
}

export interface FileFilter {
  name: string;
  extensions: string[];
}

// 用户个人信息（AI 对话时参考）
export interface UserProfile {
  nickname: string;          // 昵称
  grade: string;             // 年级/身份（如：大三、考研党、在职复习）
  goal: string;              // 学习目标（如：期末冲刺、考研复试）
  weakAreas: string;         // 薄弱方向（如：操作系统、计组）
  preferredStyle: string;    // 偏好风格（如：简洁、详细、多举例）
}

// IPC 通道名常量
export const IPC = {
  GET_CONFIG: 'config:get',
  SAVE_CONFIG: 'config:save',
  LIST_CONFIGS: 'config:list',
  SAVE_CONFIG_ITEM: 'config:saveItem',
  DELETE_CONFIG_ITEM: 'config:deleteItem',
  SET_ACTIVE_CONFIG: 'config:setActive',
  GET_PROFILE: 'profile:get',
  SAVE_PROFILE: 'profile:save',
  LIST_SUBJECTS: 'subject:list',
  CREATE_SUBJECT: 'subject:create',
  DELETE_SUBJECT: 'subject:delete',
  UPLOAD_MATERIALS: 'material:upload',
  GET_MATERIALS: 'material:list',
  UPDATE_MATERIAL: 'material:update',
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
  LIST_WRONG_QUESTIONS: 'wrong:list',
  ADD_WRONG_QUESTION: 'wrong:add',
  DELETE_WRONG_QUESTION: 'wrong:delete',
  MARK_WRONG_REVIEWED: 'wrong:markReviewed',
  GENERATE_WRONG_QUIZ: 'wrong:generateQuiz',
  PICK_FILES: 'sys:pickFiles',
  OPEN_EXTERNAL: 'sys:openExternal',
  // LLM 调用（主进程转发，避免 CORS 并保护 API Key）
  LLM_STREAM: 'llm:stream',
  LLM_JSON: 'llm:json',
  LLM_ABORT: 'llm:abort',
  // 异步后台任务队列
  PARSE_BATCH: 'task:parse-batch',
  TASK_PROGRESS: 'task:progress',
  CANCEL_TASK: 'task:cancel',
  CLEAR_PARSE_CACHE: 'task:cache-clear',
  // 科目检索索引持久化缓存
  SAVE_SUBJECT_INDEX: 'index:save',
  LOAD_SUBJECT_INDEX: 'index:load',
  // 缓存清理（chunks/index/chats）
  CLEAR_CACHE: 'cache:clear',
} as const;

// LLM 调用相关类型
export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmStreamOptions {
  config: ApiConfig;
  messages: LlmMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface LlmTokenEvent {
  requestId: string;
  token: string;
}

export interface LlmDoneEvent {
  requestId: string;
  full: string;
}

export interface LlmErrorEvent {
  requestId: string;
  message: string;
}

// 异步后台任务队列：进度通知
export interface TaskProgress {
  taskId: string;
  type: string;            // 'parse' | 'generate'
  status: string;          // 'pending' | 'running' | 'done' | 'error' | 'cancelled'
  current: number;         // 已完成单元数
  total: number;           // 总单元数
  message?: string;        // 附加信息（如 token、缓存命中提示等）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result?: any;            // 任务完成时的结果
}
