import { v4 as uuidv4 } from 'uuid'
import type { QuizSession, Subject } from '@/shared/types'

export interface TeacherCourse {
  id: string
  subjectId: string
  name: string
  createdAt: number
}

export interface TeacherClass {
  id: string
  courseId: string
  name: string
  joinCode: string
  studentCount: number
  createdAt: number
}

export interface TeacherAssignment {
  id: string
  classId: string
  title: string
  chapter?: string
  dueAt: number
  status: 'draft' | 'published'
  createdAt: number
}

export interface TeacherWorkspace {
  courses: TeacherCourse[]
  classes: TeacherClass[]
  assignments: TeacherAssignment[]
}

export interface ClassKnowledgeStat {
  chapter: string
  accuracy: number
  attempts: number
  risk: 'high' | 'medium' | 'low'
}

const STORAGE_KEY = 'cs_teacher_workspace_v1'

export function loadTeacherWorkspace(): TeacherWorkspace {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Partial<TeacherWorkspace>
    return {
      courses: parsed.courses || [],
      classes: parsed.classes || [],
      assignments: parsed.assignments || [],
    }
  } catch {
    return { courses: [], classes: [], assignments: [] }
  }
}

export function saveTeacherWorkspace(workspace: TeacherWorkspace): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace))
}

export function ensureTeacherCourse(
  workspace: TeacherWorkspace,
  subject: Subject,
): { workspace: TeacherWorkspace; course: TeacherCourse } {
  const existing = workspace.courses.find((course) => course.subjectId === subject.id)
  if (existing) return { workspace, course: existing }
  const course: TeacherCourse = {
    id: uuidv4(),
    subjectId: subject.id,
    name: subject.name,
    createdAt: Date.now(),
  }
  const updated = { ...workspace, courses: [...workspace.courses, course] }
  saveTeacherWorkspace(updated)
  return { workspace: updated, course }
}

function joinCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
}

export function createTeacherClass(
  workspace: TeacherWorkspace,
  courseId: string,
  name: string,
): TeacherWorkspace {
  const updated = {
    ...workspace,
    classes: [
      ...workspace.classes,
      {
        id: uuidv4(),
        courseId,
        name,
        joinCode: joinCode(),
        studentCount: 0,
        createdAt: Date.now(),
      },
    ],
  }
  saveTeacherWorkspace(updated)
  return updated
}

export function createAssignment(
  workspace: TeacherWorkspace,
  classId: string,
  title: string,
  chapter?: string,
): TeacherWorkspace {
  const updated = {
    ...workspace,
    assignments: [
      {
        id: uuidv4(),
        classId,
        title,
        chapter,
        dueAt: Date.now() + 7 * 86_400_000,
        status: 'published' as const,
        createdAt: Date.now(),
      },
      ...workspace.assignments,
    ],
  }
  saveTeacherWorkspace(updated)
  return updated
}

export function calculateClassKnowledgeStats(sessions: QuizSession[]): ClassKnowledgeStat[] {
  const map = new Map<string, { correct: number; total: number }>()
  for (const session of sessions) {
    for (const question of session.questions) {
      if (!question.user_answer?.trim()) continue
      const chapter = question.chapter?.trim() || '未分类'
      const current = map.get(chapter) || { correct: 0, total: 0 }
      current.total += 1
      current.correct += question.correct ? 1 : 0
      map.set(chapter, current)
    }
  }
  return Array.from(map.entries())
    .map(([chapter, value]) => {
      const accuracy = Math.round((value.correct / Math.max(1, value.total)) * 100)
      return {
        chapter,
        accuracy,
        attempts: value.total,
        risk: accuracy < 50 ? 'high' : accuracy < 75 ? 'medium' : 'low',
      } as ClassKnowledgeStat
    })
    .sort((a, b) => a.accuracy - b.accuracy)
}
