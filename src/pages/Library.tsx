// 资料库页：上传 / 解析 / 科目分组 / 标签筛选 / 批量管理
import { useEffect, useState, useCallback, useMemo, type DragEvent, type ReactNode } from 'react'
import {
  Library as LibraryIcon, Upload, FileText, Trash2, Loader2, CheckCircle2, AlertCircle, Plus,
  Tag, FolderInput, Square, CheckSquare, X, Image as ImageIcon,
} from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'
import { useStore } from '@/lib/store'
import { confirmDialog, promptDialog } from '@/lib/dialog'
import { formatBytes, formatTime, cn } from '@/lib/utils'
import type { Material, MaterialTag } from '@/shared/types'

const TYPE_LABEL: Record<string, string> = {
  pdf: 'PDF', docx: 'DOCX', doc: 'DOC', pptx: 'PPTX', txt: 'TXT', md: 'MD',
  jpg: 'JPG', jpeg: 'JPG', png: 'PNG', unknown: 'FILE',
}

/** 标签元信息：值 → 显示名 + 颜色 */
const TAG_META: Record<Exclude<MaterialTag, ''>, { label: string; cls: string }> = {
  lecture: { label: '讲义', cls: 'text-amber bg-amber/10 border-amber/20' },
  exam: { label: '试卷', cls: 'text-rust bg-rust/10 border-rust/20' },
  exercise: { label: '习题', cls: 'text-sage-glow bg-sage/10 border-sage/20' },
  notes: { label: '笔记', cls: 'text-bone bg-bone-muted/10 border-bone-muted/20' },
}

const TAG_FILTERS: { value: MaterialTag | 'all'; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'lecture', label: '讲义' },
  { value: 'exam', label: '试卷' },
  { value: 'exercise', label: '习题' },
  { value: 'notes', label: '笔记' },
]

/** 从路径中取文件名（渲染进程无 node path 模块） */
function basename(p: string): string {
  const parts = p.split(/[\\/]/)
  return parts[parts.length - 1] || p
}

/** 去重检查：返回重复文件名与待上传路径 */
function checkDuplicates(paths: string[], existingNames: Set<string>): { dups: string[]; fresh: string[] } {
  const dups: string[] = []
  const fresh: string[] = []
  for (const p of paths) {
    const name = basename(p)
    if (existingNames.has(name)) dups.push(name)
    else fresh.push(p)
  }
  return { dups, fresh }
}

export default function Library() {
  const { subjects, currentSubjectId, createSubject } = useStore()
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<Material | null>(null)
  const [tagFilter, setTagFilter] = useState<MaterialTag | 'all'>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<'none' | 'tag' | 'move'>('none')
  const [dragging, setDragging] = useState(false)

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

  // 切换科目时清空选择
  useEffect(() => {
    setSelectedIds(new Set())
    setTagFilter('all')
  }, [currentSubjectId])

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

  // 按标签筛选
  const filteredMaterials = useMemo(() => {
    if (tagFilter === 'all') return materials
    return materials.filter((m) => (m.tag || '') === tagFilter)
  }, [materials, tagFilter])

  const selectedCount = selectedIds.size
  const allFilteredSelected = filteredMaterials.length > 0 && filteredMaterials.every((m) => selectedIds.has(m.id))

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const m of filteredMaterials) next.delete(m.id)
        return next
      })
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const m of filteredMaterials) next.add(m.id)
        return next
      })
    }
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
    setMenu('none')
  }

  /** 上传一组文件路径，含去重提示 */
  const uploadPaths = useCallback(async (paths: string[]) => {
    if (!currentSubjectId || paths.length === 0) return
    const existingNames = new Set(materials.map((m) => m.filename))
    const { dups, fresh } = checkDuplicates(paths, existingNames)
    let toUpload = fresh
    if (dups.length > 0) {
      const proceed = await confirmDialog(
        `以下文件已存在：\n${dups.map((n) => `· ${n}`).join('\n')}\n\n是否仍要上传（将创建副本）？`,
        { title: '文件去重', confirmText: '仍要上传', danger: true },
      )
      if (proceed) toUpload = paths
    }
    if (toUpload.length === 0) return
    await window.api.uploadMaterials(currentSubjectId, toUpload)
    refresh()
  }, [currentSubjectId, materials, refresh])

  const handleUpload = async () => {
    if (!currentSubjectId) return
    const paths = await window.api.pickFiles()
    if (paths.length === 0) return
    await uploadPaths(paths)
  }

  // 拖拽上传：支持图片（及其他文档）
  const handleDrop = async (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (!currentSubjectId) return
    const files = Array.from(e.dataTransfer.files)
    // Electron 在 File 对象上扩展了 path 属性
    const paths = files
      .map((f) => (f as File & { path?: string }).path)
      .filter((p): p is string => !!p)
    if (paths.length === 0) return
    await uploadPaths(paths)
  }

  const handleDelete = async (id: string) => {
    if (!(await confirmDialog('确认删除该资料？', { danger: true }))) return
    await window.api.deleteMaterial(id)
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    refresh()
  }

  // 批量删除
  const handleBatchDelete = async () => {
    setMenu('none')
    if (selectedCount === 0) return
    if (!(await confirmDialog(`确认删除选中的 ${selectedCount} 份资料？此操作不可撤销。`, { danger: true }))) return
    for (const id of selectedIds) {
      await window.api.deleteMaterial(id)
    }
    clearSelection()
    refresh()
  }

  // 批量设置标签
  const handleBatchSetTag = async (tag: MaterialTag) => {
    setMenu('none')
    for (const id of selectedIds) {
      await window.api.updateMaterial(id, { tag })
    }
    clearSelection()
    refresh()
  }

  // 单个设置标签
  const handleSetTag = async (id: string, tag: MaterialTag) => {
    await window.api.updateMaterial(id, { tag })
    refresh()
  }

  // 批量移动到其他科目
  const handleBatchMove = async (targetSubjectId: string) => {
    setMenu('none')
    for (const id of selectedIds) {
      await window.api.updateMaterial(id, { subject_id: targetSubjectId })
    }
    clearSelection()
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
                const name = await promptDialog('请输入科目名称', { placeholder: '操作系统' })
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
        {/* 上传引导区（支持拖拽图片） */}
        <button
          onClick={handleUpload}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={cn(
            'w-full border-2 border-dashed rounded-2xl py-10 flex flex-col items-center gap-3 text-bone-muted hover:bg-amber/4 transition-all group',
            dragging ? 'border-amber/50 bg-amber/8' : 'border-amber/15 hover:border-amber/35',
          )}
        >
          <div className="w-12 h-12 rounded-xl bg-amber/8 border border-amber/15 flex items-center justify-center group-hover:bg-amber/12 transition-colors">
            <Upload className="w-5 h-5 text-amber" />
          </div>
          <div className="text-sm">
            <span className="text-amber font-medium">点击选择文件</span> 或拖拽到此处上传
          </div>
          <p className="text-xs text-bone-faint flex items-center gap-1.5">
            <ImageIcon className="w-3 h-3" />
            支持 PDF / DOCX / PPTX / TXT / MD / 图片(JPG·PNG)，图片自动 OCR 识别
          </p>
        </button>

        {/* 标签筛选 + 批量操作工具栏 */}
        {materials.length > 0 && (
          <div className="mt-6 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              {TAG_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setTagFilter(f.value)}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-xs border transition-all',
                    tagFilter === f.value
                      ? 'bg-amber/15 border-amber/40 text-amber'
                      : 'border-amber/10 text-bone-faint hover:text-bone-muted hover:border-amber/25',
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {selectedCount > 0 ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-amber mr-1">已选 {selectedCount} 项</span>
                {/* 批量设标签 */}
                <div className="relative">
                  <button className="btn-ghost !px-2.5 !py-1.5 text-xs" onClick={() => setMenu(menu === 'tag' ? 'none' : 'tag')}>
                    <Tag className="w-3.5 h-3.5" /> 设标签
                  </button>
                  {menu === 'tag' && (
                    <DropdownMenu onClose={() => setMenu('none')}>
                      {(Object.keys(TAG_META) as Exclude<MaterialTag, ''>[]).map((t) => (
                        <button
                          key={t}
                          className="block w-full text-left px-3 py-1.5 text-xs text-bone-dim hover:bg-amber/10 hover:text-amber rounded"
                          onClick={() => handleBatchSetTag(t)}
                        >
                          {TAG_META[t].label}
                        </button>
                      ))}
                      <button
                        className="block w-full text-left px-3 py-1.5 text-xs text-bone-faint hover:bg-ink-700 rounded border-t border-amber/8 mt-1 pt-1.5"
                        onClick={() => handleBatchSetTag('')}
                      >
                        清除标签
                      </button>
                    </DropdownMenu>
                  )}
                </div>
                {/* 批量移动到科目 */}
                <div className="relative">
                  <button className="btn-ghost !px-2.5 !py-1.5 text-xs" onClick={() => setMenu(menu === 'move' ? 'none' : 'move')}>
                    <FolderInput className="w-3.5 h-3.5" /> 移动到
                  </button>
                  {menu === 'move' && (
                    <DropdownMenu onClose={() => setMenu('none')}>
                      {subjects.filter((s) => s.id !== currentSubjectId).length === 0 ? (
                        <span className="block px-3 py-1.5 text-xs text-bone-faint">没有其他科目</span>
                      ) : (
                        subjects.filter((s) => s.id !== currentSubjectId).map((s) => (
                          <button
                            key={s.id}
                            className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs text-bone-dim hover:bg-amber/10 hover:text-amber rounded"
                            onClick={() => handleBatchMove(s.id)}
                          >
                            <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                            {s.name}
                          </button>
                        ))
                      )}
                    </DropdownMenu>
                  )}
                </div>
                {/* 批量删除 */}
                <button className="btn-ghost !px-2.5 !py-1.5 text-xs text-rust hover:!bg-rust/10" onClick={handleBatchDelete}>
                  <Trash2 className="w-3.5 h-3.5" /> 删除
                </button>
                <button className="btn-ghost !px-2 !py-1.5 text-xs" onClick={clearSelection} title="取消选择">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              filteredMaterials.length > 0 && (
                <button
                  className="text-xs text-bone-faint hover:text-amber flex items-center gap-1.5"
                  onClick={toggleSelectAll}
                >
                  {allFilteredSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                  {allFilteredSelected ? '取消全选' : '全选'}
                </button>
              )
            )}
          </div>
        )}

        {/* 资料列表 */}
        <div className="mt-4 space-y-2.5">
          {loading && materials.length === 0 && (
            <div className="text-center py-8 text-bone-muted text-sm flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> 加载中...
            </div>
          )}
          {!loading && materials.length === 0 && (
            <p className="text-center py-8 text-bone-faint text-sm">该科目暂无资料，点击上方上传</p>
          )}
          {!loading && materials.length > 0 && filteredMaterials.length === 0 && (
            <p className="text-center py-8 text-bone-faint text-sm">该标签下暂无资料</p>
          )}
          {filteredMaterials.map((m) => (
            <div
              key={m.id}
              className={cn(
                'group flex items-center gap-3 p-4 rounded-xl bg-ink-850/60 border transition-all',
                selectedIds.has(m.id) ? 'border-amber/40 bg-amber/5' : 'border-amber/8 hover:border-amber/20 hover:bg-ink-800/60',
              )}
            >
              {/* 选择框 */}
              <button
                className="shrink-0 text-bone-faint hover:text-amber"
                onClick={() => toggleSelect(m.id)}
                title={selectedIds.has(m.id) ? '取消选择' : '选择'}
              >
                {selectedIds.has(m.id) ? <CheckSquare className="w-4 h-4 text-amber" /> : <Square className="w-4 h-4" />}
              </button>

              <div className="w-10 h-10 rounded-lg bg-amber/8 border border-amber/15 flex items-center justify-center shrink-0">
                <FileText className="w-4.5 h-4.5 text-amber" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-bone truncate font-medium">{m.filename}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber/10 text-amber-dim uppercase">
                    {TYPE_LABEL[m.filetype] || m.filetype}
                  </span>
                  {m.tag && TAG_META[m.tag] && (
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded border', TAG_META[m.tag].cls)}>
                      {TAG_META[m.tag].label}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-bone-faint mt-1">
                  <span>{formatBytes(m.size)}</span>
                  <span>·</span>
                  <span>{formatTime(m.created_at)}</span>
                  <StatusBadge status={m.status} />
                </div>
              </div>

              {/* 单项标签快捷设置 */}
              <TagMenu material={m} onSetTag={handleSetTag} />

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
          className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-8 animate-fade-in"
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

/** 下拉菜单容器（点击外部关闭） */
function DropdownMenu({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-full mt-1 z-50 min-w-[140px] glass-strong rounded-lg border border-amber/15 p-1 shadow-xl">
        {children}
      </div>
    </>
  )
}

/** 单项标签选择菜单 */
function TagMenu({ material, onSetTag }: { material: Material; onSetTag: (id: string, tag: MaterialTag) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        className="btn-ghost !px-2 !py-1.5 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => setOpen(!open)}
        title="设置标签"
      >
        <Tag className="w-3.5 h-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 min-w-[120px] glass-strong rounded-lg border border-amber/15 p-1 shadow-xl">
            {(Object.keys(TAG_META) as Exclude<MaterialTag, ''>[]).map((t) => (
              <button
                key={t}
                className={cn(
                  'block w-full text-left px-3 py-1.5 text-xs rounded hover:bg-amber/10',
                  material.tag === t ? 'text-amber' : 'text-bone-dim',
                )}
                onClick={() => { onSetTag(material.id, t); setOpen(false) }}
              >
                {TAG_META[t].label}
              </button>
            ))}
            <button
              className="block w-full text-left px-3 py-1.5 text-xs text-bone-faint hover:bg-ink-700 rounded border-t border-amber/8 mt-1 pt-1.5"
              onClick={() => { onSetTag(material.id, ''); setOpen(false) }}
            >
              清除标签
            </button>
          </div>
        </>
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
