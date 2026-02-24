'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, ExternalLink, MessageSquare, ChevronLeft, ChevronRight, Loader2, Bot, GitFork } from 'lucide-react'
import { DifficultyBadge } from './DifficultyBadge'
import { AimlBadge } from './AimlBadge'
import { SolvabilityMeter } from './SolvabilityMeter'
import { formatStars } from '@/lib/utils'
import type { Repo, IssueWithRepo, IssuesApiResponse, IssueDifficulty } from '@/types'

const LIMIT = 15

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

interface IssueRowProps {
  issue: IssueWithRepo
  onSolveWithNew?: (issue: IssueWithRepo) => void
}

function IssueRow({ issue, onSolveWithNew }: IssueRowProps) {
  const labels: string[] = Array.isArray(issue.labels) ? issue.labels : []
  const isAiml = issue.is_aiml_issue === 1
  const showSolve =
    isAiml &&
    process.env.NEXT_PUBLIC_ENABLE_NEW_INTEGRATION === 'true' &&
    !!onSolveWithNew

  return (
    <div
      className={`rounded-lg border p-3 flex flex-col gap-2 transition-colors ${
        isAiml
          ? 'border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10'
          : 'border-border bg-card/40 hover:bg-card/70'
      }`}
    >
      {/* Badges */}
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
      </div>

      {/* Title */}
      <a
        href={issue.html_url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm font-medium leading-snug hover:text-primary transition-colors line-clamp-2"
      >
        #{issue.number} {issue.title}
      </a>

      {/* Summary */}
      {issue.llm_summary && (
        <p className="text-xs text-muted-foreground italic line-clamp-1">{issue.llm_summary}</p>
      )}

      {/* Solvability */}
      {issue.llm_solvability !== null && (
        <SolvabilityMeter score={issue.llm_solvability} />
      )}

      {/* Footer */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <MessageSquare className="h-3 w-3" />
          {issue.comments}
        </span>
        <span>{timeAgo(issue.updated_at)}</span>
        <div className="ml-auto flex items-center gap-1.5">
          {showSolve && (
            <button
              onClick={() => onSolveWithNew!(issue)}
              className="flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/15 hover:bg-amber-500/25 px-2 py-0.5 text-xs font-medium text-amber-400 transition-colors"
            >
              <Bot className="h-3 w-3" />
              Solve
            </button>
          )}
          <a
            href={issue.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-0.5 hover:text-foreground transition-colors"
          >
            View <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  )
}

interface RepoIssuesDrawerProps {
  repo: Repo | null
  onClose: () => void
  onSolveWithNew?: (issue: IssueWithRepo) => void
}

export function RepoIssuesDrawer({ repo, onClose, onSolveWithNew }: RepoIssuesDrawerProps) {
  const [issues, setIssues]   = useState<IssueWithRepo[]>([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(1)
  const [loading, setLoading] = useState(false)

  const fetchIssues = useCallback(async (fullName: string, pg: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        repo: fullName,
        page: String(pg),
        limit: String(LIMIT),
        sort: 'solvability',
      })
      const res = await fetch(`/api/issues?${params}`)
      if (!res.ok) throw new Error('Failed')
      const data: IssuesApiResponse = await res.json()
      setIssues(data.issues)
      setTotal(data.total)
    } catch (err) {
      console.error('[RepoIssuesDrawer] fetch failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch when repo changes
  useEffect(() => {
    if (!repo) return
    setPage(1)
    setIssues([])
    fetchIssues(repo.full_name, 1)
  }, [repo, fetchIssues])

  // ESC to close
  useEffect(() => {
    if (!repo) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [repo, onClose])

  // Lock scroll
  useEffect(() => {
    document.body.style.overflow = repo ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [repo])

  function goTo(pg: number) {
    setPage(pg)
    fetchIssues(repo!.full_name, pg)
  }

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          repo ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        className={`fixed right-0 top-0 z-50 h-full w-full max-w-lg flex flex-col
          bg-background border-l border-border shadow-2xl
          transition-transform duration-300 ease-in-out
          ${repo ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-border flex-shrink-0">
          {repo ? (
            <div className="min-w-0 flex-1 pr-4">
              <p className="text-xs text-muted-foreground font-mono mb-0.5">{repo.full_name}</p>
              <h2 className="text-sm font-semibold">Open Issues</h2>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                <span>★ {formatStars(repo.stars)}</span>
                <span className="flex items-center gap-1">
                  <GitFork className="h-3 w-3" />
                  {formatStars(repo.forks)}
                </span>
                <span className={`px-1.5 py-0.5 rounded-full text-xs border ${
                  repo.category === 'AI/ML'
                    ? 'bg-purple-500/15 text-purple-400 border-purple-500/20'
                    : 'bg-blue-500/15 text-blue-400 border-blue-500/20'
                }`}>{repo.category}</span>
              </div>
            </div>
          ) : (
            <div />
          )}
          <button
            onClick={onClose}
            className="rounded-md p-1.5 hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground flex-shrink-0"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : issues.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-2 text-muted-foreground">
              <p className="text-sm font-medium">No labeled issues found</p>
              <p className="text-xs text-center max-w-xs">
                {repo?.source === 'discovered'
                  ? 'Run a sync to fetch good first issue / help wanted issues for this repo.'
                  : 'Issues are synced for trending repos. This repo will be included once it appears in trending.'}
              </p>
              <a
                href={`https://github.com/${repo?.full_name}/issues`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                View all issues on GitHub <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">
                {total} labeled issue{total !== 1 ? 's' : ''} · good first issue / help wanted
              </p>
              {issues.map(issue => (
                <IssueRow
                  key={issue.id}
                  issue={issue}
                  onSolveWithNew={onSolveWithNew}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer: pagination + GitHub link */}
        {repo && (
          <div className="px-5 py-3 border-t border-border flex-shrink-0 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              {totalPages > 1 && (
                <>
                  <button
                    onClick={() => goTo(page - 1)}
                    disabled={page <= 1}
                    className="rounded border border-border px-2 py-1 text-xs hover:bg-muted/50 disabled:opacity-40 transition-colors"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-xs text-muted-foreground px-1">{page}/{totalPages}</span>
                  <button
                    onClick={() => goTo(page + 1)}
                    disabled={page >= totalPages}
                    className="rounded border border-border px-2 py-1 text-xs hover:bg-muted/50 disabled:opacity-40 transition-colors"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
            <a
              href={`https://github.com/${repo.full_name}/issues`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              All issues on GitHub <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </div>
    </>
  )
}
