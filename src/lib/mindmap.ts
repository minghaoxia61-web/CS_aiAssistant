// 思维导图工具：Markdown 大纲 ↔ Mermaid mindmap 转换 + 导出
import mermaid from 'mermaid'

mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose', fontFamily: 'inherit' })

let renderId = 0

/** 将 Markdown 大纲（标题/列表）转为 Mermaid mindmap 语法 */
export function markdownOutlineToMermaid(content: string): string {
  const lines = content.split('\n')
  let result = 'mindmap\n  root((复习大纲))\n'
  let rootSet = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // 标题层级
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(trimmed)
    if (headingMatch) {
      const level = headingMatch[1].length
      // 去除 mermaid 不支持的特殊字符
      const text = headingMatch[2].replace(/[(){}[\]:"|]/g, '').trim()
      if (level === 1 && !rootSet) {
        result = `mindmap\n  root((${text}))\n`
        rootSet = true
      } else {
        const indent = '  '.repeat(level) // # level2 → 4空格, # level3 → 6空格
        result += `${indent}${text}\n`
      }
      continue
    }

    // 列表项（支持 - * + 和数字列表）
    const listMatch = /^(\s*)[-*+]\s+(.+)$/.exec(line)
    if (listMatch) {
      const indent = listMatch[1].length
      const level = Math.min(Math.floor(indent / 2) + 3, 8)
      const text = listMatch[2].replace(/[(){}[\]:"|]/g, '').trim()
      result += `${'  '.repeat(level)}${text}\n`
      continue
    }
  }

  return result
}

/** 渲染 Mermaid 为 SVG 字符串 */
export async function renderMermaid(chart: string): Promise<string> {
  const id = `mindmap-${++renderId}`
  const { svg } = await mermaid.render(id, chart)
  return svg
}

/** 将 SVG 字符串导出为 PNG 图片下载 */
export function exportSvgAsPng(svgString: string, filename: string): void {
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)
  const img = new Image()
  img.onload = () => {
    const canvas = document.createElement('canvas')
    const scale = 2
    canvas.width = (img.width || 800) * scale
    canvas.height = (img.height || 600) * scale
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.scale(scale, scale)
    ctx.drawImage(img, 0, 0)
    URL.revokeObjectURL(url)
    canvas.toBlob((blob) => {
      if (!blob) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename
      a.click()
      URL.revokeObjectURL(a.href)
    })
  }
  img.src = url
}

/** 导出文本文件（Markdown / OPML 等） */
export function exportTextFile(content: string, filename: string, mime = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

/** 将 Markdown 大纲转为 OPML 格式（兼容 XMind） */
export function markdownToOpml(content: string, title = '复习大纲'): string {
  interface Node { text: string; children: Node[] }
  const root: Node = { text: title, children: [] }
  const stack: { node: Node; level: number }[] = [{ node: root, level: 0 }]

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue

    let level = -1
    let text = ''

    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(trimmed)
    if (headingMatch) {
      level = headingMatch[1].length
      text = headingMatch[2].trim()
    } else {
      const listMatch = /^(\s*)[-*+]\s+(.+)$/.exec(line)
      if (listMatch) {
        level = Math.floor(listMatch[1].length / 2) + 2
        text = listMatch[2].trim()
      }
    }

    if (level < 0) continue

    const node: Node = { text, children: [] }
    while (stack.length > 1 && stack[stack.length - 1].level >= level) stack.pop()
    stack[stack.length - 1].node.children.push(node)
    stack.push({ node, level })
  }

  const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  const nodeToXml = (node: Node): string => {
    const children = node.children.map(nodeToXml).join('')
    return `<outline text="${escapeXml(node.text)}">${children}</outline>`
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
<head><title>${escapeXml(title)}</title></head>
<body>
${nodeToXml(root)}
</body>
</opml>`
}
