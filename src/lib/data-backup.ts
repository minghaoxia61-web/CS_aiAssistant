import { v4 as uuidv4 } from 'uuid'
import type { ChatSession, Material, QuizSession, ReviewDoc, Subject, UserProfile, WrongQuestion } from '@/shared/types'

export interface LearningBackup {
  format: 'cs-assistant-backup'
  version: 1
  exportedAt: number
  profile: UserProfile
  subjects: Array<{
    subject: Subject
    materials: Material[]
    chats: ChatSession[]
    reviews: ReviewDoc[]
    quizzes: QuizSession[]
    wrongQuestions: WrongQuestion[]
  }>
  preferences: {
    reviewSchedules?: string
  }
}

export async function createLearningBackup(subjects: Subject[], profile: UserProfile): Promise<LearningBackup> {
  const records = await Promise.all(
    subjects.map(async (subject) => {
      const [materials, chats, reviews, quizzes, wrongQuestions] = await Promise.all([
        window.api.getMaterials(subject.id),
        window.api.listChatSessions(subject.id),
        window.api.listReviewDocs(subject.id),
        window.api.listQuizSessions(subject.id),
        window.api.listWrongQuestions(subject.id),
      ])
      return { subject, materials, chats, reviews, quizzes, wrongQuestions }
    }),
  )
  return {
    format: 'cs-assistant-backup',
    version: 1,
    exportedAt: Date.now(),
    profile,
    subjects: records,
    preferences: {
      reviewSchedules: localStorage.getItem('cs_assistant_review_schedules_v1') || undefined,
    },
  }
}

export function downloadBackup(backup: LearningBackup): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `cs-assistant-backup-${new Date().toISOString().slice(0, 10)}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function restoreLearningBackup(backup: LearningBackup): Promise<{ subjects: number; records: number }> {
  if (backup.format !== 'cs-assistant-backup' || backup.version !== 1 || !Array.isArray(backup.subjects)) {
    throw new Error('备份文件格式不受支持')
  }
  let records = 0
  for (const group of backup.subjects) {
    const subject = await window.api.createSubject(`${group.subject.name}（恢复）`, group.subject.color)
    const mapSession = (session: ChatSession): ChatSession => {
      const sessionId = uuidv4()
      return {
        ...session,
        id: sessionId,
        subject_id: subject.id,
        messages: session.messages.map((message) => ({ ...message, id: uuidv4(), session_id: sessionId })),
      }
    }
    for (const chat of group.chats || []) {
      await window.api.saveChatSession(mapSession(chat))
      records += 1
    }
    for (const review of group.reviews || []) {
      await window.api.saveReviewDoc({ ...review, id: uuidv4(), subject_id: subject.id })
      records += 1
    }
    // 原始文件无法从 JSON 还原为二进制，保留其解析文本为复习文档
    for (const material of group.materials || []) {
      if (!material.text_content) continue
      await window.api.saveReviewDoc({
        id: uuidv4(),
        subject_id: subject.id,
        type: 'summary',
        title: `恢复资料 · ${material.filename}`,
        content: material.text_content,
        created_at: material.created_at,
      })
      records += 1
    }
    for (const quiz of group.quizzes || []) {
      await window.api.saveQuizSession({ ...quiz, id: uuidv4(), subject_id: subject.id })
      records += 1
    }
    for (const wrong of group.wrongQuestions || []) {
      await window.api.addWrongQuestion({ ...wrong, id: uuidv4(), subject_id: subject.id })
      records += 1
    }
  }
  if (backup.profile) await window.api.saveProfile(backup.profile)
  if (backup.preferences.reviewSchedules) {
    localStorage.setItem('cs_assistant_review_schedules_v1', backup.preferences.reviewSchedules)
  }
  return { subjects: backup.subjects.length, records }
}
