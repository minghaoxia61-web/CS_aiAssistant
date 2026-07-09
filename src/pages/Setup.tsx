// 设置页：多 API 配置管理 / 连接测试 / 生成参数
// 列表为主，点击配置才展开编辑面板
import { useState, useEffect } from 'react'
import { ArrowLeft, Check, Loader2, Plug, Zap, Plus, Server, X, Edit3, Lock, Unlock, Copy, Trash2, HardDrive, Database, RefreshCw, Sparkles, Download } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '@/lib/store'
import { streamChat } from '@/lib/llm'
import { confirmDialog, promptDialog } from '@/lib/dialog'
import { cn } from '@/lib/utils'
import { getStorageStats, type StorageStats } from '@/lib/db'
import { loadDemoData, isDemoLoaded, type DemoProgress } from '@/lib/demo-data'
import type { ApiConfig, ApiConfigItem } from '@/shared/types'

const PRESETS: { name: string; baseUrl: string; model: string }[] = [
  { name: '智谱 GLM（免费）', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash-250414' },
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { name: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { name: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen2.5-7B-Instruct' },
  { name: '月之暗面', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { name: 'Pollinations（免费）', baseUrl: 'https://text.pollinations.ai/openai', model: 'openai-large' },
]

const EMPTY_FORM: ApiConfig = {
  baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  apiKey: '',
  model: 'glm-4-flash-250414',
  temperature: 0.7,
  maxTokens: 0,
  topP: 1,
}

export default function Setup() {
  const navigate = useNavigate()
  const { config, configs, loadConfigs, saveConfigItem, deleteConfigItem, switchConfig, loadSubjects } = useStore()

  const [showEditor, setShowEditor] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [form, setForm] = useState<ApiConfig>({ ...EMPTY_FORM })
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string; latency?: number } | null>(null)
  const [savedToast, setSavedToast] = useState(false)

  // 密码锁：开启后查看/编辑 API Key 需输入密码（密码哈希存于 localStorage）
  const [lockEnabled, setLockEnabled] = useState(() => localStorage.getItem('apiKeyLock_enabled') === 'true')
  const [keyUnlocked, setKeyUnlocked] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // 缓存清理
  const [clearing, setClearing] = useState<string | null>(null)
  const [clearToast, setClearToast] = useState('')
  // IndexedDB 存储统计
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)

  // 演示数据加载
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoProgress, setDemoProgress] = useState<DemoProgress | null>(null)
  const [demoLoaded, setDemoLoaded] = useState(false)

  useEffect(() => {
    isDemoLoaded().then(setDemoLoaded)
  }, [])

  const handleLoadDemo = async () => {
    setDemoLoading(true)
    setDemoProgress(null)
    try {
      await loadDemoData((p) => setDemoProgress(p))
      setDemoLoaded(true)
      refreshStats()
      loadSubjects()
    } catch (e) {
      console.error('Demo load failed:', e)
    } finally {
      setDemoLoading(false)
    }
  }

  useEffect(() => {
    loadConfigs()
    refreshStats()
  }, [loadConfigs])

  const refreshStats = async () => {
    setStatsLoading(true)
    try {
      const stats = await getStorageStats()
      setStorageStats(stats)
    } catch {
      // 非 IndexedDB 模式或获取失败，忽略
    } finally {
      setStatsLoading(false)
    }
  }

  // 格式化字节数
  const formatBytes = (bytes?: number) => {
    if (bytes === undefined) return '未知'
    if (bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
  }

  // 表名中文映射
  const tableLabels: Record<string, string> = {
    subjects: '科目',
    materials: '资料元数据',
    chunks: '文本分块',
    vectors: '向量索引',
    chatSessions: '对话记录',
    quizSessions: '测验记录',
    wrongQuestions: '错题本',
    reviewDocs: '复习文档',
    cache: '通用缓存',
  }

  const update = (patch: Partial<ApiConfig>) => setForm((f) => ({ ...f, ...patch }))

  const handleNew = () => {
    setEditingId(null)
    setFormName('')
    setForm({ ...EMPTY_FORM })
    setTestResult(null)
    setKeyUnlocked(true) // 新建配置可直接输入 Key
    setShowEditor(true)
  }

  const handleEdit = (item: ApiConfigItem) => {
    setEditingId(item.id)
    setFormName(item.name)
    setForm(stripMeta(item))
    setTestResult(null)
    setKeyUnlocked(false) // 编辑已有配置：Key 默认锁定
    setShowEditor(true)
  }

  const handleCloseEditor = () => {
    setShowEditor(false)
    setEditingId(null)
    setFormName('')
    setForm({ ...EMPTY_FORM })
    setTestResult(null)
    setKeyUnlocked(false)
  }

  const handleSwitch = async (item: ApiConfigItem) => {
    await switchConfig(item.id)
  }

  const handleDelete = async (id: string) => {
    if (!(await confirmDialog('确认删除该 API 配置？', { danger: true }))) return
    await deleteConfigItem(id)
    if (editingId === id) handleCloseEditor()
  }

  // ---------- 密码锁 ----------
  /** 用 Web Crypto API 对密码做 SHA-256 哈希 */
  async function hashPassword(pw: string): Promise<string> {
    const data = new TextEncoder().encode(pw)
    const buf = await crypto.subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }

  const handleToggleLock = async (next: boolean) => {
    if (next) {
      const pw = await promptDialog('设置密码锁：请输入查看/编辑 API Key 的密码', { placeholder: '输入密码' })
      if (!pw) return
      const pw2 = await promptDialog('请再次输入密码以确认', { placeholder: '再次输入密码' })
      if (pw !== pw2) {
        await confirmDialog('两次输入不一致，已取消', { danger: true })
        return
      }
      const hash = await hashPassword(pw)
      localStorage.setItem('apiKeyLock_enabled', 'true')
      localStorage.setItem('apiKeyLock_hash', hash)
      setLockEnabled(true)
      setKeyUnlocked(true)
    } else {
      const storedHash = localStorage.getItem('apiKeyLock_hash')
      if (storedHash) {
        const pw = await promptDialog('关闭密码锁：请输入当前密码', { placeholder: '输入密码' })
        if (!pw) return
        const hash = await hashPassword(pw)
        if (hash !== storedHash) {
          await confirmDialog('密码错误，无法关闭密码锁', { danger: true })
          return
        }
      }
      localStorage.removeItem('apiKeyLock_enabled')
      localStorage.removeItem('apiKeyLock_hash')
      setLockEnabled(false)
      setKeyUnlocked(true)
    }
  }

  const handleUnlock = async () => {
    const storedHash = localStorage.getItem('apiKeyLock_hash')
    if (!storedHash) {
      setKeyUnlocked(true)
      return
    }
    const pw = await promptDialog('请输入密码以查看/编辑 API Key', { placeholder: '输入密码' })
    if (!pw) return
    const hash = await hashPassword(pw)
    if (hash === storedHash) {
      setKeyUnlocked(true)
    } else {
      await confirmDialog('密码错误', { danger: true })
    }
  }

  // ---------- 导出配置（自动脱敏） ----------
  const maskedKey = form.apiKey ? '****' + form.apiKey.slice(-4) : ''

  const handleExport = async (item: ApiConfigItem) => {
    const exportData = {
      name: item.name,
      baseUrl: item.baseUrl,
      model: item.model,
      apiKey: item.apiKey ? '****' + item.apiKey.slice(-4) : '',
      temperature: item.temperature,
      maxTokens: item.maxTokens,
      topP: item.topP,
    }
    const text = JSON.stringify(exportData, null, 2)
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(item.id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      await confirmDialog('复制到剪贴板失败，请手动复制：\n' + text)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    const start = Date.now()
    try {
      let received = ''
      await streamChat({
        config: form,
        messages: [
          { role: 'system', content: '你是一个测试助手，请回复"连接成功"。' },
          { role: 'user', content: '测试' },
        ],
        onToken: (t) => (received += t),
        maxTokens: 32,
      })
      setTestResult({ ok: true, msg: received.trim() || '连接成功', latency: Date.now() - start })
    } catch (e) {
      setTestResult({ ok: false, msg: (e as Error).message, latency: Date.now() - start })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    const name = formName.trim() || `${PRESETS.find((p) => p.baseUrl === form.baseUrl)?.name || '自定义'} ${Date.now().toString().slice(-4)}`
    await saveConfigItem({
      id: editingId || undefined,
      name,
      ...form,
    })
    setSavedToast(true)
    setTimeout(() => setSavedToast(false), 2500)
    await loadConfigs()
    handleCloseEditor()
  }

  // ---------- 缓存清理 ----------
  const handleClearCache = async (type: 'chunks' | 'index' | 'chats' | 'all') => {
    const labels: Record<string, string> = {
      chunks: '资料解析缓存（chunks/）',
      index: '检索索引缓存（index/）',
      chats: '所有对话记录（chats/）',
      all: '全部缓存',
    }
    const msg =
      type === 'all'
        ? '将清空所有缓存：资料正文、检索索引、对话记录。资料元数据保留，但需重新解析才能恢复正文。确认继续？'
        : type === 'chats'
          ? '将删除所有对话记录，此操作不可恢复。确认继续？'
          : `将清理${labels[type]}。确认继续？`
    if (!(await confirmDialog(msg, { danger: true }))) return
    setClearing(type)
    try {
      await window.api.clearCache([type])
      setClearToast(`${labels[type]}已清理`)
      setTimeout(() => setClearToast(''), 2500)
      refreshStats()
    } catch {
      setClearToast('清理失败')
      setTimeout(() => setClearToast(''), 2500)
    } finally {
      setClearing(null)
    }
  }

  const handleClearParseCache = async () => {
    if (!(await confirmDialog('将清理解析缓存（文件哈希去重记录），不影响已解析的资料。确认继续？'))) return
    setClearing('parse')
    try {
      await window.api.clearParseCache()
      setClearToast('解析缓存已清理')
      setTimeout(() => setClearToast(''), 2500)
      refreshStats()
    } finally {
      setClearing(null)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-8 py-10 animate-fade-in">
        {/* 顶栏 */}
        <div className="flex items-center gap-3 mb-8">
          <button className="btn-ghost !px-2" onClick={() => navigate('/chat')}>
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="font-display text-3xl text-bone">API 设置</h2>
            <p className="text-sm text-bone-muted mt-1">接入你自己的大模型 API，支持配置多个并随时切换</p>
          </div>
        </div>

        {/* 配置列表 */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <span className="label !mb-0">已保存配置</span>
            <button className="btn-primary !py-1.5 text-xs" onClick={handleNew}>
              <Plus className="w-3.5 h-3.5" /> 新建配置
            </button>
          </div>

          {configs.length === 0 ? (
            <div className="panel p-12 text-center">
              <Server className="w-10 h-10 text-bone-faint mx-auto mb-3" />
              <p className="text-bone-muted mb-4">暂无配置，默认使用 Pollinations 免费模型</p>
              <button className="btn-primary" onClick={handleNew}>
                <Plus className="w-4 h-4" /> 添加第一个配置
              </button>
            </div>
          ) : (
            <div className="grid gap-3">
              {configs.map((c) => {
                const isActive = config?.baseUrl === c.baseUrl && config?.model === c.model && config?.apiKey === c.apiKey
                return (
                  <div
                    key={c.id}
                    className={cn(
                      'panel p-4 flex items-center gap-4 transition-all',
                      isActive ? 'border-sage/30 bg-sage/5' : 'hover:border-amber/25'
                    )}
                  >
                    <div className={cn(
                      'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
                      isActive ? 'bg-sage/15 text-sage' : 'bg-amber/8 text-amber'
                    )}>
                      <Server className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-bone truncate">{c.name}</span>
                        {isActive && (
                          <span className="text-[10px] text-sage bg-sage/15 px-1.5 py-0.5 rounded-full shrink-0">使用中</span>
                        )}
                      </div>
                      <div className="text-xs text-bone-faint font-mono truncate mt-0.5">
                        {c.model} · {c.baseUrl}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {!isActive && (
                        <button
                          className="text-xs text-amber hover:text-amber-glow px-2.5 py-1.5 rounded-lg hover:bg-amber/8 transition-colors"
                          onClick={() => handleSwitch(c)}
                        >
                          切换
                        </button>
                      )}
                      <button
                        className="text-xs text-bone-muted hover:text-bone px-2.5 py-1.5 rounded-lg hover:bg-ink-800/50 transition-colors flex items-center gap-1"
                        onClick={() => handleEdit(c)}
                      >
                        <Edit3 className="w-3 h-3" /> 编辑
                      </button>
                      <button
                        className="text-xs text-bone-muted hover:text-bone px-2.5 py-1.5 rounded-lg hover:bg-ink-800/50 transition-colors flex items-center gap-1"
                        onClick={() => handleExport(c)}
                        title="复制脱敏配置到剪贴板"
                      >
                        {copiedId === c.id ? <Check className="w-3 h-3 text-sage-glow" /> : <Copy className="w-3 h-3" />}
                        {copiedId === c.id ? '已复制' : '导出'}
                      </button>
                      <button
                        className="text-xs text-rust hover:text-rust/80 px-2.5 py-1.5 rounded-lg hover:bg-rust/8 transition-colors"
                        onClick={() => handleDelete(c.id)}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 演示数据 */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-4 h-4 text-amber" />
            <span className="label !mb-0">演示数据</span>
          </div>
          <div className="panel p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="text-sm text-bone mb-1">一键加载"数据结构"示例科目</p>
                <p className="text-xs text-bone-muted leading-relaxed">
                  预置 4 份真实 PDF 课件（绪论、栈与队列、树、动态规划）+ 1 次测验（含 3 道错题）+ 1 条对话记录 + 1 份复习摘要。
                  加载后可直接体验 AI 问答、RAG 检索、SOLO Agent 主动推送等全部功能。
                </p>
              </div>
              {demoLoaded && !demoLoading ? (
                <span className="shrink-0 text-xs text-sage-glow flex items-center gap-1 px-3 py-2 rounded-lg bg-sage/10 border border-sage/20">
                  <Check className="w-3.5 h-3.5" /> 已加载
                </span>
              ) : (
                <button
                  className="shrink-0 btn-primary !py-2 text-xs flex items-center gap-1.5"
                  onClick={handleLoadDemo}
                  disabled={demoLoading}
                >
                  {demoLoading ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 加载中…</>
                  ) : (
                    <><Download className="w-3.5 h-3.5" /> 加载示例数据</>
                  )}
                </button>
              )}
            </div>
            {demoProgress && demoLoading && (
              <div className="mt-4 pt-4 border-t border-[var(--border)]">
                <div className="flex items-center justify-between text-xs text-bone-muted mb-2">
                  <span>{demoProgress.message}</span>
                  <span>{demoProgress.current}/{demoProgress.total}</span>
                </div>
                <div className="h-1.5 bg-ink-800/50 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[var(--accent)] to-amber rounded-full transition-all duration-300"
                    style={{ width: `${demoProgress.total > 0 ? (demoProgress.current / demoProgress.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 本地存储管理 */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-bone-muted" />
              <span className="label !mb-0">本地存储管理</span>
            </div>
            <button
              className="text-xs text-bone-muted hover:text-bone flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-ink-800/50 transition-colors"
              onClick={refreshStats}
              disabled={statsLoading}
            >
              {statsLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              刷新
            </button>
          </div>
          <div className="panel p-5">
            <p className="text-sm text-bone-muted mb-4">
              数据存储在浏览器 IndexedDB，分表设计：科目、资料、分块、向量、对话、测验、错题、复习、缓存共 9 张表，建立外键索引。
              所有解析、检索、向量特征均持久化，刷新页面无需重算。下方可按需清理释放空间。
            </p>

            {/* 存储统计 */}
            {storageStats && (
              <div className="mb-4 p-3 rounded-xl bg-ink-800/30 border border-amber/10">
                <div className="flex items-center gap-2 mb-3">
                  <Database className="w-3.5 h-3.5 text-amber" />
                  <span className="text-xs font-medium text-bone-dim">IndexedDB 存储统计</span>
                  {storageStats.usage !== undefined && storageStats.quota !== undefined && (
                    <span className="text-xs text-bone-faint ml-auto">
                      {formatBytes(storageStats.usage)} / {formatBytes(storageStats.quota)}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {storageStats.tables.map((t) => (
                    <div key={t.name} className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-ink-900/40">
                      <span className="text-xs text-bone-faint truncate">{tableLabels[t.name] || t.name}</span>
                      <span className={cn('text-xs font-mono ml-2', t.count > 0 ? 'text-amber' : 'text-bone-faint')}>
                        {t.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button
                className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-amber/15 hover:border-amber/30 hover:bg-amber/5 transition-colors text-left"
                onClick={handleClearParseCache}
                disabled={clearing !== null}
              >
                <Trash2 className="w-4 h-4 text-amber shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm text-bone">解析哈希缓存</div>
                  <div className="text-xs text-bone-faint">文件去重记录，清理不影响已解析资料</div>
                </div>
                {clearing === 'parse' && <Loader2 className="w-3.5 h-3.5 animate-spin text-amber ml-auto" />}
              </button>
              <button
                className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-amber/15 hover:border-amber/30 hover:bg-amber/5 transition-colors text-left"
                onClick={() => handleClearCache('index')}
                disabled={clearing !== null}
              >
                <Trash2 className="w-4 h-4 text-amber shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm text-bone">检索索引缓存</div>
                  <div className="text-xs text-bone-faint">分块 + 向量索引，下次提问自动重建</div>
                </div>
                {clearing === 'index' && <Loader2 className="w-3.5 h-3.5 animate-spin text-amber ml-auto" />}
              </button>
              <button
                className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-amber/15 hover:border-amber/30 hover:bg-amber/5 transition-colors text-left"
                onClick={() => handleClearCache('chunks')}
                disabled={clearing !== null}
              >
                <Trash2 className="w-4 h-4 text-amber shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm text-bone">资料正文缓存</div>
                  <div className="text-xs text-bone-faint">已解析的资料文本，清理后需重新上传解析</div>
                </div>
                {clearing === 'chunks' && <Loader2 className="w-3.5 h-3.5 animate-spin text-amber ml-auto" />}
              </button>
              <button
                className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-rust/20 hover:border-rust/40 hover:bg-rust/5 transition-colors text-left"
                onClick={() => handleClearCache('chats')}
                disabled={clearing !== null}
              >
                <Trash2 className="w-4 h-4 text-rust shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm text-bone">全部对话记录</div>
                  <div className="text-xs text-bone-faint">删除所有科目的对话历史，不可恢复</div>
                </div>
                {clearing === 'chats' && <Loader2 className="w-3.5 h-3.5 animate-spin text-rust ml-auto" />}
              </button>
            </div>
            <button
              className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-rust/25 hover:bg-rust/8 text-rust text-sm font-medium transition-colors"
              onClick={() => handleClearCache('all')}
              disabled={clearing !== null}
            >
              {clearing === 'all' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              一键清理全部缓存
            </button>
          </div>
        </div>

        {/* 编辑面板（条件渲染） */}
        {showEditor && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in" onClick={handleCloseEditor}>
            <div
              className="bg-ink-900 border border-amber/15 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 面板头 */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-amber/10">
                <h3 className="font-display text-xl text-bone">
                  {editingId ? '编辑配置' : '新建配置'}
                </h3>
                <button className="text-bone-faint hover:text-bone p-1" onClick={handleCloseEditor}>
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-5">
                {/* 配置名称 */}
                <div>
                  <label className="label">配置名称</label>
                  <input
                    className="input"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="如：我的 DeepSeek、GPT-4o 等"
                  />
                </div>

                {/* 预设 */}
                <div>
                  <span className="label">快速预设</span>
                  <div className="flex flex-wrap gap-2">
                    {PRESETS.map((p) => (
                      <button
                        key={p.name}
                        className={cn(
                          'chip',
                          form.baseUrl === p.baseUrl && form.model === p.model
                            ? 'border-amber/50 bg-amber/12 text-amber'
                            : 'border-amber/15 text-bone-dim hover:border-amber/30 hover:text-bone'
                        )}
                        onClick={() => update({ baseUrl: p.baseUrl, model: p.model })}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 表单 */}
                <div className="space-y-4">
                  <div>
                    <label className="label">Base URL</label>
                    <input
                      className="input font-mono text-sm"
                      value={form.baseUrl}
                      onChange={(e) => update({ baseUrl: e.target.value })}
                      placeholder="https://api.example.com/v1"
                    />
                    <p className="text-xs text-bone-faint mt-1.5">OpenAI 兼容接口地址，通常以 /v1 结尾</p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <label className="label !mb-0">API Key</label>
                      <label className="flex items-center gap-1.5 cursor-pointer text-xs text-bone-faint hover:text-bone-dim transition-colors">
                        <input
                          type="checkbox"
                          checked={lockEnabled}
                          onChange={(e) => handleToggleLock(e.target.checked)}
                          className="accent-amber w-3.5 h-3.5"
                        />
                        <Lock className="w-3 h-3" /> 密码锁
                      </label>
                    </div>
                    {lockEnabled && !keyUnlocked ? (
                      <div className="flex items-center gap-2">
                        <input
                          className="input font-mono text-sm"
                          type="text"
                          value={maskedKey}
                          disabled
                          placeholder="（已锁定，点击解锁查看）"
                        />
                        <button className="btn-outline shrink-0" onClick={handleUnlock}>
                          <Unlock className="w-3.5 h-3.5" /> 解锁
                        </button>
                      </div>
                    ) : (
                      <input
                        type="password"
                        className="input font-mono text-sm"
                        value={form.apiKey}
                        onChange={(e) => update({ apiKey: e.target.value })}
                        placeholder="sk-..."
                      />
                    )}
                    <p className="text-xs text-bone-faint mt-1.5">密钥使用 AES-256-GCM 加密存储于本机，不会上传任何服务器。开启密码锁后查看/编辑需输入密码</p>
                  </div>

                  <div>
                    <label className="label">模型名称</label>
                    <input
                      className="input font-mono text-sm"
                      value={form.model}
                      onChange={(e) => update({ model: e.target.value })}
                      placeholder="deepseek-chat"
                    />
                  </div>

                  {/* 连接测试 */}
                  <div className="flex items-center gap-3 pt-1">
                    <button className="btn-outline" onClick={handleTest} disabled={testing}>
                      {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
                      {testing ? '测试中...' : '测试连接'}
                    </button>
                    {testResult && (
                      <div className={cn('flex items-center gap-2 text-sm', testResult.ok ? 'text-sage' : 'text-rust')}>
                        {testResult.ok ? <Check className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                        <span className="truncate max-w-xs">{testResult.msg}</span>
                        {testResult.latency && <span className="text-bone-faint text-xs">· {testResult.latency}ms</span>}
                      </div>
                    )}
                  </div>
                </div>

                {/* 生成参数 */}
                <div className="border-t border-amber/10 pt-5">
                  <h4 className="text-sm font-medium text-bone mb-4">生成参数</h4>
                  <div className="space-y-5">
                    <Slider label="温度 Temperature" value={form.temperature} min={0} max={2} step={0.1} hint="越高越有创造力，越低越确定" onChange={(v) => update({ temperature: v })} />
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-bone-dim">最大 Token 数</span>
                        <span className="font-mono text-sm text-amber">{form.maxTokens === 0 ? '不限' : form.maxTokens}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={8192}
                        step={256}
                        value={form.maxTokens}
                        onChange={(e) => update({ maxTokens: parseInt(e.target.value) })}
                        className="w-full accent-amber"
                      />
                      <p className="text-xs text-bone-faint mt-1">0 = 不限制（推荐），由模型自行决定最大输出长度</p>
                    </div>
                    <Slider label="Top P" value={form.topP} min={0.1} max={1} step={0.05} hint="核采样，与温度二选一调节" onChange={(v) => update({ topP: v })} />
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="flex items-center gap-3 pt-2 border-t border-amber/10">
                  <button className="btn-primary" onClick={handleSave}>
                    {savedToast ? <Check className="w-4 h-4" /> : null}
                    {savedToast ? '保存成功' : editingId ? '保存修改' : '保存配置'}
                  </button>
                  <button className="btn-ghost" onClick={handleCloseEditor}>取消</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 保存成功 Toast */}
        {savedToast && !showEditor && (
          <div className="fixed bottom-8 right-8 z-50 flex items-center gap-2 px-4 py-3 rounded-xl bg-sage text-white shadow-lg animate-slide-up">
            <Check className="w-4 h-4" />
            <span className="text-sm">配置已保存成功</span>
          </div>
        )}

        {/* 缓存清理 Toast */}
        {clearToast && (
          <div className="fixed bottom-8 right-8 z-50 flex items-center gap-2 px-4 py-3 rounded-xl bg-amber text-white shadow-lg animate-slide-up">
            <Check className="w-4 h-4" />
            <span className="text-sm">{clearToast}</span>
          </div>
        )}
      </div>
    </div>
  )
}

/** 去掉元信息，只保留 ApiConfig 字段 */
function stripMeta(item: ApiConfigItem): ApiConfig {
  const { id, name, createdAt, ...rest } = item
  void id; void name; void createdAt
  return rest
}

function Slider({
  label, value, min, max, step, hint, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number; hint?: string; onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-bone-dim">{label}</span>
        <span className="font-mono text-sm text-amber">{value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full accent-amber" />
      {hint && <p className="text-xs text-bone-faint mt-1">{hint}</p>}
    </div>
  )
}
