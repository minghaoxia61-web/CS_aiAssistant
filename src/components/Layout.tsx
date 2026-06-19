// 全局布局：侧边栏 + 主内容区
import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import { useStore } from '@/lib/store'

export default function Layout() {
  const { loadConfigs, loadSubjects, loadProfile, initTheme } = useStore()

  useEffect(() => {
    initTheme()
    loadConfigs()
    loadSubjects()
    loadProfile()
  }, [loadConfigs, loadSubjects, loadProfile, initTheme])

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 h-full overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
