'use client'

import { useState, useEffect, useCallback } from 'react'
import { IssueCard } from './IssueCard'
import { IssuesFilterBar } from './IssuesFilterBar'
import { SyncStatus } from './SyncStatus'
import { SolveWithNewDrawer } from './SolveWithNewDrawer'
import { ChevronLeft, ChevronRight, Loader2, Bot } from 'lucide-react'
import type { IssueWithRepo, IssueStats, IssuesApiResponse } from '@/types'

const LIMIT = 24

interface IssuesLedgerProps {
  initialData: IssuesApiResponse
}

export function IssuesLedger({ initialData }: IssuesLedgerProps) {
  const [issues, setIssues]         = useState<IssueWithRepo[]>(initialData.issues)
  const [total, setTotal]           = useState(initialData.total)
  const [lastSynced, setLastSynced] = useState<string | null>(initialData.lastSynced ?? null)
  const [stats, setStats]           = useState<IssueStats | undefined>(initialData.stats)
  const [page, setPage]             = useState(1)
  const [difficulty, setDifficulty] = useState('')
  const [aimlOnly, setAimlOnly]     = useState(false)
  const [q, setQ]                   = useState('')
  const [sort, setSort]             = useState('solvability')
  const [loading, setLoading]       = useState(false)
  const [drawerIssue, setDrawerIssue] = useState<IssueWithRepo | null>(null)

  const newEnabled = process.env.NEXT_PUBLIC_ENABLE_NEW_INTEGRATION === 'true'

  const fetchIssues = useCallback(async (
    pg: number,
    diff: string,
    query: string,
    srt: string,
    aiml: boolean,
  ) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(pg), limit: String(LIMIT), sort: srt })
      if (diff)  params.set('difficulty', diff)
      if (query) params.set('q', query)
      if (aiml)  params.set('aiml', 'true')

      const res = await fetch(`/api/issues?${params}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data: IssuesApiResponse = await res.json()
      setIssues(data.issues)
      setTotal(data.total)
      if (data.lastSynced !== undefined) setLastSynced(data.lastSynced ?? null)
      if (data.stats)                    setStats(data.stats)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Re-fetch when filters change (reset to page 1)
  useEffect(() => {
    setPage(1)
    fetchIssues(1, difficulty, q, sort, aimlOnly)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [difficulty, sort, aimlOnly])

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1)
      fetchIssues(1, difficulty, q, sort, aimlOnly)
    }, 400)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const totalPages = Math.ceil(total / LIMIT)

  function goTo(pg: number) {
    setPage(pg)
    fetchIssues(pg, difficulty, q, sort, aimlOnly)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const totalAnalyzed = stats
    ? stats.beginner + stats.intermediate + stats.advanced
    : 0

  return (
    <div className="flex flex-col gap-6">
      {/* Top bar: stats + sync */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        {stats && (totalAnalyzed > 0 || stats.aiml > 0) ? (
          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            <span className="font-medium text-foreground">{total} open issues</span>
            <span className="h-3 w-px bg-border" />
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
              {stats.beginner} beginner
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-yellow-500" />
              {stats.intermediate} intermediate
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
              {stats.advanced} advanced
            </span>
            {newEnabled && stats.aiml > 0 && (
              <span className="flex items-center gap-1 text-amber-400">
                <Bot className="h-3 w-3" />
                {stats.aiml} AI/ML
              </span>
            )}
            {stats.unanalyzed > 0 && (
              <span className="flex items-center gap-1 opacity-60">
                <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground" />
                {stats.unanalyzed} unanalyzed
              </span>
            )}
          </div>
        ) : (
          <div />
        )}
        <SyncStatus
          lastSynced={lastSynced}
          onRefresh={() => fetchIssues(1, difficulty, q, sort, aimlOnly)}
        />
      </div>

      <IssuesFilterBar
        difficulty={difficulty}
        q={q}
        sort={sort}
        aimlOnly={aimlOnly}
        onDifficulty={d => setDifficulty(d)}
        onQ={v => setQ(v)}
        onSort={s => setSort(s)}
        onAimlOnly={v => setAimlOnly(v)}
      />

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : issues.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
          <p className="text-base font-medium">No issues found</p>
          <p className="text-sm">
            Use <strong className="text-foreground">Sync Now</strong> above to discover trending repos and fetch their issues.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {issues.map(issue => (
              <IssueCard
                key={issue.id}
                issue={issue}
                onSolveWithNew={newEnabled ? setDrawerIssue : undefined}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => goTo(page - 1)}
                disabled={page <= 1}
                className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-muted/50 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                Prev
              </button>
              <span className="text-sm text-muted-foreground px-2">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => goTo(page + 1)}
                disabled={page >= totalPages}
                className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-muted/50 transition-colors"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          <p className="text-center text-xs text-muted-foreground">
            {total} issue{total !== 1 ? 's' : ''}
          </p>
        </>
      )}

      {/* Solve with New drawer — rendered once, manages its own animation */}
      <SolveWithNewDrawer
        issue={drawerIssue}
        onClose={() => setDrawerIssue(null)}
      />
    </div>
  )
}
