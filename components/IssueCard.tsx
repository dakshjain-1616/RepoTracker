'use client'

import { useState } from 'react'
import { MessageSquare, ExternalLink, Clock, Bot, ChevronDown } from 'lucide-react'
import { DifficultyBadge } from './DifficultyBadge'
import { AimlBadge } from './AimlBadge'
import { SolvabilityMeter } from './SolvabilityMeter'
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
  const [neoExpanded, setNeoExpanded] = useState(false)

  const labels: string[] = Array.isArray(issue.labels) ? issue.labels : []
  const hasLLM = issue.llm_summary !== null && issue.llm_solvability !== null
  const isAiml = issue.is_aiml_issue === 1
  const showNeoIntegration = process.env.NEXT_PUBLIC_ENABLE_NEW_INTEGRATION === 'true'
  const showSolveButton = showNeoIntegration && !!onSolveWithNew

  const parsed = parseNeoApproach(issue.neo_approach)
  const neoStruct = (parsed !== null && typeof parsed === 'object') ? parsed as NeoApproachStructured : null

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

      {/* NEO approach accordion */}
      {parsed !== null && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 overflow-hidden">
          {/* Header — always visible, click to expand */}
          <button
            onClick={() => setNeoExpanded(v => !v)}
            className="w-full flex items-center gap-2 px-3 py-2 text-left"
          >
            <Bot className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-amber-500/70 uppercase tracking-wide">
                How NEO can solve this
              </p>
              {neoStruct && !neoExpanded && (
                <p className="text-xs text-amber-300/80 line-clamp-1 mt-0.5">
                  {neoStruct.summary}
                </p>
              )}
            </div>
            <ChevronDown
              className={`h-3.5 w-3.5 text-amber-400 shrink-0 transition-transform duration-200 ${
                neoExpanded ? 'rotate-180' : ''
              }`}
            />
          </button>

          {/* Expanded body */}
          {neoExpanded && (
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
          )}
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
