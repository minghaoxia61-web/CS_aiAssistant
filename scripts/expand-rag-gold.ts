import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

interface GoldCase {
  id: string
  query: string
  expectedMaterialId?: string
  expectedMaterialIds?: string[]
  expectedEvidence?: string
  expectedEvidenceByMaterial?: Record<string, string>
  sourceLabel: string
  category: string
  provenance: 'human' | 'curated'
  answerable?: boolean
}

function markdownFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = join(root, entry.name)
    return entry.isDirectory() ? markdownFiles(file) : file.endsWith('.md') ? [file] : []
  })
}

function compactEvidence(text: string): string {
  return text
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length >= 8 && !line.startsWith('#') && !line.startsWith('```') && !line.startsWith('|'))
    ?.replace(/^(?:[-*]\s+|\d+\.\s*)/, '')
    .slice(0, 70) || ''
}

const root = process.cwd()
const knowledgeRoot = join(root, 'server', 'knowledge')
const datasetPath = join(root, 'data', 'evaluation', 'rag-gold.json')
const original = JSON.parse(readFileSync(datasetPath, 'utf8')) as { cases: GoldCase[] }
const existing = original.cases
  .filter((item) => !item.provenance || item.provenance === 'human')
  .map((item) => ({ ...item, provenance: 'human' as const }))
const curated: GoldCase[] = []

for (const [fileIndex, file] of markdownFiles(knowledgeRoot).sort().entries()) {
  const materialId = relative(knowledgeRoot, file).replaceAll('\\', '/')
  const markdown = readFileSync(file, 'utf8')
  const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() || materialId
  const headings = [...markdown.matchAll(/^##{1,2}\s+(.+)$/gm)]
  const wanted = fileIndex < 14 ? 3 : 2
  let picked = 0
  for (const heading of headings) {
    if (picked >= wanted) break
    const start = (heading.index || 0) + heading[0].length
    const next = headings.find((item) => (item.index || 0) > (heading.index || 0))
    const section = markdown.slice(start, next?.index || markdown.length)
    const evidence = compactEvidence(section)
    if (!evidence) continue
    const index = picked++
    const topic = heading[1].replace(/^\d+\.\s*/, '').trim()
    const prompts = [
      `在“${title}”中，${topic}的核心定义或作用是什么？`,
      `如果需要解释${topic}，资料给出的关键要点是什么？`,
      `关于${title}的${topic}，最应记住的结论是什么？`,
    ]
    curated.push({
      id: `coverage-${materialId.replace(/\.md$/, '').replace('/', '-')}-${index + 1}`,
      query: prompts[index % prompts.length],
      expectedMaterialId: materialId,
      expectedEvidence: evidence,
      sourceLabel: `${title} · ${topic}`,
      category: index === 0 ? 'coverage-concept' : 'coverage-detail',
      provenance: 'curated',
    })
  }
}

const cross: GoldCase[] = [
  ['cross-array-search', '数组的随机访问与二分查找为什么能配合获得高效查询？', ['ds/array-linkedlist.md', 'algo/searching.md']],
  ['cross-stack-tree', '递归遍历二叉树时，调用栈与树的遍历过程分别起什么作用？', ['ds/stack-queue.md', 'ds/tree.md']],
  ['cross-graph-greedy', 'Kruskal 最小生成树如何同时体现图结构与贪心选择？', ['ds/graph.md', 'algo/greedy.md']],
  ['cross-sort-divide', '归并排序为什么既属于排序算法又是典型分治算法？', ['algo/sorting.md', 'algo/divide-conquer.md']],
  ['cross-dp-greedy', '贪心与动态规划在是否回溯历史决策方面有什么区别？', ['algo/dp.md', 'algo/greedy.md']],
  ['cross-index-transaction', '数据库索引提升查询速度时，事务并发控制还需要解决什么问题？', ['db/index.md', 'db/transaction.md']],
  ['cross-normalization-sql', '数据库范式如何影响 SQL 表结构设计？', ['db/normalization.md', 'db/sql.md']],
  ['cross-osi-tcp', 'TCP 在网络分层模型中位于哪一层，它又如何提供可靠传输？', ['net/osi-tcpip.md', 'net/tcp-udp.md']],
  ['cross-dns-http', '浏览器访问网站时，DNS 解析与 HTTP 请求的先后关系是什么？', ['net/dns.md', 'net/http.md']],
  ['cross-language-types', 'C、Java 与 Python 在类型系统和运行方式上有什么差异？', ['lang/c-basics.md', 'lang/java-basics.md', 'lang/python-basics.md']],
].map(([id, query, expectedMaterialIds]) => ({
  id: id as string,
  query: query as string,
  expectedMaterialIds: expectedMaterialIds as string[],
  sourceLabel: '跨资料综合问题',
  category: 'cross-material',
  provenance: 'curated' as const,
}))

const rejectionQueries = [
  ['reject-kubernetes', 'Kubernetes 的 Pod 调度器如何处理污点和容忍度？'],
  ['reject-rust', 'Rust 所有权系统中的生命周期标注如何工作？'],
  ['reject-compiler', 'LR(1) 项目集规范族如何构造？'],
  ['reject-blockchain', '以太坊智能合约的 Gas 费用如何计算？'],
  ['reject-graphics', '光栅化管线中的齐次裁剪如何实现？'],
  ['reject-ml', '反向传播如何推导卷积核的梯度？'],
  ['reject-crypto', 'RSA-OAEP 填充为什么能抵抗选择密文攻击？'],
  ['reject-devops', 'Terraform 的状态锁在远程后端中如何实现？'],
  ['reject-mobile', 'Android Jetpack Compose 如何处理重组？'],
  ['reject-distributed', 'Raft 算法怎样通过任期保证领导者唯一性？'],
]
const rejection: GoldCase[] = rejectionQueries.map(([id, query]) => ({
  id,
  query,
  expectedMaterialIds: [],
  sourceLabel: '语料外问题，应拒答',
  category: 'unanswerable',
  provenance: 'curated',
  answerable: false,
}))

const selectedCurated = curated.slice(0, 64)
const cases = [...existing, ...selectedCurated, ...cross, ...rejection]
if (cases.length !== 100) throw new Error(`预期生成 100 条，实际 ${cases.length} 条`)

writeFileSync(datasetPath, `${JSON.stringify({
  version: 2,
  description: '固定的计算机基础 RAG 评测集：16 条人工问题、64 条全语料覆盖问题、10 条跨资料问题和 10 条应拒答问题。',
  cases,
}, null, 2)}\n`)
console.log(`RAG 金标集已扩充到 ${cases.length} 条。`)
