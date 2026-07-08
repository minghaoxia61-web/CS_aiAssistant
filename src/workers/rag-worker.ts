// Web Worker：浏览器端文件解析 + 向量计算（后台线程，不阻塞 UI）
// 消息协议：
//   Main → Worker: { kind: 'parse', taskId, buffer, filename }
//                  { kind: 'embed', taskId, texts }   （阶段 3 启用）
//                  { kind: 'cancel', taskId }
//   Worker → Main: { taskId, event: 'progress', current, total, message }
//                  { taskId, event: 'done', result }
//                  { taskId, event: 'error', message }
import * as pdfjsLib from 'pdfjs-dist'
import mammoth from 'mammoth'
import JSZip from 'jszip'

// 配置 pdfjs worker：用 ?url 导入让 Vite 解析路径
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

// ---------- 消息类型 ----------
interface ParseMessage {
  kind: 'parse'
  taskId: string
  buffer: ArrayBuffer
  filename: string
}
interface EmbedMessage {
  kind: 'embed'
  taskId: string
  texts: string[]
}
interface CancelMessage {
  kind: 'cancel'
  taskId: string
}
type IncomingMessage = ParseMessage | EmbedMessage | CancelMessage

// 当前任务是否已取消
const cancelledTasks = new Set<string>()

// ---------- 发送消息 ----------
function send(msg: {
  taskId: string
  event: 'progress' | 'done' | 'error'
  current?: number
  total?: number
  message?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result?: any
}): void {
  postMessage(msg)
}

// ---------- 文件解析 ----------
function getFileType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  return ext
}

async function parsePdf(buffer: ArrayBuffer, taskId: string): Promise<string> {
  const data = new Uint8Array(buffer)
  const doc = await pdfjsLib.getDocument({ data }).promise
  const totalPages = doc.numPages
  const texts: string[] = []
  for (let i = 1; i <= totalPages; i++) {
    if (cancelledTasks.has(taskId)) throw new DOMException('Aborted', 'AbortError')
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    if (pageText.trim()) {
      texts.push(`[Page ${i}]\n${pageText.trim()}`)
    }
    send({
      taskId,
      event: 'progress',
      current: i,
      total: totalPages,
      message: `解析 PDF 第 ${i}/${totalPages} 页`,
    })
  }
  return texts.join('\n\n---\n\n').trim()
}

async function parseDocx(buffer: ArrayBuffer): Promise<string> {
  const result = await mammoth.extractRawText({ arrayBuffer: buffer })
  return (result.value || '').trim()
}

async function parsePptx(buffer: ArrayBuffer, taskId: string): Promise<string> {
  const zip = await JSZip.loadAsync(buffer)
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)\.xml/)?.[1] || '0', 10)
      const nb = parseInt(b.match(/slide(\d+)\.xml/)?.[1] || '0', 10)
      return na - nb
    })

  const texts: string[] = []
  for (let i = 0; i < slideFiles.length; i++) {
    if (cancelledTasks.has(taskId)) throw new DOMException('Aborted', 'AbortError')
    const xml = await zip.files[slideFiles[i]].async('string')
    const slideTexts = extractTextFromSlideXml(xml)
    if (slideTexts.length) {
      texts.push(`[Page ${i + 1}]\n${slideTexts.join('\n')}`)
    }
    send({
      taskId,
      event: 'progress',
      current: i + 1,
      total: slideFiles.length,
      message: `解析 PPTX 第 ${i + 1}/${slideFiles.length} 页`,
    })
  }
  return texts.join('\n\n---\n\n').trim()
}

function extractTextFromSlideXml(xml: string): string[] {
  const results: string[] = []
  const regex = /<a:t>([^<]*)<\/a:t>/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(xml)) !== null) {
    const text = decodeXmlEntities(match[1])
    if (text.trim()) results.push(text)
  }
  return results
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

async function parseText(buffer: ArrayBuffer): Promise<string> {
  const decoder = new TextDecoder('utf-8')
  const text = decoder.decode(buffer)
  if (!text.includes('\uFFFD')) return text.trim()
  // GBK 回退
  try {
    const gbkDecoder = new TextDecoder('gbk')
    const gbk = gbkDecoder.decode(buffer)
    if (!gbk.includes('\uFFFD')) return gbk.trim()
  } catch {
    // 不支持 GBK
  }
  return text.trim()
}

async function parseFile(
  buffer: ArrayBuffer,
  filename: string,
  taskId: string,
): Promise<{ text: string; filetype: string }> {
  const filetype = getFileType(filename)
  let text = ''
  switch (filetype) {
    case 'pdf':
      text = await parsePdf(buffer, taskId)
      break
    case 'docx':
      text = await parseDocx(buffer)
      break
    case 'pptx':
      text = await parsePptx(buffer, taskId)
      break
    case 'txt':
    case 'md':
    case 'markdown':
      text = await parseText(buffer)
      break
    case 'doc':
      text = '[该文件为旧版 .doc 格式，建议另存为 .docx 后上传以获得更好解析效果]'
      break
    default:
      // 尝试作为纯文本
      try {
        text = await parseText(buffer)
      } catch {
        text = `[暂不支持的文件类型: .${filetype}]`
      }
  }
  return { text, filetype }
}

// ---------- 向量化（transformers.js all-MiniLM-L6-v2，384 维） ----------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let embeddingPipeline: any = null

async function getEmbeddingPipeline() {
  if (embeddingPipeline) return embeddingPipeline
  const { pipeline, env } = await import('@xenova/transformers')
  // Web 环境：不从本地 /models 加载（避免 404），允许远程拉取并使用浏览器缓存
  env.allowLocalModels = false
  env.useBrowserCache = true
  // ONNX Runtime WASM 文件通过 CDN 加载，避免 Vite 打包后 WASM 路径丢失
  env.backends.onnx.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/'
  embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
  return embeddingPipeline
}

async function embedTexts(texts: string[], taskId: string): Promise<number[][]> {
  // 通知主线程：模型正在加载（首次约 23MB，后续命中缓存即时完成）
  send({ taskId, event: 'progress', current: 0, total: texts.length, message: 'loading-model' })
  const extractor = await getEmbeddingPipeline()
  send({ taskId, event: 'progress', current: 0, total: texts.length, message: `向量化 0/${texts.length}` })
  const BATCH = 8 // 批量向量化，平衡吞吐与内存
  const result: number[][] = []
  for (let i = 0; i < texts.length; i += BATCH) {
    if (cancelledTasks.has(taskId)) throw new DOMException('Aborted', 'AbortError')
    const batch = texts.slice(i, i + BATCH)
    const output = await extractor(batch, { pooling: 'mean', normalize: true })
    // output.dims = [batch, 384]，output.data 为扁平 Float32Array
    const dim = output.dims[output.dims.length - 1]
    const data = output.data as Float32Array
    for (let j = 0; j < batch.length; j++) {
      result.push(Array.from(data.subarray(j * dim, (j + 1) * dim)))
    }
    const done = Math.min(i + BATCH, texts.length)
    send({
      taskId,
      event: 'progress',
      current: done,
      total: texts.length,
      message: `向量化 ${done}/${texts.length}`,
    })
  }
  return result
}

// ---------- 消息处理 ----------
self.onmessage = async (e: MessageEvent<IncomingMessage>) => {
  const msg = e.data
  if (msg.kind === 'cancel') {
    cancelledTasks.add(msg.taskId)
    return
  }

  if (msg.kind === 'parse') {
    const { taskId, buffer, filename } = msg
    try {
      send({ taskId, event: 'progress', current: 0, total: 1, message: `开始解析: ${filename}` })
      const result = await parseFile(buffer, filename, taskId)
      if (cancelledTasks.has(taskId)) {
        send({ taskId, event: 'done', message: 'cancelled' })
        return
      }
      send({ taskId, event: 'done', result })
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        send({ taskId, event: 'done', message: 'cancelled' })
      } else {
        send({ taskId, event: 'error', message: (err as Error).message })
      }
    } finally {
      cancelledTasks.delete(taskId)
    }
    return
  }

  if (msg.kind === 'embed') {
    const { taskId, texts } = msg
    try {
      send({ taskId, event: 'progress', current: 0, total: texts.length, message: '加载向量模型...' })
      const vectors = await embedTexts(texts, taskId)
      if (cancelledTasks.has(taskId)) {
        send({ taskId, event: 'done', message: 'cancelled' })
        return
      }
      send({ taskId, event: 'done', result: vectors })
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        send({ taskId, event: 'done', message: 'cancelled' })
      } else {
        send({ taskId, event: 'error', message: (err as Error).message })
      }
    } finally {
      cancelledTasks.delete(taskId)
    }
    return
  }
}

export {}
