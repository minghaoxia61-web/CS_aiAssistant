// 基于 JSON 文件的数据存储（主进程）
// 分层存储：
//   db.json        —— subjects / materials(元数据，不含正文) / reviewDocs / quizSessions / profile
//   chunks/        —— 资料正文文本缓存，每份资料一个文件 {materialId}.json
//   index/         —— BM25/TF-IDF 索引特征，按科目 {subjectId}.json
//   chats/         —— 每个对话一个文件 {sessionId}.json，外加 index.json 会话索引
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
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

/** 资料元数据（不含正文，正文单独存到 chunks/） */
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

/** clearCache 支持的缓存类型 */
export type CacheType = 'chunks' | 'index' | 'chats' | 'all';

let dbPath = '';
let chatsDir = '';
let data: DBShape = { ...EMPTY_DB };

/** 内存中的资料正文缓存：materialId -> text_content，避免每次读盘 */
const textCache = new Map<string, string>();

function ensureDir(dir: string): string {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (err) {
    console.error(`创建目录失败 ${dir}（可能权限受限，将在使用时重试）:`, err);
  }
  return dir;
}

function getDataDir(): string {
  return ensureDir(path.join(app.getPath('userData'), 'data'));
}

function getChatsDir(): string {
  return ensureDir(path.join(getDataDir(), 'chats'));
}

function getChunksDir(): string {
  return ensureDir(path.join(getDataDir(), 'chunks'));
}

function getIndexDir(): string {
  return ensureDir(path.join(getDataDir(), 'index'));
}

function getChatIndexPath(): string {
  return path.join(getChatsDir(), 'index.json');
}

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

export function initStore(): void {
  const dir = getDataDir();
  dbPath = path.join(dir, 'db.json');
  chatsDir = getChatsDir();
  // 预创建分块与索引目录（后续读写通过 getChunksDir/getIndexDir 按需取用）
  getChunksDir();
  getIndexDir();
  try {
    if (fs.existsSync(dbPath)) {
      const raw = fs.readFileSync(dbPath, 'utf-8');
      const parsed = JSON.parse(raw);
      data = { ...EMPTY_DB, ...parsed };
      let needPersist = false;
      // 迁移：旧 db.json 中可能内嵌 chatSessions，迁移到独立文件
      if (Array.isArray((parsed as Record<string, unknown>).chatSessions)) {
        const oldSessions = (parsed as { chatSessions: ChatSession[] }).chatSessions;
        for (const s of oldSessions) {
          fs.writeFileSync(path.join(chatsDir, `${s.id}.json`), JSON.stringify(s, null, 2), 'utf-8');
        }
        delete (data as unknown as Record<string, unknown>).chatSessions;
        needPersist = true;
      }
      // 迁移：旧 db.json 的 materials 可能仍含 text_content，分离到 chunks/
      for (const m of data.materials as unknown as Material[]) {
        if (m.text_content !== undefined) {
          writeMaterialText(m.id, m.text_content);
          delete (m as unknown as { text_content?: string }).text_content;
          needPersist = true;
        }
      }
      if (needPersist) persist();
    } else {
      data = { ...EMPTY_DB };
      persist();
    }
    // 确保会话索引存在；不存在则扫描重建
    if (!fs.existsSync(getChatIndexPath())) {
      rebuildChatIndex();
    }
  } catch (err) {
    console.error('初始化数据库失败，重置为空:', err);
    data = { ...EMPTY_DB };
    persist();
  }
}

function persist(): void {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('写入数据库失败:', err);
  }
}

const now = () => Date.now();

// ---------- Subjects ----------
export function listSubjects(): Subject[] {
  return data.subjects.sort((a, b) => b.created_at - a.created_at);
}

export function createSubject(name: string, color: string): Subject {
  const subject: Subject = {
    id: uuidv4(),
    name: name.trim() || '未命名科目',
    color: color || '#e8b974',
    created_at: now(),
  };
  data.subjects.push(subject);
  persist();
  return subject;
}

export function deleteSubject(id: string): void {
  // 删除该科目下资料的正文缓存
  const materialIds = data.materials.filter((m) => m.subject_id === id).map((m) => m.id);
  for (const mid of materialIds) {
    deleteMaterialText(mid);
  }
  data.subjects = data.subjects.filter((s) => s.id !== id);
  data.materials = data.materials.filter((m) => m.subject_id !== id);
  data.reviewDocs = data.reviewDocs.filter((r) => r.subject_id !== id);
  data.quizSessions = data.quizSessions.filter((q) => q.subject_id !== id);
  data.wrongQuestions = data.wrongQuestions.filter((w) => w.subject_id !== id);
  // 删除该科目下的所有对话文件（同时维护会话索引）
  const sessions = listChatSessions(id);
  for (const s of sessions) {
    deleteChatSession(s.id);
  }
  // 删除该科目的检索索引文件
  deleteSubjectIndexFile(id);
  persist();
}

// ---------- Materials ----------
/** 将元数据与正文合并为完整 Material */
function withText(meta: MaterialMeta): Material {
  return { ...meta, text_content: getMaterialText(meta.id) };
}

export function getMaterials(subjectId: string): Material[] {
  return data.materials
    .filter((m) => m.subject_id === subjectId)
    .map(withText)
    .sort((a, b) => b.created_at - a.created_at);
}

export function getMaterialById(id: string): Material | undefined {
  const meta = data.materials.find((m) => m.id === id);
  return meta ? withText(meta) : undefined;
}

export function addMaterial(material: Material): void {
  const { text_content, ...meta } = material;
  data.materials.push(meta);
  writeMaterialText(material.id, text_content || '');
  // 资料新增 → 该科目索引失效（下次检索时重建）
  invalidateSubjectIndex(material.subject_id);
  persist();
}

export function updateMaterial(id: string, patch: Partial<Material>): void {
  const idx = data.materials.findIndex((m) => m.id === id);
  if (idx < 0) return;
  const { text_content, ...metaPatch } = patch;
  // 正文单独写盘
  if (text_content !== undefined) {
    writeMaterialText(id, text_content);
  }
  // 元数据落库（已剔除 text_content）
  data.materials[idx] = { ...data.materials[idx], ...metaPatch };
  // 正文变更或科目变更 → 索引失效
  if (text_content !== undefined) {
    invalidateSubjectIndex(data.materials[idx].subject_id);
  }
  persist();
}

export function deleteMaterial(id: string): void {
  const meta = data.materials.find((m) => m.id === id);
  data.materials = data.materials.filter((m) => m.id !== id);
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
  return path.join(getChunksDir(), `${materialId}.json`);
}

function writeMaterialText(materialId: string, text: string): void {
  textCache.set(materialId, text);
  writeJSON(getChunksPath(materialId), {
    materialId,
    text_content: text,
    updated_at: now(),
  } as ChunkFile);
}

function getMaterialText(materialId: string): string {
  const cached = textCache.get(materialId);
  if (cached !== undefined) return cached;
  const file = readJSON<ChunkFile | null>(getChunksPath(materialId), null);
  const text = file?.text_content ?? '';
  textCache.set(materialId, text);
  return text;
}

function deleteMaterialText(materialId: string): void {
  textCache.delete(materialId);
  try {
    fs.unlinkSync(getChunksPath(materialId));
  } catch {
    // 文件不存在则忽略
  }
}

// ---------- 科目检索索引（index/） ----------
/** 科目索引文件结构：缓存分块结果，避免重复分块计算 */
export interface SubjectIndexData {
  subjectId: string;
  built_at: number;
  /** 缓存校验签名：materialId -> text_content 长度，用于检测过期 */
  materialSignatures: Record<string, number>;
  /** 已分块的结果（与 rag.ts Chunk 结构一致） */
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
  return path.join(getIndexDir(), `${subjectId}.json`);
}

/** 保存某科目的检索索引（分块缓存） */
export function saveSubjectIndex(subjectId: string, indexData: SubjectIndexData): void {
  writeJSON(getSubjectIndexPath(subjectId), indexData);
}

/** 读取某科目的检索索引，不存在返回 undefined */
export function loadSubjectIndex(subjectId: string): SubjectIndexData | undefined {
  const p = getSubjectIndexPath(subjectId);
  if (!fs.existsSync(p)) return undefined;
  return readJSON<SubjectIndexData | null>(p, null) ?? undefined;
}

/** 使某科目的索引失效（删除缓存文件，下次检索时重建） */
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

// ---------- Chat Sessions（独立文件存储 + 索引） ----------
/** 会话索引：subjectId -> sessionId[] */
type ChatIndex = Record<string, string[]>;

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

/** 扫描 chats/ 重建索引（首次启动或索引丢失时） */
function rebuildChatIndex(): void {
  const index: ChatIndex = {};
  try {
    const files = fs.readdirSync(chatsDir).filter((f) => f.endsWith('.json') && f !== 'index.json');
    for (const f of files) {
      const s = readJSON<ChatSession | null>(path.join(chatsDir, f), null);
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
  const indexPath = getChatIndexPath();
  // 优先读索引快速筛选
  if (fs.existsSync(indexPath)) {
    const index = loadChatIndex();
    const ids = index[subjectId] || [];
    const sessions: ChatSession[] = [];
    for (const id of ids) {
      const s = readJSON<ChatSession | null>(path.join(chatsDir, `${id}.json`), null);
      if (s && s.subject_id === subjectId) sessions.push(s);
    }
    return sessions.sort((a, b) => b.created_at - a.created_at);
  }
  // 回退：遍历 chats/ 目录，并重建索引供下次使用
  const sessions: ChatSession[] = [];
  try {
    const files = fs.readdirSync(chatsDir).filter((f) => f.endsWith('.json') && f !== 'index.json');
    for (const f of files) {
      const s = readJSON<ChatSession | null>(path.join(chatsDir, f), null);
      if (s && s.subject_id === subjectId) sessions.push(s);
    }
  } catch {
    // 忽略
  }
  rebuildChatIndex();
  return sessions.sort((a, b) => b.created_at - a.created_at);
}

export function getChatSession(id: string): ChatSession | undefined {
  return readJSON<ChatSession | null>(path.join(chatsDir, `${id}.json`), null) ?? undefined;
}

export function saveChatSession(session: ChatSession): void {
  try {
    // 确保目录存在（可能在 initStore 时创建失败，这里重试）
    if (!fs.existsSync(chatsDir)) {
      fs.mkdirSync(chatsDir, { recursive: true });
    }
    // 增量写：只写单个会话文件 + 更新索引
    fs.writeFileSync(path.join(chatsDir, `${session.id}.json`), JSON.stringify(session, null, 2), 'utf-8');
    addToChatIndex(session.subject_id, session.id);
  } catch (err) {
    console.error('保存对话记录失败:', err);
  }
}

export function deleteChatSession(id: string): void {
  const filePath = path.join(chatsDir, `${id}.json`);
  try {
    fs.unlinkSync(filePath);
  } catch {
    // 文件不存在则忽略
  }
  // 增量更新：从索引中移除该会话
  removeFromChatIndex(id);
}

// ---------- Review Docs ----------
export function listReviewDocs(subjectId: string): ReviewDoc[] {
  return data.reviewDocs
    .filter((r) => r.subject_id === subjectId)
    .sort((a, b) => b.created_at - a.created_at);
}

export function saveReviewDoc(doc: ReviewDoc): void {
  const idx = data.reviewDocs.findIndex((r) => r.id === doc.id);
  if (idx >= 0) {
    data.reviewDocs[idx] = doc;
  } else {
    data.reviewDocs.push(doc);
  }
  persist();
}

export function deleteReviewDoc(id: string): void {
  data.reviewDocs = data.reviewDocs.filter((r) => r.id !== id);
  persist();
}

// ---------- Quiz Sessions ----------
export function listQuizSessions(subjectId: string): QuizSession[] {
  return data.quizSessions
    .filter((q) => q.subject_id === subjectId)
    .sort((a, b) => b.created_at - a.created_at);
}

export function saveQuizSession(session: QuizSession): void {
  const idx = data.quizSessions.findIndex((q) => q.id === session.id);
  if (idx >= 0) {
    data.quizSessions[idx] = session;
  } else {
    data.quizSessions.push(session);
  }
  // 测验提交批改后自动将错题加入错题本
  autoAddWrongQuestions(session);
  persist();
}

export function deleteQuizSession(id: string): void {
  data.quizSessions = data.quizSessions.filter((q) => q.id !== id);
  persist();
}

// ---------- Wrong Questions ----------
/** 测验批改后自动将错题加入错题本（按题干去重） */
function autoAddWrongQuestions(session: QuizSession): void {
  for (const q of session.questions) {
    // 仅记录有作答且答错的题目
    if (q.correct || !q.user_answer || !q.user_answer.trim()) continue;
    // 按科目 + 题干去重，避免同一题反复加入
    const exists = data.wrongQuestions.some(
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
    data.wrongQuestions.push(wq);
  }
}

export function listWrongQuestions(subjectId?: string): WrongQuestion[] {
  const list = subjectId
    ? data.wrongQuestions.filter((w) => w.subject_id === subjectId)
    : data.wrongQuestions;
  return list.sort((a, b) => b.created_at - a.created_at);
}

export function addWrongQuestion(wq: WrongQuestion): void {
  data.wrongQuestions.push(wq);
  persist();
}

export function deleteWrongQuestion(id: string): void {
  data.wrongQuestions = data.wrongQuestions.filter((w) => w.id !== id);
  persist();
}

export function markWrongReviewed(id: string, reviewed: boolean): void {
  const idx = data.wrongQuestions.findIndex((w) => w.id === id);
  if (idx < 0) return;
  const wq = data.wrongQuestions[idx];
  wq.reviewed = reviewed;
  // 标记为已复习时累加复习次数；取消标记则不回退
  if (reviewed) wq.review_count = (wq.review_count || 0) + 1;
  data.wrongQuestions[idx] = wq;
  persist();
}

/** 从错题本中抽取题目生成新测验（返回重置后的 QuizQuestion 数组） */
export function getWrongQuestionsForQuiz(subjectId: string, count: number): WrongQuestion[] {
  const pool = data.wrongQuestions.filter((w) => w.subject_id === subjectId);
  // 优先抽取未复习的，其次按时间倒序
  const sorted = [...pool].sort((a, b) => {
    if (a.reviewed !== b.reviewed) return a.reviewed ? 1 : -1;
    return b.created_at - a.created_at;
  });
  return sorted.slice(0, Math.max(1, count));
}

// ---------- User Profile ----------
export function getProfile(): UserProfile {
  return { ...DEFAULT_PROFILE, ...data.profile };
}

export function saveProfile(profile: UserProfile): void {
  data.profile = { ...profile };
  persist();
}

// ---------- 缓存清理 ----------
/** 清空目录下所有内容（保留目录本身） */
function clearDirContents(dir: string): void {
  try {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const full = path.join(dir, entry);
      try {
        fs.unlinkSync(full);
      } catch {
        // 可能是子目录，尝试递归删除
        try {
          fs.rmSync(full, { recursive: true, force: true });
        } catch {
          // 跳过单个失败项
        }
      }
    }
  } catch (err) {
    console.error(`清空目录失败 ${dir}:`, err);
  }
}

/**
 * 清理缓存。
 * @param types 支持项：'chunks' | 'index' | 'chats' | 'all'
 *  - chunks：资料正文缓存（chunks/）
 *  - index：科目检索索引（index/）
 *  - chats：所有对话记录及会话索引（chats/）
 *  - all：以上全部
 */
export function clearCache(types: string[]): void {
  const want = new Set(types);
  const clearAll = want.has('all');
  if (clearAll || want.has('chunks')) {
    clearDirContents(getChunksDir());
    textCache.clear();
  }
  if (clearAll || want.has('index')) {
    clearDirContents(getIndexDir());
  }
  if (clearAll || want.has('chats')) {
    clearDirContents(getChatsDir());
    // 重置会话索引为空
    saveChatIndex({});
  }
}
