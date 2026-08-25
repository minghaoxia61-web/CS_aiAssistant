import { NavLink } from 'react-router-dom'
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
  Plus,
  Settings,
  Users,
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
  { to: '/teacher', label: '教师工作台', description: '班级、任务与学情', icon: Users },
]

export default function Sidebar({ className, collapsed, onNavigate }: { className?: string; collapsed?: boolean; onNavigate?: () => void }) {
  const {
    subjects,
    currentSubjectId,
    selectSubject,
    deleteSubject,
    createSubject,
  } = useStore()

  const createNewSubject = async () => {
    const name = await promptDialog('请输入科目名称', { placeholder: '例如：数据结构' })
    if (name?.trim()) await createSubject(name.trim(), '#20b486')
  }

  return (
    <aside className={cn('app-sidebar w-[224px] shrink-0 h-full flex flex-col overflow-hidden', collapsed && 'app-sidebar-collapsed', className)}>
      <nav className="px-3 pt-4 space-y-1" aria-label="主导航">
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
                    <span className="sidebar-nav-description block text-[10px] text-bone-faint mt-0.5 leading-tight">
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
        <NavLink to="/setup" onClick={onNavigate} className={({ isActive }) => cn('sidebar-settings-link', isActive && 'sidebar-settings-link-active')}>
          <span className="sidebar-nav-icon"><Settings className="w-[17px] h-[17px]" strokeWidth={1.8} /></span>
          <span>设置</span>
        </NavLink>
      </div>
    </aside>
  )
}
