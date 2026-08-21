import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const PATTERNS = [
  { name: 'OpenAI-compatible key', regex: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { name: 'GitHub token', regex: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g },
  { name: 'Google API key', regex: /\bAIza[0-9A-Za-z_-]{30,}\b/g },
  { name: 'Slack token', regex: /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/g },
]

function git(args: string[]): string {
  const result = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(result.stderr.trim() || `git ${args[0]} failed`)
  }
  return result.stdout
}

function scanCurrentTree(): string[] {
  const files = git(['ls-files', '-co', '--exclude-standard'])
    .split(/\r?\n/)
    .filter(Boolean)
  const findings: string[] = []
  for (const file of files) {
    let content: string
    try {
      content = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    if (content.includes('\0')) continue
    const lines = content.split(/\r?\n/)
    lines.forEach((line, index) => {
      if (line.includes('secret-scan:allow')) return
      for (const pattern of PATTERNS) {
        pattern.regex.lastIndex = 0
        if (pattern.regex.test(line)) findings.push(`${file}:${index + 1} [${pattern.name}]`)
      }
    })
  }
  return findings
}

function auditHistory(): string[] {
  const revisions = git(['rev-list', '--all']).split(/\r?\n/).filter(Boolean)
  if (!revisions.length) return []
  const expression = 'sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|AIza[0-9A-Za-z_-]{30,}|xox[baprs]-[0-9A-Za-z-]{20,}'
  const output = git(['grep', '-I', '-l', '-E', expression, ...revisions, '--'])
  return [...new Set(output.split(/\r?\n/).filter(Boolean).map((line) => {
    const separator = line.indexOf(':')
    if (separator < 0) return line
    return `${line.slice(0, Math.min(12, separator))} ${line.slice(separator + 1)}`
  }))]
}

const historyMode = process.argv.includes('--history')
const findings = historyMode ? auditHistory() : scanCurrentTree()
if (findings.length) {
  console.error(historyMode ? '历史密钥风险（仅显示提交与文件）：' : '当前工作树疑似密钥：')
  findings.slice(0, 100).forEach((finding) => console.error(`- ${finding}`))
  console.error(`共 ${findings.length} 处。${historyMode ? '请先轮换密钥，再评估是否重写 Git 历史。' : '请改用环境变量或密钥管理服务。'}`)
  process.exitCode = 1
} else {
  console.log(historyMode ? '未在可达 Git 历史中发现已知格式的密钥。' : '当前工作树密钥扫描通过。')
}
