// 侧边导航栏 — Aurora 精致排版
import { NavLink, useNavigate } from 'react-router-dom'
import { Settings, Library, MessagesSquare, BookOpen, ListChecks, BarChart3, BookX, GraduationCap, User, Sun, Moon, BookMarked, Plus } from 'lucide-react'
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
    <aside className="w-[240px] shrink-0 h-full flex flex-col glass-sidebar border-r border-[var(--border)] overflow-hidden">
      {/* 品牌 */}
      <div className="px-5 pt-6 pb-5 shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dim)] flex items-center justify-center shadow-glow">
            <GraduationCap className="w-5 h-5 text-[#0a0a0f]" strokeWidth={2.2} />
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/20 to-transparent" />
          </div>
          <div>
            <h1 className="font-display text-[20px] leading-none text-bone">CS_Assistant</h1>
            <p className="text-[10px] tracking-[0.15em] uppercase text-bone-muted mt-1.5 font-mono">// AI 智能助教</p>
          </div>
        </div>
      </div>

      {/* 导航 */}
      <nav className="px-3 py-2 space-y-0.5 shrink-0">
        {NAV.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'nav-item-glow flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-all duration-200 group relative',
                  isActive
                    ? 'active bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20'
                    : 'text-bone-dim hover:text-bone hover:bg-[var(--bg-hover)] border border-transparent'
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-[var(--accent)]" />
                  )}
                  <Icon className="w-[16px] h-[16px]" strokeWidth={1.8} />
                  <span className="font-medium">{item.label}</span>
                </>
              )}
            </NavLink>
          )
        })}
      </nav>

      {/* 分隔线 */}
      <div className="mx-5 my-3 h-px bg-gradient-to-r from-transparent via-[var(--border-strong)] to-transparent shrink-0" />

      {/* 科目列表 */}
      <div className="px-5 pb-2 flex items-center justify-between shrink-0">
        <span className="label !mb-0">考试科目</span>
        <button
          className="w-5 h-5 flex items-center justify-center rounded-md text-bone-muted hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-all"
          onClick={async () => {
            const name = await promptDialog('请输入科目名称（如：操作系统）', { placeholder: '操作系统' })
            if (name?.trim()) {
              await createSubject(name.trim(), '#3b82f6')
            }
          }}
          title="新建科目"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={2.2} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-0.5 min-h-0">
        {subjects.length === 0 && (
          <p className="px-3 py-3 text-xs text-bone-faint text-center">暂无科目，点击 + 创建</p>
        )}
        {subjects.map((s) => (
          <div
            key={s.id}
            className={cn(
              'group flex items-center gap-2.5 px-3 py-1.5 rounded-lg cursor-pointer transition-all duration-200',
              currentSubjectId === s.id ? 'bg-[var(--bg-elevated)] shadow-sm' : 'hover:bg-[var(--bg-hover)]'
            )}
            onClick={() => selectSubject(s.id)}
          >
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: s.color, boxShadow: `0 0 8px ${s.color}80` }}
            />
            <span className={cn('flex-1 text-[13px] truncate', currentSubjectId === s.id ? 'text-bone font-medium' : 'text-bone-dim')}>
              {s.name}
            </span>
            <button
              className="opacity-0 group-hover:opacity-100 text-bone-faint hover:text-rust transition-all text-xs w-4 h-4 flex items-center justify-center rounded"
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
      <div className="px-3 py-3 border-t border-[var(--border)] space-y-0.5 shrink-0">
        <button
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-bone-dim hover:text-bone hover:bg-[var(--bg-hover)] transition-all duration-200"
          onClick={toggleTheme}
          title={theme === 'light' ? '切换到暗色' : '切换到浅色'}
        >
          {theme === 'light' ? <Moon className="w-[16px] h-[16px]" strokeWidth={1.8} /> : <Sun className="w-[16px] h-[16px]" strokeWidth={1.8} />}
          <span className="font-medium">{theme === 'light' ? '暗色模式' : '浅色模式'}</span>
        </button>
        <button
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-bone-dim hover:text-bone hover:bg-[var(--bg-hover)] transition-all duration-200"
          onClick={() => navigate('/profile')}
        >
          <User className="w-[16px] h-[16px]" strokeWidth={1.8} />
          <span className="font-medium">个人信息</span>
        </button>
        <button
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-bone-dim hover:text-bone hover:bg-[var(--bg-hover)] transition-all duration-200"
          onClick={() => navigate('/setup')}
        >
          <Settings className="w-[16px] h-[16px]" strokeWidth={1.8} />
          <span className="font-medium">API 设置</span>
        </button>
      </div>
    </aside>
  )
}
