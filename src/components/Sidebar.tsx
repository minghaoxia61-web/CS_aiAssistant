// 侧边导航栏 - 渐变玻璃风
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
    <aside className="w-60 shrink-0 h-full flex flex-col glass-sidebar border-r border-amber/8 overflow-hidden">
      {/* 品牌 - 渐变 Logo */}
      <div className="px-5 pt-5 pb-4 border-b border-amber/8 shrink-0 gradient-border">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber to-amber-glow flex items-center justify-center shadow-glow">
            <GraduationCap className="w-5 h-5 text-white" strokeWidth={2.2} />
          </div>
          <div>
            <h1 className="font-display text-xl leading-none text-bone">CS_Assistant</h1>
            <p className="text-[10px] tracking-widest uppercase text-bone-muted mt-1">智能复习助手</p>
          </div>
        </div>
      </div>

      {/* 导航 - 带光效 */}
      <nav className="px-3 py-3 space-y-0.5 shrink-0">
        {NAV.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'nav-item-glow flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-300 group',
                  isActive
                    ? 'active bg-amber/10 text-amber border border-amber/20 shadow-glow'
                    : 'text-bone-dim hover:text-bone hover:bg-amber/5 border border-transparent'
                )
              }
            >
              <Icon className="w-[18px] h-[18px]" strokeWidth={1.8} />
              <span className="font-medium">{item.label}</span>
            </NavLink>
          )
        })}
      </nav>

      {/* 科目列表 */}
      <div className="px-5 pt-2 pb-1 flex items-center justify-between shrink-0">
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
      <div className="flex-1 overflow-y-auto px-3 pb-2 space-y-0.5 min-h-0">
        {subjects.length === 0 && (
          <p className="px-3 py-2 text-xs text-bone-faint">暂无科目，点击 + 创建</p>
        )}
        {subjects.map((s) => (
          <div
            key={s.id}
            className={cn(
              'group flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer transition-all duration-300',
              currentSubjectId === s.id ? 'bg-ink-800/60 shadow-glow' : 'hover:bg-ink-800/30'
            )}
            onClick={() => selectSubject(s.id)}
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: s.color, boxShadow: `0 0 10px ${s.color}90` }}
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
              &times;
            </button>
          </div>
        ))}
      </div>

      {/* 底部设置 - 渐变分隔线 */}
      <div className="px-3 py-2 border-t border-amber/8 space-y-0.5 shrink-0 gradient-border">
        <button
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-bone-dim hover:text-bone hover:bg-amber/5 transition-all duration-300"
          onClick={toggleTheme}
          title={theme === 'light' ? '切换到护眼暗色' : '切换到浅色'}
        >
          {theme === 'light' ? <Moon className="w-[18px] h-[18px]" strokeWidth={1.8} /> : <Sun className="w-[18px] h-[18px]" strokeWidth={1.8} />}
          <span className="font-medium">{theme === 'light' ? '护眼暗色' : '浅色模式'}</span>
        </button>
        <button
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-bone-dim hover:text-bone hover:bg-amber/5 transition-all duration-300"
          onClick={() => navigate('/profile')}
        >
          <User className="w-[18px] h-[18px]" strokeWidth={1.8} />
          <span className="font-medium">个人信息</span>
        </button>
        <button
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-bone-dim hover:text-bone hover:bg-amber/5 transition-all duration-300"
          onClick={() => navigate('/setup')}
        >
          <Settings className="w-[18px] h-[18px]" strokeWidth={1.8} />
          <span className="font-medium">API 设置</span>
        </button>
      </div>
    </aside>
  )
}
