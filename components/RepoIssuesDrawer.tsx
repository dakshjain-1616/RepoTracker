'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  X, ExternalLink, MessageSquare, ChevronLeft, ChevronRight, ChevronDown,
  Loader2, Bot, GitFork, Wifi, Bug, Zap, Lightbulb, Sparkles,
} from 'lucide-react'
import { DifficultyBadge } from './DifficultyBadge'
import { AimlBadge } from './AimlBadge'
import { SolvabilityMeter } from './SolvabilityMeter'
import { SolveWithNewDrawer } from './SolveWithNewDrawer'
import { formatStars, parseNeoApproach, safeJson } from '@/lib/utils'
import type {
  Repo, IssueWithRepo, IssuesApiResponse, IssueDifficulty,
  RepoInsights, RepoInsightTheme, OpportunityType, NeoApproachStructured,
} from '@/types'

const LIMIT = 50  // fetch up to 50 per repo — enables category tab filtering client-side

type ActiveTab = 'all' | OpportunityType

const TABS: {
  key: ActiveTab
  label: string
  Icon: React.ElementType
  activeClass: string
  inactiveColor: string
}[] = [
  { key: 'feature',     label: 'Features',     Icon: Zap,       activeClass: 'border-b-2 border-blue-500 text-blue-400',          inactiveColor: 'text-muted-foreground' },
  { key: 'bug',         label: 'Bugs',         Icon: Bug,       activeClass: 'border-b-2 border-red-500 text-red-400',            inactiveColor: 'text-muted-foreground' },
  { key: 'improvement', label: 'Improvements', Icon: Lightbulb, activeClass: 'border-b-2 border-yellow-500 text-yellow-400',      inactiveColor: 'text-muted-foreground' },
  { key: 'all',         label: 'All Issues',   Icon: Sparkles,  activeClass: 'border-b-2 border-foreground text-foreground',      inactiveColor: 'text-muted-foreground' },
]

const TAB_STYLES: Record<OpportunityType, { card: string; badge: string; button: string; icon: string }> = {
  bug:         { card: 'border-red-500/20 hover:border-red-500/40',    badge: 'bg-red-500/10 text-red-400',    button: 'border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-400',    icon: 'text-red-400' },
  feature:     { card: 'border-blue-500/20 hover:border-blue-500/40',  badge: 'bg-blue-500/10 text-blue-400',  button: 'border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400',  icon: 'text-blue-400' },
  improvement: { card: 'border-yellow-500/20 hover:border-yellow-500/40', badge: 'bg-yellow-500/10 text-yellow-400', button: 'border-yellow-500/40 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400', icon: 'text-yellow-400' },
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

function isAimlIssue(issue: IssueWithRepo): boolean {
  return issue.is_aiml_issue === 1 || issue.repo_category === 'AI/ML'
}

// ── Raw issue row (All Issues tab) ──────────────────────────────────────────

interface IssueRowProps {
  issue: IssueWithRepo
  onSolve: (issue: IssueWithRepo) => void
}

function IssueRow({ issue, onSolve }: IssueRowProps) {
  const [neoExpanded, setNeoExpanded] = useState(false)
  const labels: string[] = Array.isArray(issue.labels) ? issue.labels : []
  const aiml = isAimlIssue(issue)
  const parsed = parseNeoApproach(issue.neo_approach)
  const neoStruct = (parsed !== null && typeof parsed === 'object') ? parsed as NeoApproachStructured : null

  return (
    <div className={`rounded-lg border p-3 flex flex-col gap-2 transition-colors ${
      aiml ? 'border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10'
           : 'border-border bg-card/40 hover:bg-card/70'
    }`}>
      <div className="flex items-center gap-1.5 flex-wrap">
        {aiml && <AimlBadge />}
        {issue.llm_difficulty && <DifficultyBadge difficulty={issue.llm_difficulty as IssueDifficulty} />}
        {labels.slice(0, 2).map(l => (
          <span key={l} className="rounded-full border border-border px-1.5 py-0.5 text-xs text-muted-foreground">{l}</span>
        ))}
      </div>
      <a href={issue.html_url} target="_blank" rel="noopener noreferrer"
        className="text-sm font-medium leading-snug hover:text-primary transition-colors line-clamp-2">
        #{issue.number} {issue.title}
      </a>
      {issue.llm_summary && <p className="text-xs text-muted-foreground italic line-clamp-1">{issue.llm_summary}</p>}
      {issue.llm_solvability !== null && <SolvabilityMeter score={issue.llm_solvability} />}

      {/* NEO approach accordion */}
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

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{issue.comments}</span>
        <span>{timeAgo(issue.updated_at)}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => onSolve(issue)}
            className="flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/30 px-2 py-0.5 text-xs font-semibold text-amber-400 transition-colors">
            <Bot className="h-3 w-3" />
            Build with NEO
          </button>
          <a href={issue.html_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-0.5 hover:text-foreground transition-colors">
            View <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  )
}

// ── AI synthesized theme card (Bugs / Features / Improvements tabs) ─────────

interface InsightThemeCardProps {
  theme: RepoInsightTheme
  type: OpportunityType
  onBuildWithNeo: () => void
}

function InsightThemeCard({ theme, type, onBuildWithNeo }: InsightThemeCardProps) {
  const s = TAB_STYLES[type]
  const TypeIcon = TABS.find(t => t.key === type)!.Icon

  return (
    <div className={`rounded-xl border ${s.card} bg-card/50 p-4 flex flex-col gap-3 transition-colors`}>
      {/* Header */}
      <div className="flex items-start gap-2.5">
        <div className={`mt-0.5 flex-shrink-0 rounded-md p-1.5 ${s.badge}`}>
          <TypeIcon className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <h4 className="text-sm font-semibold text-foreground leading-snug">{theme.title}</h4>
            {theme.urgency && (
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                theme.urgency === 'high'
                  ? 'border-red-500/30 bg-red-500/10 text-red-400'
                  : theme.urgency === 'medium'
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                  : 'border-green-500/30 bg-green-500/10 text-green-400'
              }`}>
                {theme.urgency}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{theme.description}</p>
          {theme.suggested_approach && (
            <div className="flex gap-1.5 rounded-md bg-muted/30 px-2.5 py-1.5 mt-1.5">
              <Lightbulb className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground italic">{theme.suggested_approach}</p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-1 border-t border-border/50">
        <span className="text-[11px] text-muted-foreground font-mono">
          {theme.issue_count} issue{theme.issue_count !== 1 ? 's' : ''} · {theme.total_comments} comments
        </span>
        <button
          onClick={onBuildWithNeo}
          className={`flex items-center gap-1.5 rounded-md border ${s.button} px-3 py-1.5 text-xs font-semibold transition-colors`}
        >
          <Bot className="h-3 w-3" />
          Build with NEO
        </button>
      </div>
    </div>
  )
}

// ── Empty / generating state ─────────────────────────────────────────────────

function InsightsPlaceholder({ type }: { type: OpportunityType }) {
  const label = type === 'bug' ? 'bug themes' : type === 'feature' ? 'feature themes' : 'improvement themes'
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
      <Sparkles className="h-6 w-6 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">AI {label} not yet generated</p>
      <p className="text-xs text-muted-foreground/60 max-w-xs">
        Trigger a sync to generate AI-synthesized themes for this repo.
      </p>
    </div>
  )
}

// ── Main drawer ──────────────────────────────────────────────────────────────

interface RepoIssuesDrawerProps {
  repo: Repo | null
  onClose: () => void
}

export function RepoIssuesDrawer({ repo, onClose }: RepoIssuesDrawerProps) {
  const [allIssues, setAllIssues]   = useState<IssueWithRepo[]>([])
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(1)
  const [loading, setLoading]       = useState(false)
  const [isLive, setIsLive]         = useState(false)
  const [solveIssue, setSolveIssue] = useState<IssueWithRepo | null>(null)
  const [activeTab, setActiveTab]   = useState<ActiveTab>('feature')

  // Insights come from the repo prop (pre-computed during sync)
  const insights: RepoInsights | null = (() => {
    const raw = repo?.opportunity_insights
    if (!raw) return null
    // Validate it's the new structured format (bugs is array or null, not string)
    if (Array.isArray(raw.bugs) || raw.bugs === null) return raw as RepoInsights
    return null
  })()

  const fetchIssues = useCallback(async (fullName: string, pg: number) => {
    setLoading(true)
    setIsLive(false)
    try {
      const dbParams = new URLSearchParams({
        repo: fullName, page: String(pg), limit: String(LIMIT), sort: 'solvability',
      })
      const dbRes = await fetch(`/api/issues?${dbParams}`)
      if (dbRes.ok) {
        const dbData: IssuesApiResponse = await safeJson<IssuesApiResponse>(dbRes)
        if (dbData.total > 0) {
          setAllIssues(dbData.issues)
          setTotal(dbData.total)
          return
        }
      }
      const liveParams = new URLSearchParams({ repo: fullName, page: String(pg), limit: String(LIMIT) })
      const liveRes = await fetch(`/api/issues/live?${liveParams}`)
      if (liveRes.ok) {
        const liveData: IssuesApiResponse = await safeJson<IssuesApiResponse>(liveRes)
        setAllIssues(liveData.issues)
        setTotal(liveData.total)
        setIsLive(true)
      }
    } catch (err) {
      console.error('[RepoIssuesDrawer] fetch failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!repo) return
    setPage(1)
    setAllIssues([])
    setTotal(0)
    setActiveTab('feature')
    fetchIssues(repo.full_name, 1)
  }, [repo, fetchIssues])

  useEffect(() => {
    if (!repo) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !solveIssue) onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [repo, solveIssue, onClose])

  useEffect(() => {
    document.body.style.overflow = repo ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [repo])

  function goTo(pg: number) {
    setPage(pg)
    fetchIssues(repo!.full_name, pg)
  }

  // Theme counts per category (from AI-generated insights)
  const categoryCount = (type: OpportunityType) => {
    const key = type === 'bug' ? 'bugs' : type === 'feature' ? 'features' : 'improvements'
    return insights?.[key]?.length ?? 0
  }

  // Build a synthetic IssueWithRepo from a theme so SolveWithNewDrawer can display it
  function themeToIssue(theme: RepoInsightTheme, type: OpportunityType): IssueWithRepo {
    const now = new Date().toISOString()
    return {
      id: -1,
      github_id: -1,
      repo_id: -1,
      repo_full_name: repo!.full_name,
      number: 0,
      title: theme.title,
      body: theme.description,
      html_url: `https://github.com/${repo!.full_name}/issues`,
      state: 'open',
      labels: [],
      comments: theme.total_comments,
      created_at: now,
      updated_at: now,
      closed_at: null,
      llm_summary: theme.description,
      llm_solvability: null,
      llm_difficulty: null,
      llm_analyzed_at: null,
      last_synced: now,
      is_aiml_issue: null,
      aiml_categories: null,
      aiml_classified_at: null,
      neo_approach: null,
      opportunity_type: type,
      repo_stars: repo!.stars,
      repo_language: repo!.language,
      repo_category: repo!.category,
    }
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
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <p className="text-xs font-mono text-muted-foreground">{repo.full_name}</p>
                {isLive && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-xs text-blue-400">
                    <Wifi className="h-2.5 w-2.5" />Live
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-semibold">
                  Opportunity Discovery
                  {total > 0 && <span className="ml-1.5 text-xs font-normal text-muted-foreground">({total} issues)</span>}
                </h2>
                <span className="inline-flex items-center gap-1 rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-400">
                  <Sparkles className="h-2.5 w-2.5" />AI-powered
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                <span>★ {formatStars(repo.stars)}</span>
                <span className="flex items-center gap-1"><GitFork className="h-3 w-3" />{formatStars(repo.forks)}</span>
                <span className={`px-1.5 py-0.5 rounded-full border ${
                  repo.category === 'AI/ML'
                    ? 'bg-purple-500/15 text-purple-400 border-purple-500/20'
                    : 'bg-blue-500/15 text-blue-400 border-blue-500/20'
                }`}>{repo.category}</span>
              </div>
            </div>
          ) : <div />}
          <button onClick={onClose}
            className="rounded-md p-1.5 hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground flex-shrink-0"
            aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-border flex-shrink-0 px-1 overflow-x-auto">
          {TABS.map(tab => {
            const count = tab.key === 'all' ? total : categoryCount(tab.key as OpportunityType)
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                  isActive ? tab.activeClass : `${tab.inactiveColor} opacity-60 hover:opacity-100 border-b-2 border-transparent`
                }`}
              >
                <tab.Icon className="h-3 w-3" />
                {tab.label}
                {count > 0 && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-mono ${isActive ? 'bg-foreground/10' : 'bg-muted/50'}`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* AI context bar — shown on insight tabs */}
        {activeTab !== 'all' && (
          <div className="flex items-center gap-2 px-5 py-2 bg-muted/20 border-b border-border/50">
            <Sparkles className="h-3 w-3 text-muted-foreground shrink-0" />
            <p className="text-[10px] text-muted-foreground leading-snug">
              <span className="font-medium text-foreground/70">AI-synthesized</span> — similar issues consolidated into user-facing problem themes · click <span className="font-medium text-foreground/70">Build with NEO</span> to solve
            </p>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* ── All Issues tab ── */}
          {activeTab === 'all' && (
            loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : allIssues.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-2 text-muted-foreground">
                <p className="text-sm font-medium">No open issues found</p>
                {repo && (
                  <a href={`https://github.com/${repo.full_name}/issues`} target="_blank" rel="noopener noreferrer"
                    className="mt-2 flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors">
                    View all issues on GitHub <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {allIssues.map(issue => (
                  <IssueRow key={issue.github_id} issue={issue} onSolve={setSolveIssue} />
                ))}
              </div>
            )
          )}

          {/* ── Category tabs: AI-consolidated theme cards only ── */}
          {activeTab !== 'all' && (() => {
            const key = activeTab === 'bug' ? 'bugs' : activeTab === 'feature' ? 'features' : 'improvements'
            const themes = insights?.[key] ?? null

            if (loading) return (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )

            if (!themes || themes.length === 0) return <InsightsPlaceholder type={activeTab} />

            return (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-1.5 px-0.5">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {themes.length} consolidated theme{themes.length !== 1 ? 's' : ''}
                  </p>
                  <span className="text-[10px] text-muted-foreground/60">
                    — derived from {allIssues.length} open issues
                  </span>
                </div>
                {themes.map((theme, i) => (
                  <InsightThemeCard
                    key={i}
                    theme={theme}
                    type={activeTab}
                    onBuildWithNeo={() => setSolveIssue(themeToIssue(theme, activeTab))}
                  />
                ))}
              </div>
            )
          })()}
        </div>

        {/* Footer */}
        {repo && (
          <div className="px-5 py-3 border-t border-border flex-shrink-0 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              {activeTab === 'all' && totalPages > 1 && (
                <>
                  <button onClick={() => goTo(page - 1)} disabled={page <= 1}
                    className="rounded border border-border px-2 py-1 text-xs hover:bg-muted/50 disabled:opacity-40 transition-colors">
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-xs text-muted-foreground px-1">{page}/{totalPages}</span>
                  <button onClick={() => goTo(page + 1)} disabled={page >= totalPages}
                    className="rounded border border-border px-2 py-1 text-xs hover:bg-muted/50 disabled:opacity-40 transition-colors">
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
            <a href={`https://github.com/${repo.full_name}/issues`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              All issues on GitHub <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </div>

      <SolveWithNewDrawer issue={solveIssue} onClose={() => setSolveIssue(null)} />
    </>
  )
}
