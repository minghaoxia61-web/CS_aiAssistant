import { useRef, useState } from 'react'
import { Download, FileJson, Loader2, Upload } from 'lucide-react'
import { createLearningBackup, downloadBackup, restoreLearningBackup, type LearningBackup } from '@/lib/data-backup'
import { useStore } from '@/lib/store'

export default function DataBackup() {
  const inputRef = useRef<HTMLInputElement>(null)
  const { subjects, profile, loadSubjects, loadProfile } = useStore()
  const [busy, setBusy] = useState<'export' | 'import' | null>(null)
  const [message, setMessage] = useState('')

  const exportData = async () => {
    setBusy('export')
    setMessage('')
    try {
      downloadBackup(await createLearningBackup(subjects, profile))
      setMessage('备份已生成并下载。')
    } finally {
      setBusy(null)
    }
  }

  const importData = async (file?: File) => {
    if (!file) return
    setBusy('import')
    setMessage('')
    try {
      const backup = JSON.parse(await file.text()) as LearningBackup
      const result = await restoreLearningBackup(backup)
      await Promise.all([loadSubjects(), loadProfile()])
      setMessage(`已恢复 ${result.subjects} 个科目和 ${result.records} 条学习记录。`)
    } catch (error) {
      setMessage(`恢复失败：${(error as Error).message}`)
    } finally {
      setBusy(null)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <section className="panel p-5 mb-6">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl bg-amber/10 text-amber flex items-center justify-center shrink-0">
          <FileJson className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-bone">学习数据备份</h3>
          <p className="text-[11px] text-bone-muted mt-1 leading-relaxed">导出科目、资料文本、对话、测验、错题和复习记录；可在另一台设备恢复。</p>
          {message && <p className="text-[10px] text-amber mt-2">{message}</p>}
        </div>
        <div className="page-actions">
          <button className="btn-outline" onClick={() => inputRef.current?.click()} disabled={Boolean(busy)}>
            {busy === 'import' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            导入
          </button>
          <button className="btn-primary" onClick={exportData} disabled={Boolean(busy)}>
            {busy === 'export' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            导出 JSON
          </button>
          <input ref={inputRef} className="hidden" type="file" accept="application/json,.json" onChange={(event) => importData(event.target.files?.[0])} />
        </div>
      </div>
    </section>
  )
}
