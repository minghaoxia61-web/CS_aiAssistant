import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Beaker,
  BookOpen,
  BookX,
  ChevronsLeft,
  ChevronsRight,
  GraduationCap,
  LayoutDashboard,
  Library,
  ListChecks,
  Menu,
  MessagesSquare,
  Moon,
  Search,
  Settings,
  Sun,
  User,
  Users,
  X,
} from 'lucide-react'
import { useStore } from '@/lib/store'

const SEARCH_ITEMS = [
  { to: '/dashboard', label: '学习首页', keywords: '今日计划 进度 首页', icon: LayoutDashboard },
  { to: '/knowledge', label: '知识中心', keywords: '知识图谱 课程 概念', icon: GraduationCap },
  { to: '/chat', label: 'AI 对话', keywords: '问答 助教 聊天', icon: MessagesSquare },
  { to: '/library', label: '资料库', keywords: '文档 笔记 文件', icon: Library },
  { to: '/review', label: '复习中心', keywords: '记忆 回顾 复习', icon: BookOpen },
  { to: '/quiz', label: '自我测验', keywords: '答题 测试 练习', icon: ListChecks },
  { to: '/wrong-book', label: '错题本', keywords: '错题 薄弱', icon: BookX },
  { to: '/analytics', label: '学情分析', keywords: '趋势 数据 分析', icon: BarChart3 },
  { to: '/learning-lab', label: '学习实验室', keywords: '评测 图谱 自适应', icon: Beaker },
  { to: '/teacher', label: '教师工作台', keywords: '班级 任务 教师', icon: Users },
  { to: '/setup', label: '设置', keywords: '模型 API 配置', icon: Settings },
  { to: '/profile', label: '学习档案', keywords: '账号 个人 画像', icon: User },
]

export default function AppTopBar({
  collapsed,
  mobileNavOpen,
  onToggleSidebar,
  onToggleMobileNav,
}: {
  collapsed: boolean
  mobileNavOpen: boolean
  onToggleSidebar: () => void
  onToggleMobileNav: () => void
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const { theme, toggleTheme, profile, subjects, currentSubjectId } = useStore()
  const currentSubject = subjects.find((subject) => subject.id === currentSubjectId)
  const currentPage = SEARCH_ITEMS.find((item) => item.to === location.pathname)?.label || '学习工作台'

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return SEARCH_ITEMS.slice(0, 6)
    return SEARCH_ITEMS.filter((item) => `${item.label} ${item.keywords}`.toLowerCase().includes(normalized)).slice(0, 6)
  }, [query])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
        setSearchOpen(true)
      }
      if (event.key === 'Escape') setSearchOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const go = (to: string) => {
    navigate(to)
    setQuery('')
    setSearchOpen(false)
  }

  const submitSearch = (event: FormEvent) => {
    event.preventDefault()
    if (results[0]) go(results[0].to)
  }

  return (
    <header className="app-topbar">
      <div className="topbar-brand">
        <button className="topbar-mobile-trigger" onClick={onToggleMobileNav} aria-label={mobileNavOpen ? '关闭导航' : '打开导航'}>
          {mobileNavOpen ? <X /> : <Menu />}
        </button>
        <div className="brand-mark topbar-brand-mark">
          <GraduationCap className="w-[18px] h-[18px]" strokeWidth={2.2} />
        </div>
        <div className="topbar-brand-copy">
          <strong>CS Assistant</strong>
          <span>{currentPage}</span>
        </div>
        <button className="topbar-collapse-trigger" onClick={onToggleSidebar} aria-label={collapsed ? '展开侧栏' : '收起侧栏'} title={collapsed ? '展开侧栏' : '收起侧栏'}>
          {collapsed ? <ChevronsRight /> : <ChevronsLeft />}
        </button>
      </div>

      <div className="topbar-search-wrap">
        <form className="topbar-search" onSubmit={submitSearch} role="search">
          <Search aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => window.setTimeout(() => setSearchOpen(false), 120)}
            placeholder="搜索页面、资料或学习工具"
            aria-label="全局搜索"
          />
          <kbd>Ctrl K</kbd>
        </form>
        {searchOpen && (
          <div className="topbar-search-results">
            <div className="search-result-heading">{query ? '搜索结果' : '快速前往'}</div>
            {results.length > 0 ? results.map((item) => {
              const Icon = item.icon
              return (
                <button key={item.to} onMouseDown={() => go(item.to)}>
                  <span><Icon /></span>
                  <span>{item.label}<small>{item.keywords.split(' ').slice(0, 2).join(' · ')}</small></span>
                </button>
              )
            }) : <p className="search-empty">没有匹配的功能，试试“复习”或“资料”。</p>}
          </div>
        )}
      </div>

      <div className="topbar-actions">
        {currentSubject && (
          <div className="topbar-subject" title={`当前科目：${currentSubject.name}`}>
            <span style={{ backgroundColor: currentSubject.color }} />
            <span>{currentSubject.name}</span>
          </div>
        )}
        <button className="topbar-icon-button" onClick={toggleTheme} aria-label="切换主题" title="切换主题">
          {theme === 'light' ? <Moon /> : <Sun />}
        </button>
        <button className="topbar-account" onClick={() => navigate('/profile')}>
          <span className="topbar-avatar">{(profile?.nickname || '学').slice(0, 1)}</span>
          <span className="topbar-account-copy">
            <strong>{profile?.nickname || '学习者'}</strong>
            <small>个人学习档案</small>
          </span>
        </button>
      </div>
    </header>
  )
}
