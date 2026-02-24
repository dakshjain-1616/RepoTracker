'use client'

import { useEffect } from 'react'
import { X, ExternalLink, MessageSquare, Clock, Star } from 'lucide-react'
import { AimlBadge } from './AimlBadge'
import { DifficultyBadge } from './DifficultyBadge'
import { SolvabilityMeter } from './SolvabilityMeter'
import type { IssueWithRepo, IssueDifficulty } from '@/types'

const CATEGORY_META: Record<string, { emoji: string; label: string }> = {
  agent_building:    { emoji: '🤖', label: 'Agent Building' },
  memory_context:    { emoji: '🧠', label: 'Memory / Context' },
  model_integration: { emoji: '🔌', label: 'Model Integration' },
  training:          { emoji: '🏋', label: 'Training' },
  inference:         { emoji: '⚡', label: 'Inference' },
  embeddings:        { emoji: '📐', label: 'Embeddings' },
  evaluation:        { emoji: '📊', label: 'Evaluation' },
  tools_plugins:     { emoji: '🛠', label: 'Tools / Plugins' },
}

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

interface SolveWithNewDrawerProps {
  issue: IssueWithRepo | null
  onClose: () => void
}

export function SolveWithNewDrawer({ issue, onClose }: SolveWithNewDrawerProps) {
  const toolUrl = process.env.NEXT_PUBLIC_NEW_TOOL_URL ?? ''

  // ESC to close
  useEffect(() => {
    if (!issue) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [issue, onClose])

  // Lock body scroll when open
  useEffect(() => {
    document.body.style.overflow = issue ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [issue])

  const labels: string[] = issue && Array.isArray(issue.labels) ? issue.labels : []
  const categories = issue?.aiml_categories ?? []

  const bodySnippet = issue?.body
    ? issue.body.replace(/<!--[\s\S]*?-->/g, '').replace(/[#*`>\[\]]/g, '').trim().slice(0, 400)
    : null

  const launchUrl = toolUrl
    ? `${toolUrl}?issue=${encodeURIComponent(issue?.html_url ?? '')}&title=${encodeURIComponent(issue?.title ?? '')}`
    : issue?.html_url ?? '#'

  return (
    <>
      {/* Backdrop — z-60 so it layers above RepoIssuesDrawer (z-40) */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-60 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          issue ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Drawer panel — z-70 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Solve with New"
        className={`fixed right-0 top-0 z-70 h-full w-full max-w-lg flex flex-col
          bg-background border-l border-border shadow-2xl
          transition-transform duration-300 ease-in-out
          ${issue ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <AimlBadge />
            <span className="text-sm font-semibold">Solve with New</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Close drawer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
          {issue && (
            <>
              {/* Repo meta */}
              <div className="flex items-center gap-2 flex-wrap">
                {issue.llm_difficulty && (
                  <DifficultyBadge difficulty={issue.llm_difficulty as IssueDifficulty} />
                )}
                <span className="text-xs font-mono text-muted-foreground">{issue.repo_full_name}</span>
                <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                  <Star className="h-3 w-3" />
                  {formatStars(issue.repo_stars)}
                </span>
              </div>

              {/* Issue title */}
              <div>
                <a
                  href={issue.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-base font-bold leading-snug hover:text-primary transition-colors"
                >
                  #{issue.number} {issue.title}
                </a>
              </div>

              {/* Labels */}
              {labels.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {labels.map(label => (
                    <span key={label} className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                      {label}
                    </span>
                  ))}
                </div>
              )}

              {/* AIML categories */}
              {categories.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                    AI/ML Categories
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {categories.map(cat => {
                      const meta = CATEGORY_META[cat]
                      if (!meta) return null
                      return (
                        <span
                          key={cat}
                          className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs text-amber-300"
                        >
                          <span>{meta.emoji}</span>
                          {meta.label}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Divider */}
              <div className="h-px bg-border" />

              {/* Summary or body */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                  {issue.llm_summary ? 'Summary' : 'Description'}
                </p>
                <p className="text-sm text-foreground/80 leading-relaxed italic">
                  {issue.llm_summary ?? bodySnippet ?? 'No description available.'}
                </p>
              </div>

              {/* Solvability */}
              {issue.llm_solvability !== null && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                    Solvability
                  </p>
                  <SolvabilityMeter score={issue.llm_solvability} />
                </div>
              )}

              {/* Footer meta */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
                <span className="flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" />
                  {issue.comments} comments
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  updated {timeAgo(issue.updated_at)}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Sticky CTA footer */}
        {issue && (
          <div className="px-6 py-4 border-t border-border flex-shrink-0 flex flex-col gap-2">
            <a
              href={launchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-black font-semibold py-3 text-sm transition-colors"
            >
              {toolUrl ? 'Launch in New' : 'View Issue'}
              <ExternalLink className="h-4 w-4" />
            </a>
            {toolUrl && (
              <a
                href={issue.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-1 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                View on GitHub <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        )}
      </div>
    </>
  )
}
