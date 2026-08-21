const fs = require('node:fs')
const path = require('node:path')

const root = process.cwd()
const catalogSource = fs.readFileSync(path.join(root, 'server', 'knowledge', 'catalog.ts'), 'utf8')
const categoriesBlock = catalogSource.match(/export const CATEGORIES = (\[[\s\S]*?\n\])/)
const articlesBlock = catalogSource.match(/export const CATALOG: KnowledgeArticle\[] = (\[[\s\S]*?\n\])/)

if (!categoriesBlock || !articlesBlock) throw new Error('无法解析知识库目录')

// catalog.ts 只包含对象字面量；转换为 JSON 前移除注释并补全属性引号。
function parseLiteral(source) {
  const json = source
    .replace(/\/\/.*$/gm, '')
    .replace(/([{,]\s*)([a-zA-Z][a-zA-Z0-9]*)(\s*:)/g, '$1"$2"$3')
    .replace(/'/g, '"')
    .replace(/,\s*([}\]])/g, '$1')
  return JSON.parse(json)
}

const categories = parseLiteral(categoriesBlock[1])
const catalog = parseLiteral(articlesBlock[1])
const outDir = path.join(root, 'public', 'api-data')
const articleDir = path.join(outDir, 'articles')
fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(articleDir, { recursive: true })

const articles = []
for (const article of catalog) {
  const content = fs.readFileSync(path.join(root, 'server', 'knowledge', `${article.slug}.md`), 'utf8')
  const payload = { article, content, materialId: `knowledge:${article.slug}` }
  const target = path.join(articleDir, `${article.slug}.json`)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, JSON.stringify(payload))
  articles.push({ ...article, content })
}

fs.writeFileSync(path.join(outDir, 'config.json'), JSON.stringify({
  baseUrl: '', apiKey: '', model: '', temperature: 0.7, maxTokens: 0, topP: 1, hasKey: false,
}))
fs.writeFileSync(path.join(outDir, 'catalog.json'), JSON.stringify({ categories, articles: catalog }))
fs.writeFileSync(path.join(outDir, 'knowledge.json'), JSON.stringify(articles))
console.log(`已生成静态知识 API：${articles.length} 篇文章`)
