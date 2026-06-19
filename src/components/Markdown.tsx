// Markdown 渲染组件：代码语法高亮、LaTeX 公式、Mermaid 图表、代码一键复制运行
import { useState, useEffect, useRef, type ReactElement, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeHighlight from 'rehype-highlight'
import rehypeKatex from 'rehype-katex'
import mermaid from 'mermaid'
import { Copy, Check, Play, Terminal, AlertCircle } from 'lucide-react'
import 'katex/dist/katex.min.css'

// 初始化 Mermaid（浅色主题）
mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose', fontFamily: 'inherit' })

interface MarkdownProps {
  content: string
  className?: string
  /** 流式输出中：为 true 时跳过 Mermaid 渲染（避免不完整图表解析失败） */
  streaming?: boolean
}

/** 从 React children 中递归提取纯文本（用于获取代码块原始内容） */
function extractText(node: ReactNode): string {
  if (node == null || node === false) return ''
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (typeof node === 'object' && 'props' in node) {
    return extractText((node as ReactElement).props.children)
  }
  return ''
}

/** Mermaid 图表渲染 */
function MermaidBlock({ chart }: { chart: string }) {
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')
  const idRef = useRef(`mmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)

  useEffect(() => {
    let cancelled = false
    // trim 前后空白，避免 Mermaid 解析失败
    const trimmed = chart.trim()
    if (!trimmed) {
      setError('图表内容为空')
      return
    }
    // 使用唯一 id 避免冲突
    const renderId = `${idRef.current}-${Date.now()}`
    mermaid.parse(trimmed)
      .then(() => {
        if (cancelled) return
        return mermaid.render(renderId, trimmed)
      })
      .then(({ svg }) => {
        if (!cancelled && svg) { setSvg(svg); setError('') }
      })
      .catch((e) => {
        if (!cancelled) {
          // 重试一次：有时是 mermaid 内部状态问题
          const retryId = `${idRef.current}-retry-${Date.now()}`
          mermaid.render(retryId, trimmed)
            .then(({ svg }) => { if (!cancelled) { setSvg(svg); setError('') } })
            .catch((e2) => { if (!cancelled) setError((e2 as Error).message || String(e2)) })
        }
      })
    return () => { cancelled = true }
  }, [chart])

  if (error) {
    return (
      <div className="my-3 rounded-lg border border-rust/30 bg-rust/5 p-3 text-xs text-rust">
        <div className="flex items-center gap-1.5 mb-1"><AlertCircle className="w-3.5 h-3.5" />Mermaid 图表渲染失败</div>
        <pre className="text-bone-faint whitespace-pre-wrap text-[10px]">{chart}</pre>
      </div>
    )
  }
  return <div className="my-3 flex justify-center overflow-x-auto rounded-lg bg-white/40 border border-amber/10 p-4" dangerouslySetInnerHTML={{ __html: svg }} />
}

/** 代码块：带复制 + 运行按钮 */
function CodeBlockWrapper({ code, lang, children }: { code: string; lang: string; children: ReactNode }) {
  const [copied, setCopied] = useState(false)
  const [output, setOutput] = useState<{ ok: boolean; text: string } | null>(null)

  const copy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const runnable = ['javascript', 'js', 'typescript', 'ts'].includes(lang)

  const run = () => {
    const logs: string[] = []
    const fakeConsole = {
      log: (...args: unknown[]) => logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
      error: (...args: unknown[]) => logs.push(args.map(String).join(' ')),
      warn: (...args: unknown[]) => logs.push(args.map(String).join(' ')),
      info: (...args: unknown[]) => logs.push(args.map(String).join(' ')),
    }
    try {
      // 沙箱执行：用 new Function 隔离作用域，捕获 console 输出
      const fn = new Function('console', code)
      const result = fn(fakeConsole)
      if (result !== undefined) logs.push(String(result))
      setOutput({ ok: true, text: logs.join('\n') || '（执行完成，无输出）' })
    } catch (e) {
      setOutput({ ok: false, text: `${(e as Error).name}: ${(e as Error).message}` })
    }
  }

  return (
    <div className="code-block-wrapper my-3 rounded-xl overflow-hidden border border-amber/15 bg-ink-850/50">
      <div className="flex items-center justify-between px-3 py-1.5 bg-ink-850/80 border-b border-amber/10">
        <span className="text-[10px] font-mono uppercase tracking-wider text-bone-faint">{lang || 'text'}</span>
        <div className="flex items-center gap-1">
          <button onClick={copy} className="flex items-center gap-1 text-[10px] text-bone-muted hover:text-amber px-1.5 py-0.5 rounded transition-colors">
            {copied ? <Check className="w-3 h-3 text-sage-glow" /> : <Copy className="w-3 h-3" />}
            {copied ? '已复制' : '复制'}
          </button>
          {runnable && (
            <button onClick={run} className="flex items-center gap-1 text-[10px] text-bone-muted hover:text-sage-glow px-1.5 py-0.5 rounded transition-colors">
              <Play className="w-3 h-3" /> 运行
            </button>
          )}
        </div>
      </div>
      <pre className="!my-0 !bg-transparent overflow-x-auto">{children}</pre>
      {output && (
        <div className={`border-t px-3 py-2 text-xs font-mono ${output.ok ? 'border-sage/20 bg-sage/5 text-sage-glow' : 'border-rust/20 bg-rust/5 text-rust'}`}>
          <div className="flex items-center gap-1 mb-1 opacity-70"><Terminal className="w-3 h-3" />运行输出</div>
          <pre className="whitespace-pre-wrap">{output.text}</pre>
        </div>
      )}
    </div>
  )
}

export default function Markdown({ content, className, streaming }: MarkdownProps) {
  return (
    <div className={`prose ${className || ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }], rehypeKatex]}
        components={{
          a: ({ node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
          pre: ({ children }) => {
            const codeEl = children as ReactElement
            const className = (codeEl?.props?.className as string) || ''
            const match = /language-(\w+)/.exec(className)
            const lang = match?.[1] || ''
            const code = extractText(codeEl?.props?.children).replace(/\n$/, '')

            // 流式输出中：Mermaid 内容不完整，显示原始代码而非渲染
            if (lang === 'mermaid') {
              if (streaming) {
                return (
                  <div className="my-3 rounded-lg border border-amber/20 bg-amber/5 p-3 text-xs">
                    <div className="text-bone-faint mb-1">Mermaid 图表生成中…</div>
                    <pre className="text-bone-dim whitespace-pre-wrap text-[10px]">{code}</pre>
                  </div>
                )
              }
              return <MermaidBlock chart={code} />
            }

            return <CodeBlockWrapper code={code} lang={lang}>{children}</CodeBlockWrapper>
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
