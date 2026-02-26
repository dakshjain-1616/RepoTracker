'use client'

import { useState } from 'react'
import { Bot, ExternalLink, MessageSquare, ChevronDown } from 'lucide-react'
import { DifficultyBadge } from './DifficultyBadge'
import { parseNeoApproach } from '@/lib/utils'
import type { IssueWithRepo, IssueDifficulty, NeoApproachStructured } from '@/types'

interface OpportunityCardProps {
  issue: IssueWithRepo
  onBuildWithNeo: (issue: IssueWithRepo) => void
}

export function OpportunityCard({ issue, onBuildWithNeo }: OpportunityCardProps) {
  const [neoExpanded, setNeoExpanded] = useState(false)

  const labels: string[] = Array.isArray(issue.labels) ? issue.labels : []
  const parsed = parseNeoApproach(issue.neo_approach)
  const neoStruct = (parsed !== null && typeof parsed === 'object') ? parsed as NeoApproachStructured : null

  return (
    <div className="rounded-lg border border-border bg-card/40 hover:bg-card/70 p-3 flex flex-col gap-2 transition-colors">
      {/* Badges + title row */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* Badges */}
          <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
            {issue.llm_difficulty && (
              <DifficultyBadge difficulty={issue.llm_difficulty as IssueDifficulty} />
            )}
            {labels.slice(0, 2).map(l => (
              <span key={l} className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {l}
              </span>
            ))}
          </div>

          {/* Title */}
          <a
            href={issue.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium leading-snug hover:text-primary transition-colors line-clamp-2 block"
          >
            #{issue.number} {issue.title}
          </a>

          {/* LLM summary */}
          {issue.llm_summary && (
            <p className="text-xs text-muted-foreground italic mt-1 line-clamp-1">
              {issue.llm_summary}
            </p>
          )}

          {/* Footer meta */}
          <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-0.5">
              <MessageSquare className="h-2.5 w-2.5" />
              {issue.comments}
            </span>
            {issue.llm_solvability !== null && (
              <span className="text-green-400 font-medium">
                {issue.llm_solvability.toFixed(1)}/10
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
          <button
            onClick={() => onBuildWithNeo(issue)}
            className="flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/30 px-2.5 py-1.5 text-xs font-semibold text-amber-400 transition-colors whitespace-nowrap"
          >
            <Bot className="h-3 w-3" />
            Build with NEO
          </button>
          <a
            href={issue.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            View <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </div>
      </div>

      {/* NEO accordion */}
      {parsed !== null && (
        <div className="rounded-md border border-amber-500/20 bg-amber-500/5 overflow-hidden">
          <button
            onClick={() => setNeoExpanded(v => !v)}
            className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left"
          >
            <Bot className="h-3 w-3 text-amber-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-amber-500/70 uppercase tracking-wide">
                AI build plan · how to solve this
              </p>
              {neoStruct && !neoExpanded && (
                <p className="text-xs text-amber-300/80 line-clamp-1 mt-0.5">{neoStruct.summary}</p>
              )}
            </div>
            <ChevronDown
              className={`h-3 w-3 text-amber-400 shrink-0 transition-transform duration-200 ${
                neoExpanded ? 'rotate-180' : ''
              }`}
            />
          </button>

          {neoExpanded && (
            <div className="px-2.5 pb-2.5 pt-1 border-t border-amber-500/10 flex flex-col gap-1.5">
              {neoStruct ? (
                <>
                  <p className="text-xs text-amber-300/80 leading-relaxed">{neoStruct.summary}</p>
                  <ol className="space-y-0.5">
                    {neoStruct.steps.map((step, i) => (
                      <li key={i} className="flex gap-1.5 text-xs text-amber-300/80">
                        <span className="text-amber-500/50 font-mono shrink-0">{i + 1}.</span>
                        {step}
                      </li>
                    ))}
                  </ol>
                  <div className="flex items-center gap-2 mt-0.5">
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
    </div>
  )
}
