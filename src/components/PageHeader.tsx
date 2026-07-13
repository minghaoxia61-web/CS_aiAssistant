// 页面头部组件 — Aurora 精致排版
import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  icon?: ReactNode
  actions?: ReactNode
}

export default function PageHeader({ title, subtitle, icon, actions }: PageHeaderProps) {
  return (
    <div className="flex items-end justify-between gap-4 px-8 pt-7 pb-4 border-b border-[var(--border)] shrink-0">
      <div className="flex items-center gap-3.5">
        {icon && (
          <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--accent)]/12 to-[var(--violet)]/8 border border-[var(--accent)]/20 flex items-center justify-center text-[var(--accent)]">
            {icon}
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/5 to-transparent" />
          </div>
        )}
        <div>
          <h2 className="font-display text-[28px] text-bone leading-tight tracking-tight">{title}</h2>
          {subtitle && <p className="text-[13px] text-bone-muted mt-1 font-mono">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
