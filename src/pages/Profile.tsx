// 个人信息页：编辑昵称、年级、学习目标等，AI 对话时参考
import { useState, useEffect } from 'react'
import { User, Save, Check } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import { useStore } from '@/lib/store'

export default function Profile() {
  const { profile, loadProfile, saveProfile } = useStore()
  const [form, setForm] = useState(profile)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  useEffect(() => {
    setForm(profile)
  }, [profile])

  const update = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))

  const handleSave = async () => {
    await saveProfile(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader
        title="个人信息"
        subtitle="编辑你的学习信息，AI 对话时会参考这些内容个性化回答"
        icon={<User className="w-5 h-5" />}
      />
      <div className="max-w-2xl mx-auto px-8 py-6 animate-fade-in">
        <div className="panel p-6 space-y-6">
          {/* 昵称 */}
          <div>
            <label className="label">昵称</label>
            <input
              className="input"
              value={form.nickname}
              onChange={(e) => update({ nickname: e.target.value })}
              placeholder="如：小明、阿杰"
            />
            <p className="text-xs text-bone-faint mt-1.5">AI 对话时会自然地称呼你</p>
          </div>

          {/* 年级/身份 */}
          <div>
            <label className="label">年级 / 身份</label>
            <input
              className="input"
              value={form.grade}
              onChange={(e) => update({ grade: e.target.value })}
              placeholder="如：大三、考研党、在职复习"
            />
          </div>

          {/* 学习目标 */}
          <div>
            <label className="label">学习目标</label>
            <input
              className="input"
              value={form.goal}
              onChange={(e) => update({ goal: e.target.value })}
              placeholder="如：期末冲刺、考研复试、面试准备"
            />
          </div>

          {/* 薄弱方向 */}
          <div>
            <label className="label">薄弱方向</label>
            <input
              className="input"
              value={form.weakAreas}
              onChange={(e) => update({ weakAreas: e.target.value })}
              placeholder="如：操作系统、计组、数据结构"
            />
            <p className="text-xs text-bone-faint mt-1.5">AI 会在这些方向上多给基础解释和练习建议</p>
          </div>

          {/* 偏好风格 */}
          <div>
            <label className="label">偏好回答风格</label>
            <div className="flex flex-wrap gap-2">
              {['简洁精炼', '详细解释', '多举例', '多画图'].map((style) => (
                <button
                  key={style}
                  className="chip border-amber/15 text-bone-dim hover:border-amber/30"
                  onClick={() => update({ preferredStyle: style })}
                  style={form.preferredStyle === style ? { borderColor: 'rgba(184,134,11,0.5)', background: 'rgba(184,134,11,0.12)', color: '#e8b974' } : {}}
                >
                  {style}
                </button>
              ))}
            </div>
            <input
              className="input mt-2"
              value={form.preferredStyle}
              onChange={(e) => update({ preferredStyle: e.target.value })}
              placeholder="或自定义输入偏好风格"
            />
          </div>

          {/* 保存按钮 */}
          <div className="flex items-center gap-3 pt-2">
            <button className="btn-primary" onClick={handleSave}>
              {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {saved ? '已保存' : '保存信息'}
            </button>
          </div>
        </div>

        {/* 说明 */}
        <div className="panel p-5 mt-5 bg-ink-850/40">
          <h4 className="text-sm font-medium text-amber-dim mb-2">这些信息如何被使用？</h4>
          <ul className="text-xs text-bone-muted space-y-1.5 leading-relaxed">
            <li>• 智能对话时，AI 会参考你的昵称自然称呼你</li>
            <li>• 根据你的年级和学习目标，调整回答的深度和侧重点</li>
            <li>• 在薄弱方向上，AI 会给出更详细的基础解释和练习建议</li>
            <li>• 回答风格会影响 AI 的表达方式（简洁 vs 详细）</li>
            <li>• 所有信息仅存储在本地，不会上传任何服务器</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
