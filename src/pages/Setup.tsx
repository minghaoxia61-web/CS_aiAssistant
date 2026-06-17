// 设置页：API 配置 / 连接测试 / 生成参数
import { useState, useEffect } from 'react'
import { ArrowLeft, Check, Loader2, Plug, Zap } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '@/lib/store'
import { streamChat } from '@/lib/llm'
import type { ApiConfig } from '@/shared/types'

const PRESETS: { name: string; baseUrl: string; model: string }[] = [
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  { name: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { name: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen2.5-7B-Instruct' },
  { name: '月之暗面', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
]

export default function Setup() {
  const navigate = useNavigate()
  const { config, saveConfig } = useStore()
  const [form, setForm] = useState<ApiConfig>({
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    model: 'deepseek-chat',
    temperature: 0.7,
    maxTokens: 2048,
    topP: 1,
  })
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string; latency?: number } | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (config) setForm(config)
  }, [config])

  const update = (patch: Partial<ApiConfig>) => setForm((f) => ({ ...f, ...patch }))

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
    await saveConfig(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-8 py-10 animate-fade-in">
        {/* 顶栏 */}
        <div className="flex items-center gap-3 mb-8">
          <button className="btn-ghost !px-2" onClick={() => navigate('/chat')}>
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="font-display text-3xl text-bone">API 设置</h2>
            <p className="text-sm text-bone-muted mt-1">接入你自己的大模型 API（OpenAI 兼容协议）</p>
          </div>
        </div>

        {/* 预设 */}
        <section className="mb-8">
          <span className="label">快速预设</span>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.name}
                className={`chip ${
                  form.baseUrl === p.baseUrl
                    ? 'border-amber/50 bg-amber/12 text-amber'
                    : 'border-amber/15 text-bone-dim hover:border-amber/30 hover:text-bone'
                }`}
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
              <div
                className={`flex items-center gap-2 text-sm ${
                  testResult.ok ? 'text-sage-glow' : 'text-rust'
                }`}
              >
                {testResult.ok ? <Check className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                <span className="truncate max-w-md">{testResult.msg}</span>
                {testResult.latency && (
                  <span className="text-bone-faint text-xs">· {testResult.latency}ms</span>
                )}
              </div>
            )}
          </div>
        </section>

        {/* 生成参数 */}
        <section className="panel p-6 mt-6">
          <h3 className="font-display text-xl text-bone mb-5">生成参数</h3>
          <div className="space-y-6">
            <Slider
              label="温度 Temperature"
              value={form.temperature}
              min={0}
              max={2}
              step={0.1}
              hint="越高越有创造力，越低越确定"
              onChange={(v) => update({ temperature: v })}
            />
            <Slider
              label="最大 Token 数"
              value={form.maxTokens}
              min={256}
              max={8192}
              step={256}
              hint="单次回复的最大长度"
              onChange={(v) => update({ maxTokens: v })}
            />
            <Slider
              label="Top P"
              value={form.topP}
              min={0.1}
              max={1}
              step={0.05}
              hint="核采样，与温度二选一调节"
              onChange={(v) => update({ topP: v })}
            />
          </div>
        </section>

        {/* 保存 */}
        <div className="flex items-center gap-3 mt-8">
          <button className="btn-primary" onClick={handleSave}>
            {saved ? <Check className="w-4 h-4" /> : null}
            {saved ? '已保存' : '保存配置'}
          </button>
          <button className="btn-ghost" onClick={() => navigate('/chat')}>
            返回
          </button>
        </div>
      </div>
    </div>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  hint,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  hint?: string
  onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-bone-dim">{label}</span>
        <span className="font-mono text-sm text-amber">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-amber"
      />
      {hint && <p className="text-xs text-bone-faint mt-1">{hint}</p>}
    </div>
  )
}
