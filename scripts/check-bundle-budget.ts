import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

interface Budget {
  label: string
  pattern: RegExp
  maxKb: number
  required?: boolean
}

const assetsDir = join(process.cwd(), 'dist', 'assets')
const files = readdirSync(assetsDir).map((name) => ({
  name,
  bytes: statSync(join(assetsDir, name)).size,
}))
const budgets: Budget[] = [
  { label: '应用入口 JS', pattern: /^index-[^.]+\.js$/, maxKb: 120, required: true },
  { label: '全局 CSS', pattern: /^index-[^.]+\.css$/, maxKb: 100, required: true },
  { label: '学习实验室路由', pattern: /^LearningLab-[^.]+\.js$/, maxKb: 65, required: true },
  { label: '设置路由', pattern: /^Setup-[^.]+\.js$/, maxKb: 55, required: true },
  { label: '个人信息路由', pattern: /^Profile-[^.]+\.js$/, maxKb: 80, required: true },
]

const violations: string[] = []
const rows = budgets.map((budget) => {
  const matched = files.filter((file) => budget.pattern.test(file.name))
  if (!matched.length && budget.required) violations.push(`${budget.label}: 未找到构建产物`)
  const largest = matched.sort((a, b) => b.bytes - a.bytes)[0]
  const sizeKb = largest ? Math.round((largest.bytes / 1024) * 10) / 10 : 0
  if (largest && sizeKb > budget.maxKb) {
    violations.push(`${budget.label}: ${sizeKb} KB > ${budget.maxKb} KB`)
  }
  return { asset: budget.label, sizeKb, budgetKb: budget.maxKb, file: largest?.name || '-' }
})

const exemptLarge = /^(transformers-|rag-worker-|pdf\.worker|min-|mermaid\.|wardley-|cytoscape)/
for (const file of files.filter((item) => item.name.endsWith('.js') && item.bytes > 700 * 1024)) {
  if (!exemptLarge.test(file.name)) violations.push(`未登记的大体积分包: ${file.name} (${Math.round(file.bytes / 1024)} KB)`)
}

console.table(rows)
if (violations.length) {
  violations.forEach((item) => console.error(`- ${item}`))
  process.exitCode = 1
} else {
  console.log('构建体积预算通过。')
}
