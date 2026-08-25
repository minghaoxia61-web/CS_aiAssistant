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
          <h2 className="font-display text-[23px] text-bone leading-tight tracking-[-0.035em] truncate">
            {title}
          </h2>
          {subtitle && <p className="text-[12px] text-bone-muted mt-1 truncate">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="page-actions shrink-0">{actions}</div>}
    </header>
  )
}
