'use client'

import { Database, GitFork, Star, TrendingUp } from 'lucide-react'
import { formatStars } from '@/lib/utils'
import type { Repo } from '@/types'

interface StatsHeaderProps {
  repos: Repo[]
  total: number
}

export function StatsHeader({ repos, total }: StatsHeaderProps) {
  const totalStars = repos.reduce((sum, r) => sum + r.stars, 0)
  const totalForks = repos.reduce((sum, r) => sum + r.forks, 0)
  const avgStars = total > 0 ? Math.round(totalStars / repos.length) : 0

  const stats = [
    {
      icon: Database,
      label: 'Tracked Repos',
      value: total.toString(),
      color: 'text-blue-400',
      bg: 'bg-blue-400/10',
    },
    {
      icon: Star,
      label: 'Total Stars',
      value: formatStars(totalStars),
      color: 'text-yellow-400',
      bg: 'bg-yellow-400/10',
    },
    {
      icon: GitFork,
      label: 'Total Forks',
      value: formatStars(totalForks),
      color: 'text-purple-400',
      bg: 'bg-purple-400/10',
    },
    {
      icon: TrendingUp,
      label: 'Avg Stars',
      value: formatStars(avgStars),
      color: 'text-emerald-400',
      bg: 'bg-emerald-400/10',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map(stat => (
        <div
          key={stat.label}
          className="rounded-xl border border-border bg-card/50 p-4 flex items-center gap-3"
        >
          <div className={`rounded-lg p-2 ${stat.bg}`}>
            <stat.icon className={`h-4 w-4 ${stat.color}`} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className="text-lg font-semibold font-mono">{stat.value}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
