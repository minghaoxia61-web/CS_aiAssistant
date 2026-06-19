// 思维导图组件：将 Markdown 大纲渲染为思维导图，支持导出 PNG/Markdown/OPML
import { useState, useEffect } from 'react'
import { Network, Download, FileText, FileType2, Loader2, AlertCircle } from 'lucide-react'
import { markdownOutlineToMermaid, renderMermaid, exportSvgAsPng, exportTextFile, markdownToOpml } from '@/lib/mindmap'

interface MindMapProps {
  content: string
  title?: string
}

export default function MindMap({ content, title = '复习大纲' }: MindMapProps) {
  const [svg, setSvg] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const chart = markdownOutlineToMermaid(content)
    renderMermaid(chart)
      .then((s) => { if (!cancelled) { setSvg(s); setError(''); setLoading(false) } })
      .catch((e) => { if (!cancelled) { setError((e as Error).message); setLoading(false) } })
    return () => { cancelled = true }
  }, [content])

  const exportPng = () => { if (svg) exportSvgAsPng(svg, `${title}-思维导图.png`) }
  const exportMd = () => exportTextFile(content, `${title}.md`, 'text/markdown;charset=utf-8')
  const exportOpml = () => exportTextFile(markdownToOpml(content, title), `${title}.opml`, 'application/xml;charset=utf-8')

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-xl text-bone flex items-center gap-2">
          <Network className="w-5 h-5 text-amber" />思维导图
        </h3>
        <div className="flex items-center gap-2">
          <button className="btn-ghost !px-2 !py-1 text-xs" onClick={exportPng} disabled={!svg || loading}>
            <Download className="w-3.5 h-3.5" /> PNG 图片
          </button>
          <button className="btn-ghost !px-2 !py-1 text-xs" onClick={exportMd}>
            <FileText className="w-3.5 h-3.5" /> Markdown
          </button>
          <button className="btn-ghost !px-2 !py-1 text-xs" onClick={exportOpml}>
            <FileType2 className="w-3.5 h-3.5" /> OPML
          </button>
        </div>
      </div>
      <div className="panel p-6 min-h-[300px]">
        {loading && (
          <div className="flex items-center justify-center py-16 text-bone-muted">
            <Loader2 className="w-5 h-5 mr-2 animate-spin text-amber" />生成思维导图中...
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 text-rust py-8 justify-center">
            <AlertCircle className="w-4 h-4" />{error}
          </div>
        )}
        {!loading && !error && (
          <div className="flex justify-center overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />
        )}
      </div>
      <p className="text-xs text-bone-faint mt-2">
        提示：导出的 Markdown 可直接导入幕布；OPML 可导入 XMind、MindMaster 等思维导图软件
      </p>
    </div>
  )
}
