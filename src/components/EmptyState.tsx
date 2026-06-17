// 空状态占位组件
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
    <div className={cn('flex flex-col items-center justify-center text-center py-16 px-6', className)}>
      <div className="w-16 h-16 rounded-2xl bg-amber/8 border border-amber/15 flex items-center justify-center text-amber/60 mb-5">
        {icon}
      </div>
      <h3 className="font-display text-2xl text-bone mb-2">{title}</h3>
      {desc && <p className="text-sm text-bone-muted max-w-md mb-6">{desc}</p>}
      {action}
    </div>
  )
}
