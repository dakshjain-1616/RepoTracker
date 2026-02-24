'use client'

import { MessageSquare, ExternalLink, Clock, Bot } from 'lucide-react'
import { DifficultyBadge } from './DifficultyBadge'
import { AimlBadge } from './AimlBadge'
import { SolvabilityMeter } from './SolvabilityMeter'
import type { IssueWithRepo, IssueDifficulty } from '@/types'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

function formatStars(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

interface IssueCardProps {
  issue: IssueWithRepo
  onSolveWithNew?: (issue: IssueWithRepo) => void
}

export function IssueCard({ issue, onSolveWithNew }: IssueCardProps) {
  const labels: string[] = Array.isArray(issue.labels) ? issue.labels : []
  const hasLLM = issue.llm_summary !== null && issue.llm_solvability !== null
  const isAiml = issue.is_aiml_issue === 1
  const showSolveButton =
    isAiml &&
    process.env.NEXT_PUBLIC_ENABLE_NEW_INTEGRATION === 'true' &&
    !!onSolveWithNew

  const bodySnippet = issue.body
    ? issue.body.replace(/<!--[\s\S]*?-->/g, '').replace(/[#*`>\[\]]/g, '').trim().slice(0, 120)
    : null

  return (
    <div
      className={`rounded-xl border p-4 flex flex-col gap-3 transition-colors ${
        isAiml
          ? 'border-amber-500/40 bg-amber-500/5 hover:border-amber-500/60 hover:bg-amber-500/10 shadow-[0_0_16px_rgba(245,158,11,0.07)]'
          : 'border-border bg-card/50 hover:border-border/80 hover:bg-card/70'
      }`}
    >
      {/* Top row: badges + stars */}
      <div className="flex items-center gap-2 flex-wrap">
        {isAiml && <AimlBadge />}
        {issue.llm_difficulty && (
          <DifficultyBadge difficulty={issue.llm_difficulty as IssueDifficulty} />
        )}
        {labels.slice(0, isAiml ? 2 : 3).map(label => (
          <span
            key={label}
            className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
          >
            {label}
          </span>
        ))}
        <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
          ★ {formatStars(issue.repo_stars)}
        </span>
      </div>

      {/* Repo name */}
      <p className="text-xs text-muted-foreground font-mono">{issue.repo_full_name}</p>

      {/* Issue title */}
      <a
        href={issue.html_url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm font-semibold leading-snug hover:text-primary transition-colors line-clamp-2"
      >
        #{issue.number} {issue.title}
      </a>

      {/* Summary or body snippet */}
      {hasLLM ? (
        <p className="text-xs text-muted-foreground italic line-clamp-2">
          {issue.llm_summary}
        </p>
      ) : bodySnippet ? (
        <p className="text-xs text-muted-foreground line-clamp-2">{bodySnippet}</p>
      ) : null}

      {/* Solvability meter */}
      {hasLLM && issue.llm_solvability !== null && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">Solvability</p>
          <SolvabilityMeter score={issue.llm_solvability} />
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
          {showSolveButton && (
            <button
              onClick={e => { e.preventDefault(); onSolveWithNew!(issue) }}
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
  )
}
