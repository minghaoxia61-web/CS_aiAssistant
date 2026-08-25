import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import AppTopBar from './AppTopBar'
import AgentToast from './AgentToast'
import Onboarding from './Onboarding'
import { useStore } from '@/lib/store'

export default function Layout() {
  const { loadConfigs, loadSubjects, loadProfile, initTheme } = useStore()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('app-sidebar-collapsed') === 'true')

  useEffect(() => {
    initTheme()
    loadConfigs()
    loadSubjects()
    loadProfile()
  }, [loadConfigs, loadSubjects, loadProfile, initTheme])

  const toggleSidebar = () => {
    setSidebarCollapsed((value) => {
      localStorage.setItem('app-sidebar-collapsed', String(!value))
      return !value
    })
  }

  return (
    <div className="app-shell flex h-screen w-screen flex-col overflow-hidden">
      <AppTopBar
        collapsed={sidebarCollapsed}
        mobileNavOpen={mobileNavOpen}
        onToggleSidebar={toggleSidebar}
        onToggleMobileNav={() => setMobileNavOpen((value) => !value)}
      />
      <div className="app-workspace flex flex-1 min-h-0 overflow-hidden">
        <Sidebar
          collapsed={sidebarCollapsed}
          className={mobileNavOpen ? 'mobile-nav-open' : ''}
          onNavigate={() => setMobileNavOpen(false)}
        />
        {mobileNavOpen && <button className="mobile-nav-backdrop" onClick={() => setMobileNavOpen(false)} aria-label="关闭导航" />}
        <main className="app-main flex-1 h-full min-w-0 overflow-hidden">
          <div className="app-content h-full overflow-hidden">
            <Outlet />
          </div>
        </main>
        <AgentToast />
        <Onboarding />
      </div>
    </div>
  )
}
