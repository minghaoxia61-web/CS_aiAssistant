// 资料库页：上传 / 解析 / 科目分组 / 管理
import { useEffect, useState, useCallback } from 'react'
import { Library as LibraryIcon, Upload, FileText, Trash2, Loader2, CheckCircle2, AlertCircle, Plus } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'
import { useStore } from '@/lib/store'
import { formatBytes, formatTime } from '@/lib/utils'
import type { Material } from '@/shared/types'

const TYPE_LABEL: Record<string, string> = {
  pdf: 'PDF', docx: 'DOCX', doc: 'DOC', pptx: 'PPTX', txt: 'TXT', md: 'MD', unknown: 'FILE',
}

export default function Library() {
  const { subjects, currentSubjectId, createSubject, loadSubjects } = useStore()
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<Material | null>(null)

  const subject = subjects.find((s) => s.id === currentSubjectId)

  const refresh = useCallback(async () => {
    if (!currentSubjectId) {
      setMaterials([])
      return
    }
    setLoading(true)
    const list = await window.api.getMaterials(currentSubjectId)
    setMaterials(list)
    setLoading(false)
  }, [currentSubjectId])

  useEffect(() => {
    refresh()
  }, [refresh])

  // 监听解析进度更新
  useEffect(() => {
    const off = window.api.onMaterialUpdated((payload) => {
      setMaterials((prev) =>
        prev.map((m) =>
          m.id === payload.id
            ? { ...m, status: payload.status as Material['status'], filetype: payload.filetype || m.filetype }
            : m
        )
      )
    })
    return off
  }, [])

  const handleUpload = async () => {
    if (!currentSubjectId) return
    const paths = await window.api.pickFiles()
    if (paths.length === 0) return
    await window.api.uploadMaterials(currentSubjectId, paths)
    refresh()
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('确认删除该资料？')) return
    await window.api.deleteMaterial(id)
    refresh()
  }

  if (subjects.length === 0) {
    return (
      <div className="h-full overflow-y-auto">
        <PageHeader title="资料库" subtitle="上传课程 PPT、往年试卷、讲义等复习资料" icon={<LibraryIcon className="w-5 h-5" />} />
        <EmptyState
          icon={<LibraryIcon className="w-7 h-7" />}
          title="还没有考试科目"
          desc="先创建一个考试科目（如「操作系统」），再上传该科目的复习资料。"
          action={
            <button
              className="btn-primary"
              onClick={async () => {
                const name = window.prompt('请输入科目名称')
                if (name?.trim()) await createSubject(name.trim(), '#e8b974')
              }}
            >
              <Plus className="w-4 h-4" /> 创建科目
            </button>
          }
        />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="资料库"
        subtitle={subject ? `当前科目：${subject.name}` : '上传课程 PPT、往年试卷、讲义等复习资料'}
        icon={<LibraryIcon className="w-5 h-5" />}
        actions={
          <button className="btn-primary" onClick={handleUpload}>
            <Upload className="w-4 h-4" /> 上传资料
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto px-8 py-6">
        {/* 上传引导区 */}
        <button
          onClick={handleUpload}
          className="w-full border-2 border-dashed border-amber/15 rounded-2xl py-10 flex flex-col items-center gap-3 text-bone-muted hover:border-amber/35 hover:bg-amber/4 transition-all group"
        >
          <div className="w-12 h-12 rounded-xl bg-amber/8 border border-amber/15 flex items-center justify-center group-hover:bg-amber/12 transition-colors">
            <Upload className="w-5 h-5 text-amber" />
          </div>
          <div className="text-sm">
            <span className="text-amber font-medium">点击选择文件</span> 上传资料
          </div>
          <p className="text-xs text-bone-faint">支持 PDF / DOCX / PPTX / TXT / MD，自动解析提取文本</p>
        </button>

        {/* 资料列表 */}
        <div className="mt-6 space-y-2.5">
          {loading && materials.length === 0 && (
            <div className="text-center py-8 text-bone-muted text-sm flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> 加载中...
            </div>
          )}
          {!loading && materials.length === 0 && (
            <p className="text-center py-8 text-bone-faint text-sm">该科目暂无资料，点击上方上传</p>
          )}
          {materials.map((m) => (
            <div
              key={m.id}
              className="group flex items-center gap-4 p-4 rounded-xl bg-ink-850/60 border border-amber/8 hover:border-amber/20 hover:bg-ink-800/60 transition-all"
            >
              <div className="w-10 h-10 rounded-lg bg-amber/8 border border-amber/15 flex items-center justify-center shrink-0">
                <FileText className="w-4.5 h-4.5 text-amber" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-bone truncate font-medium">{m.filename}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber/10 text-amber-dim uppercase">
                    {TYPE_LABEL[m.filetype] || m.filetype}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-bone-faint mt-1">
                  <span>{formatBytes(m.size)}</span>
                  <span>·</span>
                  <span>{formatTime(m.created_at)}</span>
                  <StatusBadge status={m.status} />
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {m.status === 'ready' && (
                  <button
                    className="btn-ghost !px-2 !py-1.5 text-xs"
                    onClick={() => setPreview(m)}
                    title="预览文本"
                  >
                    预览
                  </button>
                )}
                <button
                  className="btn-ghost !px-2 !py-1.5 text-rust hover:!bg-rust/10"
                  onClick={() => handleDelete(m.id)}
                  title="删除"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 预览弹层 */}
      {preview && (
        <div
          className="fixed inset-0 z-50 bg-ink-950/70 backdrop-blur-sm flex items-center justify-center p-8 animate-fade-in"
          onClick={() => setPreview(null)}
        >
          <div
            className="glass-strong rounded-2xl w-full max-w-3xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-amber/10">
              <div className="flex items-center gap-2.5">
                <FileText className="w-4.5 h-4.5 text-amber" />
                <span className="text-sm text-bone font-medium">{preview.filename}</span>
              </div>
              <button className="btn-ghost !px-2 !py-1" onClick={() => setPreview(null)}>
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <pre className="text-sm text-bone-dim whitespace-pre-wrap font-sans leading-relaxed">
                {preview.text_content || '（无文本内容）'}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: Material['status'] }) {
  if (status === 'ready') {
    return (
      <span className="flex items-center gap-1 text-sage-glow">
        <CheckCircle2 className="w-3 h-3" /> 已就绪
      </span>
    )
  }
  if (status === 'parsing') {
    return (
      <span className="flex items-center gap-1 text-amber">
        <Loader2 className="w-3 h-3 animate-spin" /> 解析中
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span className="flex items-center gap-1 text-rust">
        <AlertCircle className="w-3 h-3" /> 解析失败
      </span>
    )
  }
  return <span className="text-bone-faint">待处理</span>
}
