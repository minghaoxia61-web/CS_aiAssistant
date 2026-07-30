import { NavLink, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Beaker,
  LayoutDashboard,
  BookOpen,
  BookX,
  ChevronRight,
  GraduationCap,
  Library,
  ListChecks,
  MessagesSquare,
  Moon,
  Plus,
  Settings,
  Sparkles,
  Sun,
  User,
} from 'lucide-react'
import { useStore } from '@/lib/store'
import { confirmDialog, promptDialog } from '@/lib/dialog'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/dashboard', label: '学习首页', description: '今日计划与进度', icon: LayoutDashboard },
  { to: '/knowledge', label: '知识中心', description: '课程知识图谱', icon: GraduationCap },
  { to: '/chat', label: 'AI 对话', description: '基于资料问答', icon: MessagesSquare },
  { to: '/library', label: '资料库', description: '管理学习资料', icon: Library },
  { to: '/review', label: '复习中心', description: '重点快速回顾', icon: BookOpen },
  { to: '/quiz', label: '自我测验', description: '检验掌握程度', icon: ListChecks },
  { to: '/wrong-book', label: '错题本', description: '攻克薄弱环节', icon: BookX },
  { to: '/analytics', label: '学情分析', description: '查看学习趋势', icon: BarChart3 },
  { to: '/learning-lab', label: '学习实验室', description: '评测、图谱与自适应', icon: Beaker },
]

export default function Sidebar({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const navigate = useNavigate()
  const {
    subjects,
    currentSubjectId,
    selectSubject,
    deleteSubject,
    createSubject,
    theme,
    toggleTheme,
    profile,
  } = useStore()

  const createNewSubject = async () => {
    const name = await promptDialog('请输入科目名称', { placeholder: '例如：数据结构' })
    if (name?.trim()) await createSubject(name.trim(), '#20b486')
  }

  return (
    <aside className={cn('app-sidebar w-[268px] shrink-0 h-full flex flex-col overflow-hidden', className)}>
      <div className="px-5 pt-5 pb-4 shrink-0">
        <div className="flex items-center gap-3.5">
          <div className="brand-mark">
            <GraduationCap className="w-5 h-5" strokeWidth={2.1} />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-[17px] leading-none text-bone tracking-[-0.03em]">
              CS Assistant
            </h1>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="status-dot" />
              <p className="text-[10px] uppercase tracking-[0.14em] text-bone-faint font-mono">
                Learning workspace
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-4 rounded-2xl p-3.5 sidebar-focus-card">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-amber/12 text-amber flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-bone-faint mb-1">今日学习建议</p>
            <p className="text-[13px] text-bone leading-snug">从薄弱知识点开始，完成一次专注复习。</p>
          </div>
        </div>
      </div>

      <nav className="px-3 mt-4 space-y-1 shrink-0" aria-label="主导航">
        <p className="sidebar-section-label">学习空间</p>
        {NAV.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn('sidebar-nav-item group', isActive && 'sidebar-nav-item-active')
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cn('sidebar-nav-icon', isActive && 'sidebar-nav-icon-active')}>
                    <Icon className="w-[17px] h-[17px]" strokeWidth={1.8} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-medium leading-tight">{item.label}</span>
                    <span className="block text-[10px] text-bone-faint mt-0.5 leading-tight">
                      {item.description}
                    </span>
                  </span>
                  <ChevronRight
                    className={cn(
                      'w-3.5 h-3.5 text-bone-faint opacity-0 -translate-x-1 transition-all',
                      'group-hover:opacity-100 group-hover:translate-x-0',
                      isActive && 'opacity-100 translate-x-0 text-amber',
                    )}
                  />
                </>
              )}
            </NavLink>
          )
        })}
      </nav>

      <div className="flex-1 min-h-0 px-3 mt-4 flex flex-col">
        <div className="flex items-center justify-between px-2 mb-2">
          <p className="sidebar-section-label !px-0 !mb-0">我的科目</p>
          <button
            className="icon-button !w-7 !h-7"
            onClick={createNewSubject}
            title="新建科目"
            aria-label="新建科目"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="overflow-y-auto min-h-0 space-y-1 pr-1">
          {subjects.length === 0 && (
            <button className="sidebar-empty-subject" onClick={createNewSubject}>
              <Plus className="w-4 h-4" />
              <span>创建第一个科目</span>
            </button>
          )}
          {subjects.map((subject) => (
            <div
              key={subject.id}
              className={cn(
                'subject-row group',
                currentSubjectId === subject.id && 'subject-row-active',
              )}
              onClick={() => selectSubject(subject.id)}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: subject.color, boxShadow: `0 0 0 4px ${subject.color}16` }}
              />
              <span className="flex-1 text-[12px] truncate">{subject.name}</span>
              <button
                className="opacity-0 group-hover:opacity-100 text-bone-faint hover:text-rust transition-all px-1"
                onClick={async (event) => {
                  event.stopPropagation()
                  const ok = await confirmDialog(`确认删除科目「${subject.name}」及其所有资料？`, {
                    danger: true,
                  })
                  if (ok) deleteSubject(subject.id)
                }}
                title="删除科目"
                aria-label={`删除${subject.name}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="p-3 shrink-0">
        <div className="sidebar-profile-card">
          <button className="flex items-center gap-3 flex-1 min-w-0 text-left" onClick={() => navigate('/profile')}>
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber/20 to-sage/15 border border-white/5 flex items-center justify-center text-amber shrink-0">
              <User className="w-4 h-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-[12px] font-medium text-bone truncate">
                {profile?.nickname || '学习者'}
              </span>
              <span className="block text-[10px] text-bone-faint mt-0.5">查看个人学习档案</span>
            </span>
          </button>
          <button className="icon-button !w-8 !h-8" onClick={toggleTheme} title="切换主题" aria-label="切换主题">
            {theme === 'light' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
          </button>
          <button className="icon-button !w-8 !h-8" onClick={() => navigate('/setup')} title="设置" aria-label="设置">
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  )
}
