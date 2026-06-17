// 页面头部组件
import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  icon?: ReactNode
  actions?: ReactNode
}

export default function PageHeader({ title, subtitle, icon, actions }: PageHeaderProps) {
  return (
    <div className="flex items-end justify-between gap-4 px-8 pt-8 pb-5 border-b border-amber/8">
      <div className="flex items-center gap-3.5">
        {icon && (
          <div className="w-11 h-11 rounded-xl bg-amber/10 border border-amber/20 flex items-center justify-center text-amber">
            {icon}
          </div>
        )}
        <div>
          <h2 className="font-display text-3xl text-bone leading-tight">{title}</h2>
          {subtitle && <p className="text-sm text-bone-muted mt-1">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
