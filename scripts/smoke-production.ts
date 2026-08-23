import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const port = 43117
const dataDir = mkdtempSync(join(tmpdir(), 'cs-assistant-smoke-'))
const child = spawn(process.execPath, ['dist-server/server/index.js'], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, NODE_ENV: 'production' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let serverOutput = ''
child.stdout.on('data', (chunk) => { serverOutput += String(chunk) })
child.stderr.on('data', (chunk) => { serverOutput += String(chunk) })

async function waitForServer(): Promise<void> {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/config`)
      if (response.ok) return
    } catch {
      // 服务尚在启动
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`生产服务启动超时\n${serverOutput}`)
}

async function assertRoute(path: string, contentType: string): Promise<void> {
  const response = await fetch(`http://127.0.0.1:${port}${path}`)
  if (!response.ok) throw new Error(`${path} returned ${response.status}`)
  const actual = response.headers.get('content-type') || ''
  if (!actual.includes(contentType)) throw new Error(`${path} content-type ${actual}`)
}

try {
  await waitForServer()
  await assertRoute('/', 'text/html')
  await assertRoute('/api/config', 'application/json')
  await assertRoute('/api/knowledge/catalog', 'application/json')
  await assertRoute('/api/llm/health', 'application/json')
  console.log('生产冒烟测试通过：SPA、配置、知识库与 LLM 代理健康检查均可用。')
} finally {
  child.kill()
  await new Promise<void>((resolve) => {
    if (child.exitCode !== null) resolve()
    else {
      child.once('exit', () => resolve())
      setTimeout(resolve, 2_000)
    }
  })
  rmSync(dataDir, { recursive: true, force: true })
}
