// 设置页：多 API 配置管理 / 连接测试 / 生成参数
import { useState, useEffect } from 'react'
import { ArrowLeft, Check, Loader2, Plug, Zap, Plus, Server } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '@/lib/store'
import { streamChat } from '@/lib/llm'
import { confirmDialog } from '@/lib/dialog'
import { cn } from '@/lib/utils'
import type { ApiConfig, ApiConfigItem } from '@/shared/types'

const PRESETS: { name: string; baseUrl: string; model: string }[] = [
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  { name: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { name: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen2.5-7B-Instruct' },
  { name: '月之暗面', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
]

const EMPTY_FORM: ApiConfig = {
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: '',
  model: 'deepseek-chat',
  temperature: 0.7,
  maxTokens: 2048,
  topP: 1,
}

export default function Setup() {
  const navigate = useNavigate()
  const { config, configs, loadConfigs, saveConfigItem, deleteConfigItem, switchConfig } = useStore()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [form, setForm] = useState<ApiConfig>({ ...EMPTY_FORM })
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string; latency?: number } | null>(null)
  const [savedToast, setSavedToast] = useState(false)

  useEffect(() => {
    loadConfigs()
  }, [loadConfigs])

  // 初始化：如果没有配置，进入新建模式；否则加载激活的配置
  useEffect(() => {
    if (configs.length === 0) {
      handleNew()
    } else {
      // 找到当前激活的配置（config 对应的那个）
      const active = configs.find((c) => c.apiKey === config?.apiKey && c.baseUrl === config?.baseUrl)
      if (active) {
        setEditingId(active.id)
        setFormName(active.name)
        setForm(stripMeta(active))
      }
    }
  }, [configs.length]) // eslint-disable-line

  const update = (patch: Partial<ApiConfig>) => setForm((f) => ({ ...f, ...patch }))

  const handleNew = () => {
    setEditingId(null)
    setFormName('')
    setForm({ ...EMPTY_FORM })
    setTestResult(null)
  }

  const handleSelectConfig = (item: ApiConfigItem) => {
    setEditingId(item.id)
    setFormName(item.name)
    setForm(stripMeta(item))
    setTestResult(null)
  }

  const handleSwitch = async (item: ApiConfigItem) => {
    await switchConfig(item.id)
    setEditingId(item.id)
    setFormName(item.name)
    setForm(stripMeta(item))
  }

  const handleDelete = async (id: string) => {
    if (!(await confirmDialog('确认删除该 API 配置？', { danger: true }))) return
    await deleteConfigItem(id)
    handleNew()
  }

  const handleDuplicate = (item: ApiConfigItem) => {
    setEditingId(null)
    setFormName(item.name + ' (副本)')
    setForm(stripMeta(item))
    setTestResult(null)
  }

  const handleTest = async () => {
    if (!form.apiKey) {
      setTestResult({ ok: false, msg: '请先填写 API Key' })
      return
    }
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
    if (!form.apiKey) {
      setTestResult({ ok: false, msg: '请先填写 API Key' })
      return
    }
    const name = formName.trim() || `${PRESETS.find((p) => p.baseUrl === form.baseUrl)?.name || '自定义'} ${Date.now().toString().slice(-4)}`
    await saveConfigItem({
      id: editingId || undefined,
      name,
      ...form,
    })
    // 保存成功提示
    setSavedToast(true)
    setTimeout(() => setSavedToast(false), 2500)
    // 刷新列表后加载刚保存的配置
    await loadConfigs()
    const updated = useStore.getState().configs
    const saved = updated.find((c) => c.name === name)
    if (saved) {
      setEditingId(saved.id)
      setFormName(saved.name)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-8 py-10 animate-fade-in">
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

        <div className="flex gap-6">
          {/* 左侧：配置列表 */}
          <div className="w-64 shrink-0">
            <div className="flex items-center justify-between mb-3">
              <span className="label !mb-0">已保存配置</span>
              <button className="btn-ghost !px-2 !py-1 text-xs" onClick={handleNew}>
                <Plus className="w-3.5 h-3.5" /> 新建
              </button>
            </div>
            <div className="space-y-1.5">
              {configs.length === 0 && (
                <p className="text-xs text-bone-faint px-2 py-4 text-center">暂无配置，点击"新建"添加</p>
              )}
              {configs.map((c) => {
                const isActive = config?.apiKey === c.apiKey && config?.baseUrl === c.baseUrl
                const isEditing = editingId === c.id
                return (
                  <div
                    key={c.id}
                    className={cn(
                      'group rounded-xl border p-3 cursor-pointer transition-all',
                      isEditing
                        ? 'border-amber/40 bg-amber/8'
                        : isActive
                          ? 'border-sage/30 bg-sage/8'
                          : 'border-amber/10 hover:border-amber/25 hover:bg-ink-850/40'
                    )}
                    onClick={() => handleSelectConfig(c)}
                  >
                    <div className="flex items-center gap-2">
                      <Server className={cn('w-4 h-4 shrink-0', isActive ? 'text-sage' : 'text-bone-muted')} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-bone truncate flex items-center gap-1.5">
                          {c.name}
                          {isActive && <span className="text-[10px] text-sage bg-sage/15 px-1.5 py-0.5 rounded-full">使用中</span>}
                        </div>
                        <div className="text-[10px] text-bone-faint font-mono truncate">{c.model}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!isActive && (
                        <button
                          className="text-[10px] text-amber hover:text-amber-glow px-1.5 py-0.5 rounded"
                          onClick={(e) => { e.stopPropagation(); handleSwitch(c) }}
                        >
                          切换
                        </button>
                      )}
                      <button
                        className="text-[10px] text-bone-muted hover:text-bone px-1.5 py-0.5 rounded"
                        onClick={(e) => { e.stopPropagation(); handleDuplicate(c) }}
                      >
                        复制
                      </button>
                      <button
                        className="text-[10px] text-rust hover:text-rust/80 px-1.5 py-0.5 rounded"
                        onClick={(e) => { e.stopPropagation(); handleDelete(c.id) }}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 右侧：编辑表单 */}
          <div className="flex-1 min-w-0">
            {/* 配置名称 */}
            <section className="panel p-6 mb-5">
              <label className="label">配置名称</label>
              <input
                className="input"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="如：我的 DeepSeek、GPT-4o 等"
              />
              <p className="text-xs text-bone-faint mt-1.5">用于在配置列表中区分不同的 API</p>
            </section>

            {/* 预设 */}
            <section className="mb-5">
              <span className="label">快速预设</span>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.name}
                    className={cn(
                      'chip',
                      form.baseUrl === p.baseUrl
                        ? 'border-amber/50 bg-amber/12 text-amber'
                        : 'border-amber/15 text-bone-dim hover:border-amber/30 hover:text-bone'
                    )}
                    onClick={() => update({ baseUrl: p.baseUrl, model: p.model })}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </section>

            {/* 表单 */}
            <section className="panel p-6 space-y-5">
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
                <label className="label">API Key</label>
                <input
                  type="password"
                  className="input font-mono text-sm"
                  value={form.apiKey}
                  onChange={(e) => update({ apiKey: e.target.value })}
                  placeholder="sk-..."
                />
                <p className="text-xs text-bone-faint mt-1.5">密钥仅加密存储于本机，不会上传任何服务器</p>
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
                    <span className="truncate max-w-md">{testResult.msg}</span>
                    {testResult.latency && <span className="text-bone-faint text-xs">· {testResult.latency}ms</span>}
                  </div>
                )}
              </div>
            </section>

            {/* 生成参数 */}
            <section className="panel p-6 mt-5">
              <h3 className="font-display text-xl text-bone mb-5">生成参数</h3>
              <div className="space-y-6">
                <Slider label="温度 Temperature" value={form.temperature} min={0} max={2} step={0.1} hint="越高越有创造力，越低越确定" onChange={(v) => update({ temperature: v })} />
                <Slider label="最大 Token 数" value={form.maxTokens} min={256} max={8192} step={256} hint="单次回复的最大长度" onChange={(v) => update({ maxTokens: v })} />
                <Slider label="Top P" value={form.topP} min={0.1} max={1} step={0.05} hint="核采样，与温度二选一调节" onChange={(v) => update({ topP: v })} />
              </div>
            </section>

            {/* 保存 */}
            <div className="flex items-center gap-3 mt-6 mb-4">
              <button className="btn-primary" onClick={handleSave}>
                {savedToast ? <Check className="w-4 h-4" /> : null}
                {savedToast ? '保存成功' : editingId ? '保存修改' : '保存配置'}
              </button>
              <button className="btn-ghost" onClick={() => navigate('/chat')}>返回</button>
            </div>
          </div>
        </div>

        {/* 保存成功 Toast */}
        {savedToast && (
          <div className="fixed bottom-8 right-8 z-50 flex items-center gap-2 px-4 py-3 rounded-xl bg-sage text-white shadow-lg animate-slide-up">
            <Check className="w-4 h-4" />
            <span className="text-sm">配置已保存成功</span>
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
