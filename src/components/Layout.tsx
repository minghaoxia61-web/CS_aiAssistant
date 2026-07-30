import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import Sidebar from './Sidebar'
import AgentToast from './AgentToast'
import Onboarding from './Onboarding'
import { useStore } from '@/lib/store'

export default function Layout() {
  const { loadConfigs, loadSubjects, loadProfile, initTheme } = useStore()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    initTheme()
    loadConfigs()
    loadSubjects()
    loadProfile()
  }, [loadConfigs, loadSubjects, loadProfile, initTheme])

  return (
    <div className="app-shell flex h-screen w-screen overflow-hidden">
      <Sidebar className={mobileNavOpen ? 'mobile-nav-open' : ''} onNavigate={() => setMobileNavOpen(false)} />
      {mobileNavOpen && <button className="mobile-nav-backdrop" onClick={() => setMobileNavOpen(false)} aria-label="关闭导航" />}
      <button className="mobile-menu-button" onClick={() => setMobileNavOpen((value) => !value)} aria-label="打开导航">
        {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>
      <main className="app-main flex-1 h-full min-w-0 overflow-hidden">
        <div className="app-content h-full overflow-hidden">
          <Outlet />
        </div>
      </main>
      <AgentToast />
      <Onboarding />
    </div>
  )
}
