import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function formatTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const diff = now.getTime() - ts
  const day = 24 * 60 * 60 * 1000
  if (diff < day && d.getDate() === now.getDate()) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  if (diff < 2 * day) return '昨天'
  if (diff < 7 * day) return `${Math.floor(diff / day)}天前`
  return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export const SUBJECT_COLORS = [
  '#e8b974', '#8ba888', '#c87555', '#a8814f',
  '#6b8268', '#d4a574', '#a8c4a4', '#7a9a6b',
]

export function pickColor(index: number): string {
  return SUBJECT_COLORS[index % SUBJECT_COLORS.length]
}
