// 基于 JSON 文件的数据存储（主进程）
// 每个集合一个 JSON 文件，加载到内存，变更时落盘
// 对话记录（chatSessions）存到独立的 chats/ 文件夹，每个对话一个文件
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
} from '../src/shared/types';

interface DBShape {
  subjects: Subject[];
  materials: Material[];
  reviewDocs: ReviewDoc[];
  quizSessions: QuizSession[];
}

const EMPTY_DB: DBShape = {
  subjects: [],
  materials: [],
  reviewDocs: [],
  quizSessions: [],
};

let dbPath = '';
let chatsDir = '';
let data: DBShape = { ...EMPTY_DB };

function getDataDir(): string {
  const dir = path.join(app.getPath('userData'), 'data');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getChatsDir(): string {
  const dir = path.join(getDataDir(), 'chats');
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (err) {
    console.error('创建 chats 目录失败（可能权限受限，将在保存时重试）:', err);
  }
  return dir;
}

export function initStore(): void {
  const dir = getDataDir();
  dbPath = path.join(dir, 'db.json');
  chatsDir = getChatsDir();
  try {
    if (fs.existsSync(dbPath)) {
      const raw = fs.readFileSync(dbPath, 'utf-8');
      const parsed = JSON.parse(raw);
      data = { ...EMPTY_DB, ...parsed };
      // 迁移：如果旧 db.json 中有 chatSessions，迁移到独立文件
      if (Array.isArray((parsed as Record<string, unknown>).chatSessions)) {
        const oldSessions = (parsed as { chatSessions: ChatSession[] }).chatSessions;
        for (const s of oldSessions) {
          fs.writeFileSync(path.join(chatsDir, `${s.id}.json`), JSON.stringify(s, null, 2), 'utf-8');
        }
        // 从 db.json 中移除 chatSessions
        delete (data as unknown as Record<string, unknown>).chatSessions;
        persist();
      }
    } else {
      data = { ...EMPTY_DB };
      persist();
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
  data.subjects = data.subjects.filter((s) => s.id !== id);
  data.materials = data.materials.filter((m) => m.subject_id !== id);
  data.reviewDocs = data.reviewDocs.filter((r) => r.subject_id !== id);
  data.quizSessions = data.quizSessions.filter((q) => q.subject_id !== id);
  // 删除该科目下的所有对话文件
  const sessions = listChatSessions(id);
  for (const s of sessions) {
    deleteChatSession(s.id);
  }
  persist();
}

// ---------- Materials ----------
export function getMaterials(subjectId: string): Material[] {
  return data.materials
    .filter((m) => m.subject_id === subjectId)
    .sort((a, b) => b.created_at - a.created_at);
}

export function getMaterialById(id: string): Material | undefined {
  return data.materials.find((m) => m.id === id);
}

export function addMaterial(material: Material): void {
  data.materials.push(material);
  persist();
}

export function updateMaterial(id: string, patch: Partial<Material>): void {
  const idx = data.materials.findIndex((m) => m.id === id);
  if (idx >= 0) {
    data.materials[idx] = { ...data.materials[idx], ...patch };
    persist();
  }
}

export function deleteMaterial(id: string): void {
  data.materials = data.materials.filter((m) => m.id !== id);
  persist();
}

// ---------- Chat Sessions（独立文件存储） ----------
export function listChatSessions(subjectId: string): ChatSession[] {
  try {
    const files = fs.readdirSync(chatsDir).filter((f) => f.endsWith('.json'));
    const sessions: ChatSession[] = [];
    for (const f of files) {
      try {
        const raw = fs.readFileSync(path.join(chatsDir, f), 'utf-8');
        const s = JSON.parse(raw) as ChatSession;
        if (s.subject_id === subjectId) sessions.push(s);
      } catch {
        // 跳过损坏文件
      }
    }
    return sessions.sort((a, b) => b.created_at - a.created_at);
  } catch {
    return [];
  }
}

export function getChatSession(id: string): ChatSession | undefined {
  const filePath = path.join(chatsDir, `${id}.json`);
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as ChatSession;
  } catch {
    return undefined;
  }
}

export function saveChatSession(session: ChatSession): void {
  try {
    // 确保目录存在（可能在 initStore 时创建失败，这里重试）
    if (!fs.existsSync(chatsDir)) {
      fs.mkdirSync(chatsDir, { recursive: true });
    }
    const filePath = path.join(chatsDir, `${session.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf-8');
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
  persist();
}

export function deleteQuizSession(id: string): void {
  data.quizSessions = data.quizSessions.filter((q) => q.id !== id);
  persist();
}
