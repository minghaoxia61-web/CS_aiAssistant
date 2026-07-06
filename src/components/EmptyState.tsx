// 空状态占位组件 — Aurora 精致排版
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  desc?: string
  action?: ReactNode
  className?: string
}

export default function EmptyState({ icon, title, desc, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center py-20 px-6', className)}>
      <div className="relative mb-6">
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/20 to-[var(--violet)]/15 rounded-2xl blur-xl" />
        <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--accent)]/12 to-[var(--violet)]/8 border border-[var(--accent)]/20 flex items-center justify-center text-[var(--accent)]">
          {icon}
        </div>
      </div>
      <h3 className="font-display text-[26px] text-bone mb-2 tracking-tight">{title}</h3>
      {desc && <p className="text-sm text-bone-muted max-w-md mb-6 leading-relaxed">{desc}</p>}
      {action}
    </div>
  )
}
