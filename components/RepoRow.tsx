'use client'

import { useState } from 'react'
import { GitFork, ExternalLink } from 'lucide-react'
import Image from 'next/image'
import type { Repo } from '@/types'
import { StarBadge } from './StarBadge'
import { TrendBadge } from './TrendBadge'
import { Sparkline } from './Sparkline'
import { formatStars, truncate, LANGUAGE_COLORS } from '@/lib/utils'
import type { StarHistory } from '@/types'

interface RepoRowProps {
  repo: Repo
  index: number
}

function RankBadge({ rank, index }: { rank: number | null; index: number }) {
  const displayRank = rank ?? index + 1

  if (displayRank === 1) {
    return (
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-yellow-400/20 text-yellow-400 text-sm font-bold">
        1
      </span>
    )
  }
  if (displayRank === 2) {
    return (
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-400/20 text-slate-300 text-sm font-bold">
        2
      </span>
    )
  }
  if (displayRank === 3) {
    return (
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-orange-700/20 text-orange-500 text-sm font-bold">
        3
      </span>
    )
  }
  return (
    <span className="inline-flex h-7 w-7 items-center justify-center text-muted-foreground text-sm font-mono">
      {displayRank}
    </span>
  )
}

function CategoryPill({ category }: { category: string }) {
  return (
    <span
      className={`
        inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium
        ${category === 'AI/ML'
          ? 'bg-purple-500/15 text-purple-400 border border-purple-500/20'
          : 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
        }
      `}
    >
      {category}
    </span>
  )
}

function LanguageDot({ language }: { language: string | null }) {
  if (!language) return null
  const color = LANGUAGE_COLORS[language] || '#6b7280'
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      {language}
    </span>
  )
}

export function RepoRow({ repo, index }: RepoRowProps) {
  const [history, setHistory] = useState<StarHistory[] | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)

  async function loadHistory() {
    if (history !== null || loadingHistory) return
    setLoadingHistory(true)
    try {
      const res = await fetch(`/api/history/${repo.owner}/${repo.name}`)
      const data = await res.json()
      setHistory(data.history ?? [])
    } catch {
      setHistory([])
    } finally {
      setLoadingHistory(false)
    }
  }

  return (
    <tr
      className="group border-b border-border/50 hover:bg-white/[0.02] transition-colors"
      onMouseEnter={loadHistory}
    >
      {/* Rank */}
      <td className="py-3 pl-4 pr-2 w-10">
        <RankBadge rank={repo.rank} index={index} />
      </td>

      {/* Repo info */}
      <td className="py-3 px-3 min-w-0">
        <div className="flex items-start gap-2.5">
          <div className="relative h-8 w-8 flex-shrink-0 rounded-full overflow-hidden bg-muted">
            <Image
              src={`https://avatars.githubusercontent.com/${repo.owner}`}
              alt={repo.owner}
              fill
              className="object-cover"
              sizes="32px"
              unoptimized
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <a
                href={`https://github.com/${repo.full_name}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold text-foreground hover:text-blue-400 transition-colors truncate"
              >
                {repo.full_name}
              </a>
              <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 flex-shrink-0" />
            </div>
            {repo.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                {truncate(repo.description, 80)}
              </p>
            )}
          </div>
        </div>
      </td>

      {/* Category */}
      <td className="py-3 px-3 hidden md:table-cell">
        <CategoryPill category={repo.category} />
      </td>

      {/* Language */}
      <td className="py-3 px-3 hidden lg:table-cell">
        <LanguageDot language={repo.language} />
      </td>

      {/* Stars */}
      <td className="py-3 px-3 text-right">
        <StarBadge count={repo.stars} />
      </td>

      {/* Forks */}
      <td className="py-3 px-3 text-right hidden sm:table-cell">
        <span className="inline-flex items-center gap-1 text-sm text-muted-foreground font-mono">
          <GitFork className="h-3.5 w-3.5" />
          {formatStars(repo.forks)}
        </span>
      </td>

      {/* 24h change */}
      <td className="py-3 px-3 text-right hidden md:table-cell">
        <TrendBadge value={repo.growth24h} />
      </td>

      {/* 7d change */}
      <td className="py-3 px-3 text-right hidden lg:table-cell">
        <TrendBadge value={repo.growth7d} />
      </td>

      {/* Sparkline */}
      <td className="py-3 px-3 hidden xl:table-cell">
        <div className="flex justify-center">
          {loadingHistory ? (
            <div style={{ width: 80, height: 30 }} className="flex items-center justify-center">
              <div className="h-3 w-3 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />
            </div>
          ) : (
            <Sparkline history={history ?? repo.history ?? []} />
          )}
        </div>
      </td>
    </tr>
  )
}
