// 全局布局：侧边栏 + 主内容区
import { useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import { useStore, hasConfig } from '@/lib/store'

export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { config, configLoaded, loadConfig, loadSubjects } = useStore()

  useEffect(() => {
    loadConfig()
    loadSubjects()
  }, [loadConfig, loadSubjects])

  // 配置加载后，若无 API Key 且不在设置页，跳转设置
  useEffect(() => {
    if (configLoaded && !hasConfig({ config, ...useStore.getState() } as never) && location.pathname !== '/setup') {
      navigate('/setup')
    }
  }, [configLoaded, config, location.pathname, navigate])

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 h-full overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
