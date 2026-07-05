// Web 版数据存储（服务端）— 支持按用户隔离
// 分层存储（每用户独立目录）：
//   data/users/{userId}/db.json     —— subjects / materials(元数据) / reviewDocs / quizSessions / profile
//   data/users/{userId}/chunks/     —— 资料正文文本缓存
//   data/users/{userId}/index/      —— BM25/TF-IDF 索引特征
//   data/users/{userId}/chats/      —— 对话记录
// 知识库（共享，只读）：
//   data/knowledge/                 —— 种子注入的知识库文章
import * as fs from 'fs';
import * as path from 'path';
import { AsyncLocalStorage } from 'async_hooks';
import { v4 as uuidv4 } from 'uuid';
import type {
  Subject,
  Material,
  ChatSession,
  ReviewDoc,
  QuizSession,
  UserProfile,
  WrongQuestion,
} from '../src/shared/types';

type MaterialMeta = Omit<Material, 'text_content'>;

interface DBShape {
  subjects: Subject[];
  materials: MaterialMeta[];
  reviewDocs: ReviewDoc[];
  quizSessions: QuizSession[];
  wrongQuestions: WrongQuestion[];
  profile: UserProfile;
}

const DEFAULT_PROFILE: UserProfile = {
  nickname: '',
  grade: '',
  goal: '',
  weakAreas: '',
  preferredStyle: '',
};

const EMPTY_DB: DBShape = {
  subjects: [],
  materials: [],
  reviewDocs: [],
  quizSessions: [],
  wrongQuestions: [],
  profile: { ...DEFAULT_PROFILE },
};

export type CacheType = 'chunks' | 'index' | 'chats' | 'all';

// ---------- 按用户隔离的上下文 ----------
const SHARED_KEY = '__shared__'; // 知识库等共享数据
const userIdStorage = new AsyncLocalStorage<string>();

interface UserContext {
  key: string;
  baseDir: string;
  dbPath: string;
  chatsDir: string;
  chunksDir: string;
  indexDir: string;
  data: DBShape;
  textCache: Map<string, string>;
}

const contextCache = new Map<string, UserContext>();

function ensureDir(dir: string): string {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (err) {
    console.error(`创建目录失败 ${dir}:`, err);
  }
  return dir;
}

function getBaseDataDir(): string {
  return ensureDir(path.resolve(process.env.DATA_DIR || './data'));
}

/** 获取当前请求的用户 ID（或共享 key） */
function currentKey(): string {
  return userIdStorage.getStore() || SHARED_KEY;
}

/** 在指定 key 的上下文中执行 */
export function runAsUser<T>(userId: string, fn: () => T): T {
  return userIdStorage.run(userId, fn);
}

/** 在共享上下文中执行（用于知识库） */
export function runAsShared<T>(fn: () => T): T {
  return userIdStorage.run(SHARED_KEY, fn);
}

function getContext(): UserContext {
  const key = currentKey();
  const existing = contextCache.get(key);
  if (existing) return existing;

  const baseDir = key === SHARED_KEY
    ? ensureDir(path.join(getBaseDataDir(), 'knowledge'))
    : ensureDir(path.join(getBaseDataDir(), 'users', key));

  const dbPath = path.join(baseDir, 'db.json');
  const chatsDir = ensureDir(path.join(baseDir, 'chats'));
  const chunksDir = ensureDir(path.join(baseDir, 'chunks'));
  const indexDir = ensureDir(path.join(baseDir, 'index'));

  const textCache = new Map<string, string>();
  let data: DBShape;
  try {
    if (fs.existsSync(dbPath)) {
      const parsed = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
      data = { ...EMPTY_DB, ...parsed };
      // 迁移旧数据：把内嵌的 text_content 移到 chunks/
      let needPersist = false;
      for (const m of data.materials as unknown as Material[]) {
        if (m.text_content !== undefined) {
          writeJSON(path.join(chunksDir, `${m.id}.json`), {
            materialId: m.id,
            text_content: m.text_content,
            updated_at: Date.now(),
          });
          textCache.set(m.id, m.text_content);
          delete (m as unknown as { text_content?: string }).text_content;
          needPersist = true;
        }
      }
      if (needPersist) writeJSON(dbPath, data);
    } else {
      data = { ...EMPTY_DB };
      writeJSON(dbPath, data);
    }
  } catch (err) {
    console.error('初始化用户数据库失败，重置为空:', err);
    data = { ...EMPTY_DB };
    writeJSON(dbPath, data);
  }

  const userCtx: UserContext = { key, baseDir, dbPath, chatsDir, chunksDir, indexDir, data, textCache };
  contextCache.set(key, userCtx);
  return userCtx;
}

// 供内部函数使用的快捷别名
const ctx = getContext;

function readJSON<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch (err) {
    console.error(`读取 JSON 失败 ${filePath}:`, err);
    return fallback;
  }
}

function writeJSON(filePath: string, value: unknown): void {
  try {
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf-8');
  } catch (err) {
    console.error(`写入 JSON 失败 ${filePath}:`, err);
  }
}

// ---------- 初始化（仅用于共享知识库种子注入） ----------
export function initStore(): void {
  // 初始化共享上下文（知识库）
  runAsShared(() => {
    const c = getContext();
    if (!fs.existsSync(path.join(c.chatsDir, 'index.json'))) {
      rebuildChatIndex();
    }
  });
}

function persist(): void {
  const c = ctx();
  writeJSON(c.dbPath, c.data);
}

const now = () => Date.now();

// ---------- Subjects ----------
export function listSubjects(): Subject[] {
  return ctx().data.subjects.sort((a, b) => b.created_at - a.created_at);
}

export function createSubject(name: string, color: string): Subject {
  const c = ctx();
  const subject: Subject = {
    id: uuidv4(),
    name: name.trim() || '未命名科目',
    color: color || '#e8b974',
    created_at: now(),
  };
  c.data.subjects.push(subject);
  persist();
  return subject;
}

/** 创建固定 ID 的科目（用于知识库种子注入） */
export function createSubjectWithId(id: string, name: string, color: string): Subject {
  const c = ctx();
  const subject: Subject = {
    id,
    name: name.trim() || '未命名科目',
    color: color || '#e8b974',
    created_at: now(),
  };
  c.data.subjects.push(subject);
  persist();
  return subject;
}

export function deleteSubject(id: string): void {
  const c = ctx();
  const materialIds = c.data.materials.filter((m) => m.subject_id === id).map((m) => m.id);
  for (const mid of materialIds) {
    deleteMaterialText(mid);
  }
  c.data.subjects = c.data.subjects.filter((s) => s.id !== id);
  c.data.materials = c.data.materials.filter((m) => m.subject_id !== id);
  c.data.reviewDocs = c.data.reviewDocs.filter((r) => r.subject_id !== id);
  c.data.quizSessions = c.data.quizSessions.filter((q) => q.subject_id !== id);
  c.data.wrongQuestions = c.data.wrongQuestions.filter((w) => w.subject_id !== id);
  const sessions = listChatSessions(id);
  for (const s of sessions) {
    deleteChatSession(s.id);
  }
  deleteSubjectIndexFile(id);
  persist();
}

// ---------- Materials ----------
function withText(meta: MaterialMeta): Material {
  return { ...meta, text_content: getMaterialText(meta.id) };
}

export function getMaterials(subjectId: string): Material[] {
  const c = ctx();
  return c.data.materials
    .filter((m) => m.subject_id === subjectId)
    .map(withText)
    .sort((a, b) => b.created_at - a.created_at);
}

export function getMaterialById(id: string): Material | undefined {
  const c = ctx();
  const meta = c.data.materials.find((m) => m.id === id);
  return meta ? withText(meta) : undefined;
}

export function addMaterial(material: Material): void {
  const c = ctx();
  const { text_content, ...meta } = material;
  c.data.materials.push(meta);
  writeMaterialText(c, material.id, text_content || '');
  invalidateSubjectIndex(material.subject_id);
  persist();
}

export function updateMaterial(id: string, patch: Partial<Material>): void {
  const c = ctx();
  const idx = c.data.materials.findIndex((m) => m.id === id);
  if (idx < 0) return;
  const { text_content, ...metaPatch } = patch;
  if (text_content !== undefined) {
    writeMaterialText(c, id, text_content);
  }
  c.data.materials[idx] = { ...c.data.materials[idx], ...metaPatch };
  if (text_content !== undefined) {
    invalidateSubjectIndex(c.data.materials[idx].subject_id);
  }
  persist();
}

export function deleteMaterial(id: string): void {
  const c = ctx();
  const meta = c.data.materials.find((m) => m.id === id);
  c.data.materials = c.data.materials.filter((m) => m.id !== id);
  deleteMaterialText(id);
  if (meta) invalidateSubjectIndex(meta.subject_id);
  persist();
}

// ---------- 资料正文（chunks/） ----------
interface ChunkFile {
  materialId: string;
  text_content: string;
  updated_at: number;
}

function getChunksPath(materialId: string): string {
  return path.join(ctx().chunksDir, `${materialId}.json`);
}

function writeMaterialText(c: UserContext, materialId: string, text: string): void {
  c.textCache.set(materialId, text);
  writeJSON(path.join(c.chunksDir, `${materialId}.json`), {
    materialId,
    text_content: text,
    updated_at: now(),
  } as ChunkFile);
}

function getMaterialText(materialId: string): string {
  const c = ctx();
  const cached = c.textCache.get(materialId);
  if (cached !== undefined) return cached;
  const file = readJSON<ChunkFile | null>(path.join(c.chunksDir, `${materialId}.json`), null);
  const text = file?.text_content ?? '';
  c.textCache.set(materialId, text);
  return text;
}

function deleteMaterialText(materialId: string): void {
  const c = ctx();
  c.textCache.delete(materialId);
  try {
    fs.unlinkSync(path.join(c.chunksDir, `${materialId}.json`));
  } catch {
    // 文件不存在则忽略
  }
}

// ---------- 科目检索索引（index/） ----------
export interface SubjectIndexData {
  subjectId: string;
  built_at: number;
  materialSignatures: Record<string, number>;
  chunks: Array<{
    materialId: string;
    materialName: string;
    text: string;
    tokens: number;
    index: number;
    subjectId?: string;
  }>;
}

export function getSubjectIndexPath(subjectId: string): string {
  return path.join(ctx().indexDir, `${subjectId}.json`);
}

export function saveSubjectIndex(subjectId: string, indexData: SubjectIndexData): void {
  writeJSON(getSubjectIndexPath(subjectId), indexData);
}

export function loadSubjectIndex(subjectId: string): SubjectIndexData | undefined {
  const p = getSubjectIndexPath(subjectId);
  if (!fs.existsSync(p)) return undefined;
  return readJSON<SubjectIndexData | null>(p, null) ?? undefined;
}

export function invalidateSubjectIndex(subjectId: string): void {
  deleteSubjectIndexFile(subjectId);
}

function deleteSubjectIndexFile(subjectId: string): void {
  try {
    fs.unlinkSync(getSubjectIndexPath(subjectId));
  } catch {
    // 忽略
  }
}

// ---------- Chat Sessions ----------
type ChatIndex = Record<string, string[]>;

function getChatIndexPath(): string {
  return path.join(ctx().chatsDir, 'index.json');
}

function loadChatIndex(): ChatIndex {
  return readJSON<ChatIndex>(getChatIndexPath(), {});
}

function saveChatIndex(index: ChatIndex): void {
  writeJSON(getChatIndexPath(), index);
}

function addToChatIndex(subjectId: string, sessionId: string): void {
  const index = loadChatIndex();
  const list = index[subjectId] || [];
  if (!list.includes(sessionId)) {
    list.push(sessionId);
    index[subjectId] = list;
    saveChatIndex(index);
  }
}

function removeFromChatIndex(sessionId: string): void {
  const index = loadChatIndex();
  let changed = false;
  for (const key of Object.keys(index)) {
    const before = index[key].length;
    index[key] = index[key].filter((id) => id !== sessionId);
    if (index[key].length !== before) changed = true;
    if (index[key].length === 0) delete index[key];
  }
  if (changed) saveChatIndex(index);
}

function rebuildChatIndex(): void {
  const c = ctx();
  const index: ChatIndex = {};
  try {
    const files = fs.readdirSync(c.chatsDir).filter((f) => f.endsWith('.json') && f !== 'index.json');
    for (const f of files) {
      const s = readJSON<ChatSession | null>(path.join(c.chatsDir, f), null);
      if (s && s.id && s.subject_id) {
        const list = index[s.subject_id] || [];
        if (!list.includes(s.id)) list.push(s.id);
        index[s.subject_id] = list;
      }
    }
  } catch {
    // 目录读取失败，保持空索引
  }
  saveChatIndex(index);
}

export function listChatSessions(subjectId: string): ChatSession[] {
  const c = ctx();
  const indexPath = getChatIndexPath();
  if (fs.existsSync(indexPath)) {
    const index = loadChatIndex();
    const ids = index[subjectId] || [];
    const sessions: ChatSession[] = [];
    for (const id of ids) {
      const s = readJSON<ChatSession | null>(path.join(c.chatsDir, `${id}.json`), null);
      if (s && s.subject_id === subjectId) sessions.push(s);
    }
    return sessions.sort((a, b) => b.created_at - a.created_at);
  }
  const sessions: ChatSession[] = [];
  try {
    const files = fs.readdirSync(c.chatsDir).filter((f) => f.endsWith('.json') && f !== 'index.json');
    for (const f of files) {
      const s = readJSON<ChatSession | null>(path.join(c.chatsDir, f), null);
      if (s && s.subject_id === subjectId) sessions.push(s);
    }
  } catch {
    // 忽略
  }
  rebuildChatIndex();
  return sessions.sort((a, b) => b.created_at - a.created_at);
}

export function getChatSession(id: string): ChatSession | undefined {
  return readJSON<ChatSession | null>(path.join(ctx().chatsDir, `${id}.json`), null) ?? undefined;
}

export function saveChatSession(session: ChatSession): void {
  const c = ctx();
  try {
    if (!fs.existsSync(c.chatsDir)) {
      fs.mkdirSync(c.chatsDir, { recursive: true });
    }
    fs.writeFileSync(path.join(c.chatsDir, `${session.id}.json`), JSON.stringify(session, null, 2), 'utf-8');
    addToChatIndex(session.subject_id, session.id);
  } catch (err) {
    console.error('保存对话记录失败:', err);
  }
}

export function deleteChatSession(id: string): void {
  const c = ctx();
  const filePath = path.join(c.chatsDir, `${id}.json`);
  try {
    fs.unlinkSync(filePath);
  } catch {
    // 文件不存在则忽略
  }
  removeFromChatIndex(id);
}

// ---------- Review Docs ----------
export function listReviewDocs(subjectId: string): ReviewDoc[] {
  return ctx().data.reviewDocs
    .filter((r) => r.subject_id === subjectId)
    .sort((a, b) => b.created_at - a.created_at);
}

export function saveReviewDoc(doc: ReviewDoc): void {
  const c = ctx();
  const idx = c.data.reviewDocs.findIndex((r) => r.id === doc.id);
  if (idx >= 0) {
    c.data.reviewDocs[idx] = doc;
  } else {
    c.data.reviewDocs.push(doc);
  }
  persist();
}

export function deleteReviewDoc(id: string): void {
  const c = ctx();
  c.data.reviewDocs = c.data.reviewDocs.filter((r) => r.id !== id);
  persist();
}

// ---------- Quiz Sessions ----------
export function listQuizSessions(subjectId: string): QuizSession[] {
  return ctx().data.quizSessions
    .filter((q) => q.subject_id === subjectId)
    .sort((a, b) => b.created_at - a.created_at);
}

export function saveQuizSession(session: QuizSession): void {
  const c = ctx();
  const idx = c.data.quizSessions.findIndex((q) => q.id === session.id);
  if (idx >= 0) {
    c.data.quizSessions[idx] = session;
  } else {
    c.data.quizSessions.push(session);
  }
  autoAddWrongQuestions(session);
  persist();
}

export function deleteQuizSession(id: string): void {
  const c = ctx();
  c.data.quizSessions = c.data.quizSessions.filter((q) => q.id !== id);
  persist();
}

// ---------- Wrong Questions ----------
function autoAddWrongQuestions(session: QuizSession): void {
  const c = ctx();
  for (const q of session.questions) {
    if (q.correct || !q.user_answer || !q.user_answer.trim()) continue;
    const exists = c.data.wrongQuestions.some(
      (w) => w.subject_id === session.subject_id && w.question.question === q.question,
    );
    if (exists) continue;
    const wq: WrongQuestion = {
      id: uuidv4(),
      subject_id: session.subject_id,
      quiz_session_id: session.id,
      question: { ...q, session_id: session.id },
      user_answer: q.user_answer,
      correct_answer: q.answer,
      explanation: q.explanation,
      created_at: now(),
      reviewed: false,
      review_count: 0,
    };
    c.data.wrongQuestions.push(wq);
  }
}

export function listWrongQuestions(subjectId?: string): WrongQuestion[] {
  const c = ctx();
  const list = subjectId
    ? c.data.wrongQuestions.filter((w) => w.subject_id === subjectId)
    : c.data.wrongQuestions;
  return list.sort((a, b) => b.created_at - a.created_at);
}

export function addWrongQuestion(wq: WrongQuestion): void {
  ctx().data.wrongQuestions.push(wq);
  persist();
}

export function deleteWrongQuestion(id: string): void {
  const c = ctx();
  c.data.wrongQuestions = c.data.wrongQuestions.filter((w) => w.id !== id);
  persist();
}

export function markWrongReviewed(id: string, reviewed: boolean): void {
  const c = ctx();
  const idx = c.data.wrongQuestions.findIndex((w) => w.id === id);
  if (idx < 0) return;
  const wq = c.data.wrongQuestions[idx];
  wq.reviewed = reviewed;
  if (reviewed) wq.review_count = (wq.review_count || 0) + 1;
  c.data.wrongQuestions[idx] = wq;
  persist();
}

export function getWrongQuestionsForQuiz(subjectId: string, count: number): WrongQuestion[] {
  const c = ctx();
  const pool = c.data.wrongQuestions.filter((w) => w.subject_id === subjectId);
  const sorted = [...pool].sort((a, b) => {
    if (a.reviewed !== b.reviewed) return a.reviewed ? 1 : -1;
    return b.created_at - a.created_at;
  });
  return sorted.slice(0, Math.max(1, count));
}

// ---------- User Profile ----------
export function getProfile(): UserProfile {
  return { ...DEFAULT_PROFILE, ...ctx().data.profile };
}

export function saveProfile(profile: UserProfile): void {
  ctx().data.profile = { ...profile };
  persist();
}

// ---------- 缓存清理 ----------
function clearDirContents(dir: string): void {
  try {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const full = path.join(dir, entry);
      try {
        fs.unlinkSync(full);
      } catch {
        try {
          fs.rmSync(full, { recursive: true, force: true });
        } catch {
          // 跳过
        }
      }
    }
  } catch (err) {
    console.error(`清空目录失败 ${dir}:`, err);
  }
}

export function clearCache(types: string[]): void {
  const c = ctx();
  const want = new Set(types);
  const clearAll = want.has('all');
  if (clearAll || want.has('chunks')) {
    clearDirContents(c.chunksDir);
    c.textCache.clear();
  }
  if (clearAll || want.has('index')) {
    clearDirContents(c.indexDir);
  }
  if (clearAll || want.has('chats')) {
    clearDirContents(c.chatsDir);
    saveChatIndex({});
  }
}
