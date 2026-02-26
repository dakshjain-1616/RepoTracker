'use client'

import { Sparkles, Bot, Clock, ExternalLink, MessageSquare } from 'lucide-react'
import { DifficultyBadge } from './DifficultyBadge'
import { AimlBadge } from './AimlBadge'
import { parseNeoApproach } from '@/lib/utils'
import type { IssueWithRepo, IssueDifficulty, NeoApproachStructured } from '@/types'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

function formatStars(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

interface FeaturedIssueCardProps {
  issue: IssueWithRepo
  onSolveWithNew?: (issue: IssueWithRepo) => void
}

function FeaturedIssueCard({ issue, onSolveWithNew }: FeaturedIssueCardProps) {
  const parsed = parseNeoApproach(issue.neo_approach)
  const neoStruct = (parsed !== null && typeof parsed === 'object') ? parsed as NeoApproachStructured : null
  const isAiml = issue.is_aiml_issue === 1
  const labels: string[] = Array.isArray(issue.labels) ? issue.labels : []
  const showNeoIntegration = process.env.NEXT_PUBLIC_ENABLE_NEW_INTEGRATION === 'true'

  return (
    <div className="relative rounded-xl p-[1px] bg-gradient-to-br from-amber-500/50 via-purple-500/30 to-blue-500/40 hover:from-amber-500/70 hover:via-purple-500/50 hover:to-blue-500/60 transition-all duration-300">
      {/* Featured badge */}
      <div className="absolute -top-2 -right-2 z-10 rounded-full border border-amber-500/50 bg-gradient-to-r from-amber-500/80 to-orange-500/80 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
        Featured
      </div>

      <div className="rounded-xl bg-[hsl(222.2,84%,4.9%)] p-5 h-full flex flex-col gap-3">
        {/* Top badges */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {isAiml && <AimlBadge />}
          {issue.llm_difficulty && (
            <DifficultyBadge difficulty={issue.llm_difficulty as IssueDifficulty} />
          )}
          {labels.slice(0, 2).map(l => (
            <span key={l} className="rounded-full border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
              {l}
            </span>
          ))}
          <span className="ml-auto text-xs text-muted-foreground">★ {formatStars(issue.repo_stars)}</span>
        </div>

        {/* Repo + title */}
        <p className="text-xs text-muted-foreground font-mono">{issue.repo_full_name}</p>
        <a
          href={issue.html_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold leading-snug hover:text-primary transition-colors line-clamp-2"
        >
          #{issue.number} {issue.title}
        </a>

        {/* Summary */}
        {issue.llm_summary && (
          <p className="text-xs text-muted-foreground italic line-clamp-2">{issue.llm_summary}</p>
        )}

        {/* NEO accordion — pre-expanded in featured cards */}
        {parsed !== null && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 flex flex-col">
            <div className="flex items-center gap-2 px-3 py-2">
              <Bot className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <p className="text-[10px] font-semibold text-amber-500/70 uppercase tracking-wide">
                How NEO can solve this
              </p>
            </div>
            <div className="px-3 pb-3 pt-1 border-t border-amber-500/10 flex flex-col gap-2">
              {neoStruct ? (
                <>
                  <p className="text-xs text-amber-300/80 leading-relaxed">{neoStruct.summary}</p>
                  <ol className="space-y-1">
                    {neoStruct.steps.map((step, i) => (
                      <li key={i} className="flex gap-1.5 text-xs text-amber-300/80">
                        <span className="text-amber-500/50 font-mono shrink-0">{i + 1}.</span>
                        {step}
                      </li>
                    ))}
                  </ol>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-400">
                      ⏱ {neoStruct.effort}
                    </span>
                    <span className="rounded-full border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-[10px] text-green-400">
                      ✓ {neoStruct.confidence}/10
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-xs text-amber-300/80 leading-relaxed">{parsed as string}</p>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-auto pt-1 border-t border-border/50">
          <span className="flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />
            {issue.comments}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {timeAgo(issue.updated_at)}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {showNeoIntegration && onSolveWithNew && (
              <button
                onClick={() => onSolveWithNew(issue)}
                className="flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/15 hover:bg-amber-500/25 px-2.5 py-1 text-xs font-medium text-amber-400 transition-colors"
              >
                <Bot className="h-3 w-3" />
                Solve with New
              </button>
            )}
            <a
              href={issue.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-foreground transition-colors"
            >
              View <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

interface FeaturedOpportunitiesProps {
  issues: IssueWithRepo[]
  onSolveWithNew?: (issue: IssueWithRepo) => void
}

export function FeaturedOpportunities({ issues, onSolveWithNew }: FeaturedOpportunitiesProps) {
  if (issues.length === 0) return null

  return (
    <section className="flex flex-col gap-4">
      {/* Section header */}
      <div className="flex items-center gap-2.5">
        <Sparkles className="h-5 w-5 text-amber-400" />
        <h2 className="text-base font-bold tracking-tight">Top Opportunities</h2>
        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-400">
          AI-selected
        </span>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {issues.map(issue => (
          <FeaturedIssueCard
            key={issue.id}
            issue={issue}
            onSolveWithNew={onSolveWithNew}
          />
        ))}
      </div>
    </section>
  )
}
