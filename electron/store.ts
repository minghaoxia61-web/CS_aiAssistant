// 基于 JSON 文件的数据存储（主进程）
// 每个集合一个 JSON 文件，加载到内存，变更时落盘
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
  chatSessions: ChatSession[];
  reviewDocs: ReviewDoc[];
  quizSessions: QuizSession[];
}

const EMPTY_DB: DBShape = {
  subjects: [],
  materials: [],
  chatSessions: [],
  reviewDocs: [],
  quizSessions: [],
};

let dbPath = '';
let data: DBShape = { ...EMPTY_DB };

function getDataDir(): string {
  const dir = path.join(app.getPath('userData'), 'data');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function initStore(): void {
  dbPath = path.join(getDataDir(), 'db.json');
  try {
    if (fs.existsSync(dbPath)) {
      const raw = fs.readFileSync(dbPath, 'utf-8');
      data = { ...EMPTY_DB, ...JSON.parse(raw) };
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
  data.chatSessions = data.chatSessions.filter((c) => c.subject_id !== id);
  data.reviewDocs = data.reviewDocs.filter((r) => r.subject_id !== id);
  data.quizSessions = data.quizSessions.filter((q) => q.subject_id !== id);
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

// ---------- Chat Sessions ----------
export function listChatSessions(subjectId: string): ChatSession[] {
  return data.chatSessions
    .filter((c) => c.subject_id === subjectId)
    .sort((a, b) => b.created_at - a.created_at);
}

export function getChatSession(id: string): ChatSession | undefined {
  return data.chatSessions.find((c) => c.id === id);
}

export function saveChatSession(session: ChatSession): void {
  const idx = data.chatSessions.findIndex((c) => c.id === session.id);
  if (idx >= 0) {
    data.chatSessions[idx] = session;
  } else {
    data.chatSessions.push(session);
  }
  persist();
}

export function deleteChatSession(id: string): void {
  data.chatSessions = data.chatSessions.filter((c) => c.id !== id);
  persist();
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
