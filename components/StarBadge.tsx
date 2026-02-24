'use client'

import { Star } from 'lucide-react'
import { formatStars } from '@/lib/utils'

interface StarBadgeProps {
  count: number
  className?: string
}

export function StarBadge({ count, className }: StarBadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1 font-mono text-sm font-medium ${className ?? ''}`}>
      <Star className="h-3.5 w-3.5 text-yellow-400 fill-yellow-400" />
      <span className="text-foreground">{formatStars(count)}</span>
    </span>
  )
}
