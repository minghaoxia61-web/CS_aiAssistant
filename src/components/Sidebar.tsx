// 侧边导航栏
import { NavLink, useNavigate } from 'react-router-dom'
import { Settings, Library, MessagesSquare, BookOpen, ListChecks, BarChart3, BookX, GraduationCap, User, Sun, Moon, BookMarked } from 'lucide-react'
import { useStore } from '@/lib/store'
import { confirmDialog, promptDialog } from '@/lib/dialog'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/knowledge', label: '知识板块', icon: BookMarked },
  { to: '/chat', label: '智能对话', icon: MessagesSquare },
  { to: '/library', label: '资料库', icon: Library },
  { to: '/review', label: '复习中心', icon: BookOpen },
  { to: '/quiz', label: '自我测验', icon: ListChecks },
  { to: '/wrong-book', label: '错题本', icon: BookX },
  { to: '/analytics', label: '学情分析', icon: BarChart3 },
]

export default function Sidebar() {
  const navigate = useNavigate()
  const { subjects, currentSubjectId, selectSubject, deleteSubject, createSubject, theme, toggleTheme } = useStore()

  return (
    <aside className="w-60 shrink-0 h-full flex flex-col border-r border-amber/10 bg-ink-850/50 backdrop-blur-xl">
      {/* 品牌 */}
      <div className="px-5 pt-6 pb-5 border-b border-amber/8">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber to-amber-dim flex items-center justify-center shadow-glow">
            <GraduationCap className="w-5 h-5 text-white" strokeWidth={2.2} />
          </div>
          <div>
            <h1 className="font-display text-xl leading-none text-bone">CS_Assistant</h1>
            <p className="text-[10px] tracking-widest uppercase text-bone-muted mt-1">智能复习助手</p>
          </div>
        </div>
      </div>

      {/* 导航 */}
      <nav className="px-3 py-4 space-y-1">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all group',
                isActive
                  ? 'bg-amber/12 text-amber border border-amber/20'
                  : 'text-bone-dim hover:text-bone hover:bg-amber/6 border border-transparent'
              )
            }
          >
            <item.icon className="w-[18px] h-[18px]" strokeWidth={1.8} />
            <span className="font-medium">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* 科目列表 */}
      <div className="px-5 pt-4 pb-2 flex items-center justify-between">
        <span className="label !mb-0">考试科目</span>
        <button
          className="text-bone-muted hover:text-amber transition-colors text-lg leading-none"
          onClick={async () => {
            const name = await promptDialog('请输入科目名称（如：操作系统）', { placeholder: '操作系统' })
            if (name?.trim()) {
              await createSubject(name.trim(), '#e8b974')
            }
          }}
          title="新建科目"
        >
          +
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-0.5">
        {subjects.length === 0 && (
          <p className="px-3 py-2 text-xs text-bone-faint">暂无科目，点击 + 创建</p>
        )}
        {subjects.map((s) => (
          <div
            key={s.id}
            className={cn(
              'group flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-all',
              currentSubjectId === s.id ? 'bg-ink-800/80' : 'hover:bg-ink-800/40'
            )}
            onClick={() => selectSubject(s.id)}
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: s.color, boxShadow: `0 0 8px ${s.color}80` }}
            />
            <span className={cn('flex-1 text-sm truncate', currentSubjectId === s.id ? 'text-bone' : 'text-bone-dim')}>
              {s.name}
            </span>
            <button
              className="opacity-0 group-hover:opacity-100 text-bone-faint hover:text-rust transition-all text-xs"
              onClick={async (e) => {
                e.stopPropagation()
                const ok = await confirmDialog(`确认删除科目「${s.name}」及其所有资料？`, { danger: true })
                if (ok) {
                  deleteSubject(s.id)
                }
              }}
              title="删除科目"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* 底部设置 */}
      <div className="px-3 py-3 border-t border-amber/8 space-y-1">
        <button
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-bone-dim hover:text-bone hover:bg-amber/6 transition-all"
          onClick={toggleTheme}
          title={theme === 'light' ? '切换到护眼暗色' : '切换到浅色'}
        >
          {theme === 'light' ? <Moon className="w-[18px] h-[18px]" strokeWidth={1.8} /> : <Sun className="w-[18px] h-[18px]" strokeWidth={1.8} />}
          <span className="font-medium">{theme === 'light' ? '护眼暗色' : '浅色模式'}</span>
        </button>
        <button
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-bone-dim hover:text-bone hover:bg-amber/6 transition-all"
          onClick={() => navigate('/profile')}
        >
          <User className="w-[18px] h-[18px]" strokeWidth={1.8} />
          <span className="font-medium">个人信息</span>
        </button>
        <button
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-bone-dim hover:text-bone hover:bg-amber/6 transition-all"
          onClick={() => navigate('/setup')}
        >
          <Settings className="w-[18px] h-[18px]" strokeWidth={1.8} />
          <span className="font-medium">API 设置</span>
        </button>
      </div>
    </aside>
  )
}
