// 每日学习日报：当日复习章节、测验正确率、薄弱知识点、次日规划
// 支持一键导出 Markdown 笔记
import { useEffect, useState } from 'react'
import { X, Download, FileText, TrendingUp, AlertCircle, Calendar } from 'lucide-react'
import { useStore } from '@/lib/store'
import { generateDailyReport, exportReportMarkdown, type DailyReportData } from '@/lib/solo-agent'
import { cn } from '@/lib/utils'

export default function DailyReport({ onClose }: { onClose: () => void }) {
  const { subjects } = useStore()
  const [report, setReport] = useState<DailyReportData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    generateDailyReport(subjects)
      .then((r) => {
        if (!cancelled) {
          setReport(r)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [subjects])

  const handleExport = () => {
    if (!report) return
    const md = exportReportMarkdown(report)
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `学习日报-${new Date().toISOString().slice(0, 10)}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl glass border border-amber/15 shadow-glow bg-bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="sticky top-0 z-10 flex items-center gap-3 px-6 py-4 bg-bg-surface/95 backdrop-blur-md border-b border-amber/10">
          <Calendar className="w-5 h-5 text-amber" />
          <div className="flex-1">
            <h2 className="font-display text-lg text-bone">每日学习日报</h2>
            {report && <p className="text-xs text-bone-faint">{report.date}</p>}
          </div>
          <button
            onClick={handleExport}
            disabled={!report}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber/15 hover:bg-amber/25 text-amber text-xs font-medium transition-colors disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            导出 Markdown
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-ink-700/50 text-bone-faint hover:text-bone transition-colors"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-amber/30 border-t-amber rounded-full animate-spin" />
          </div>
        ) : !report ? (
          <div className="py-16 text-center text-bone-faint text-sm">日报生成失败，请稍后重试</div>
        ) : (
          <div className="px-6 py-5 space-y-6">
            {/* 今日概览 */}
            <div>
              <h3 className="text-xs font-medium text-bone-faint tracking-wider uppercase mb-3">今日概览</h3>
              <div className="grid grid-cols-4 gap-3">
                <StatCard icon={<FileText className="w-3.5 h-3.5" />} label="测验" value={report.totalQuizzes} tone="amber" />
                <StatCard icon={<TrendingUp className="w-3.5 h-3.5" />} label="问答" value={report.totalChats} tone="sage" />
                <StatCard icon={<FileText className="w-3.5 h-3.5" />} label="复习资料" value={report.totalReviews} tone="blue" />
                <StatCard icon={<AlertCircle className="w-3.5 h-3.5" />} label="新增错题" value={report.totalNewWrong} tone="rust" />
              </div>
            </div>

            {/* 各科目详情 */}
            {report.subjects.some((s) => s.quizzes + s.chats + s.reviews + s.newWrong > 0) && (
              <div>
                <h3 className="text-xs font-medium text-bone-faint tracking-wider uppercase mb-3">各科目详情</h3>
                <div className="space-y-2">
                  {report.subjects
                    .filter((s) => s.quizzes + s.chats + s.reviews + s.newWrong > 0)
                    .map((s, i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl glass border border-amber/8">
                        <span className="text-sm text-bone flex-1 truncate">{s.name}</span>
                        <div className="flex items-center gap-3 text-xs text-bone-faint">
                          {s.quizzes > 0 && (
                            <span>
                              测验 <span className="text-bone-dim">{s.quizzes}</span>
                              {s.quizzes > 0 && <span className="text-amber ml-1">{s.quizAccuracy}%</span>}
                            </span>
                          )}
                          {s.chats > 0 && (
                            <span>
                              问答 <span className="text-bone-dim">{s.chats}</span>
                            </span>
                          )}
                          {s.reviews > 0 && (
                            <span>
                              资料 <span className="text-bone-dim">{s.reviews}</span>
                            </span>
                          )}
                          {s.newWrong > 0 && (
                            <span>
                              错题 <span className="text-rust">{s.newWrong}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* 今日薄弱知识点 */}
            {report.topWeakChapters.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-bone-faint tracking-wider uppercase mb-3">今日薄弱知识点</h3>
                <div className="space-y-2">
                  {report.topWeakChapters.map((w, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-rust/5 border border-rust/15">
                      <span className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-mono bg-rust/15 text-rust shrink-0">
                        {i + 1}
                      </span>
                      <span className="text-sm text-bone-dim flex-1 truncate">
                        <span className="text-bone-faint">{w.subject}</span> / {w.chapter}
                      </span>
                      <span className="text-xs text-rust font-mono shrink-0">{w.count} 道</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 次日建议 */}
            <div>
              <h3 className="text-xs font-medium text-bone-faint tracking-wider uppercase mb-3">次日规划建议</h3>
              <div className="rounded-xl bg-amber/5 border border-amber/12 px-4 py-3 space-y-1.5">
                <SuggestionItem text="复习今日新增错题，巩固薄弱知识点" />
                <SuggestionItem text="针对薄弱章节生成专项练习，定向突破" />
                <SuggestionItem text="保持学习节奏，继续加油！" />
              </div>
            </div>

            {report.totalQuizzes + report.totalChats + report.totalReviews + report.totalNewWrong === 0 && (
              <div className="py-8 text-center text-sm text-bone-faint">
                今日暂无学习记录，开始学习后日报将自动更新
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: number
  tone: 'amber' | 'sage' | 'rust' | 'blue'
}) {
  const toneClass = {
    amber: 'text-amber',
    sage: 'text-sage-glow',
    rust: 'text-rust',
    blue: 'text-[#3b82f6]',
  }[tone]
  return (
    <div className="rounded-xl glass border border-amber/8 p-3">
      <div className="flex items-center gap-1 text-bone-faint mb-1.5">
        <span className={cn('shrink-0', toneClass)}>{icon}</span>
        <span className="text-[10px]">{label}</span>
      </div>
      <span className={cn('font-display text-2xl', toneClass)}>{value}</span>
    </div>
  )
}

function SuggestionItem({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 text-xs text-bone-dim">
      <span className="text-amber mt-0.5">•</span>
      <span>{text}</span>
    </div>
  )
}
