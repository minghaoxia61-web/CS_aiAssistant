import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  icon?: ReactNode
  actions?: ReactNode
}

export default function PageHeader({ title, subtitle, icon, actions }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="flex items-center gap-3 min-w-0">
        {icon && <div className="page-header-icon">{icon}</div>}
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] uppercase tracking-[0.16em] font-mono text-amber">Workspace</span>
            <span className="w-1 h-1 rounded-full bg-bone-faint" />
            <span className="text-[10px] text-bone-faint">智能学习助手</span>
          </div>
          <h2 className="font-display text-[25px] text-bone leading-tight tracking-[-0.035em] truncate">
            {title}
          </h2>
          {subtitle && <p className="text-[12px] text-bone-muted mt-1 truncate">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="page-actions shrink-0">{actions}</div>}
    </header>
  )
}
