import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { installMockIfNeeded } from '@/lib/api-mock'
import './index.css'

// 浏览器预览环境下安装 window.api mock（Electron 中自动跳过）
installMockIfNeeded()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
