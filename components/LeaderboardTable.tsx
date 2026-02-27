'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search } from 'lucide-react'
import { RepoRow } from './RepoRow'
import { FilterBar } from './FilterBar'
import { SyncStatus } from './SyncStatus'
import { StatsHeader } from './StatsHeader'
import { RepoIssuesDrawer } from './RepoIssuesDrawer'
import type { Repo, ApiResponse, CategoryFilter, SortField } from '@/types'
import { safeJson } from '@/lib/utils'

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'stars', label: 'Stars' },
  { value: 'forks', label: 'Forks' },
  { value: 'growth24h', label: '24h Growth' },
  { value: 'growth7d', label: '7d Growth' },
]

interface LeaderboardTableProps {
  initialData: ApiResponse
}

const POLL_INTERVAL = 5 * 60 * 1000 // 5 minutes

export function LeaderboardTable({ initialData }: LeaderboardTableProps) {
  const [repos, setRepos] = useState<Repo[]>(initialData.repos)
  const [total, setTotal] = useState(initialData.total)
  const [lastSynced, setLastSynced] = useState<string | null>(initialData.lastSynced)
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [sort, setSort] = useState<SortField>('stars')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [issuesRepo, setIssuesRepo] = useState<Repo | null>(null)

  const limit = 25

  const fetchRepos = useCallback(async (opts?: {
    cat?: CategoryFilter
    s?: SortField
    q?: string
    p?: number
  }) => {
    const cat = opts?.cat ?? category
    const s = opts?.s ?? sort
    const q = opts?.q ?? search
    const p = opts?.p ?? page

    setLoading(true)
    try {
      const params = new URLSearchParams({
        category: cat,
        sort: s,
        q,
        page: p.toString(),
        limit: limit.toString(),
      })
      const res = await fetch(`/api/repos?${params}`)
      const data: ApiResponse = await safeJson<ApiResponse>(res)
      setRepos(data.repos)
      setTotal(data.total)
      setLastSynced(data.lastSynced)
    } catch (err) {
      console.error('Failed to fetch repos:', err)
    } finally {
      setLoading(false)
    }
  }, [category, sort, search, page])

  // Poll every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      fetchRepos()
    }, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchRepos])

  function handleCategoryChange(cat: CategoryFilter) {
    setCategory(cat)
    setPage(1)
    fetchRepos({ cat, p: 1 })
  }

  function handleSortChange(s: SortField) {
    setSort(s)
    setPage(1)
    fetchRepos({ s, p: 1 })
  }

  function handleSearchChange(q: string) {
    setSearch(q)
    setPage(1)
    fetchRepos({ q, p: 1 })
  }

  function handlePageChange(p: number) {
    setPage(p)
    fetchRepos({ p })
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-4">
      {/* Stats */}
      <StatsHeader repos={repos} total={total} />

      {/* Controls */}
      <div className="flex flex-col gap-2">
        {/* Row 1: Category tabs + Sync status */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <FilterBar
            category={category}
            onCategoryChange={handleCategoryChange}
          />
          <SyncStatus lastSynced={lastSynced} onRefresh={() => fetchRepos()} />
        </div>
        {/* Row 2: Search + Sort (right-aligned) */}
        <div className="flex items-center gap-3 justify-end">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search repos..."
              value={search}
              onChange={e => handleSearchChange(e.target.value)}
              className="w-48 rounded-lg border border-border bg-background/50 py-1.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <select
            value={sort}
            onChange={e => handleSortChange(e.target.value as SortField)}
            className="rounded-lg border border-border bg-background/50 py-1.5 px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
          >
            {SORT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                Sort: {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="py-3 pl-4 pr-2 text-left text-xs font-medium text-muted-foreground w-10">#</th>
                <th className="py-3 px-3 text-left text-xs font-medium text-muted-foreground">Repository</th>
                <th className="py-3 px-3 text-left text-xs font-medium text-muted-foreground hidden md:table-cell">Category</th>
                <th className="py-3 px-3 text-left text-xs font-medium text-muted-foreground hidden lg:table-cell">Language</th>
                <th className="py-3 px-3 text-right text-xs font-medium text-muted-foreground">Stars</th>
                <th className="py-3 px-3 text-right text-xs font-medium text-muted-foreground hidden sm:table-cell">Forks</th>
                <th className="py-3 px-3 text-right text-xs font-medium text-muted-foreground hidden md:table-cell">24h</th>
                <th className="py-3 px-3 text-right text-xs font-medium text-muted-foreground hidden lg:table-cell">7d</th>
                <th className="py-3 px-3 text-center text-xs font-medium text-muted-foreground hidden xl:table-cell">Trend</th>
                <th className="py-3 px-3 text-center text-xs font-medium text-muted-foreground">Issues</th>
              </tr>
            </thead>
            <tbody className={loading ? 'opacity-60' : ''}>
              {repos.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center text-muted-foreground">
                    {loading ? 'Loading...' : total === 0
                      ? <span>No data yet — click <strong className="text-foreground">Sync Now</strong> above to fetch repos from GitHub.</span>
                      : 'No repositories found'}
                  </td>
                </tr>
              ) : (
                repos.map((repo, i) => (
                  <RepoRow
                    key={repo.full_name}
                    repo={repo}
                    index={(page - 1) * limit + i}
                    onViewIssues={setIssuesRepo}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="border-t border-border px-4 py-3 flex items-center justify-between bg-muted/10">
            <span className="text-xs text-muted-foreground">
              Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => handlePageChange(page - 1)}
                disabled={page === 1}
                className="rounded px-2 py-1 text-xs border border-border hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ← Prev
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const p = i + 1
                return (
                  <button
                    key={p}
                    onClick={() => handlePageChange(p)}
                    className={`rounded px-2 py-1 text-xs border transition-colors ${
                      p === page
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:bg-muted/50'
                    }`}
                  >
                    {p}
                  </button>
                )
              })}
              <button
                onClick={() => handlePageChange(page + 1)}
                disabled={page === totalPages}
                className="rounded px-2 py-1 text-xs border border-border hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      <RepoIssuesDrawer
        repo={issuesRepo}
        onClose={() => setIssuesRepo(null)}
      />
    </div>
  )
}
