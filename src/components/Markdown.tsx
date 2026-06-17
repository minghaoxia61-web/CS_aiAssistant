// Markdown 渲染组件
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

interface MarkdownProps {
  content: string
  className?: string
}

export default function Markdown({ content, className }: MarkdownProps) {
  return (
    <div className={`prose ${className || ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          a: ({ node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
          pre: ({ children }) => <pre>{children}</pre>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
