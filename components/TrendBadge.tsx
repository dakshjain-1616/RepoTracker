'use client'

import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { formatChange } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface TrendBadgeProps {
  value: number | null | undefined
  className?: string
}

export function TrendBadge({ value, className }: TrendBadgeProps) {
  if (value === null || value === undefined) {
    return (
      <span className={cn('inline-flex items-center gap-0.5 text-xs text-muted-foreground', className)}>
        <Minus className="h-3 w-3" />
        <span>—</span>
      </span>
    )
  }

  if (value === 0) {
    return (
      <span className={cn('inline-flex items-center gap-0.5 text-xs text-muted-foreground', className)}>
        <Minus className="h-3 w-3" />
        <span>0</span>
      </span>
    )
  }

  const isPositive = value > 0

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-xs font-medium',
        isPositive ? 'text-emerald-400' : 'text-red-400',
        className
      )}
    >
      {isPositive ? (
        <TrendingUp className="h-3 w-3" />
      ) : (
        <TrendingDown className="h-3 w-3" />
      )}
      <span>{formatChange(value)}</span>
    </span>
  )
}
