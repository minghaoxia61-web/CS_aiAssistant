import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { installMockIfNeeded } from '@/lib/api-mock'
import './index.css'

// 浏览器预览环境下安装 window.api mock（Electron 中自动跳过）
installMockIfNeeded()

// 生产环境注册 Service Worker（PWA 离线支持）
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').catch(() => {
    // 注册失败静默处理（如非 HTTPS 环境或 file:// 协议）
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
