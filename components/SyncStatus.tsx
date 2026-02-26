'use client'

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Clock, AlertCircle } from 'lucide-react'
import { timeAgo, safeJson } from '@/lib/utils'
import type { SyncStatusResponse } from '@/types'

interface SyncStatusProps {
  lastSynced: string | null
  onRefresh?: () => void
}

export function SyncStatus({ lastSynced, onRefresh }: SyncStatusProps) {
  const [syncingRepos, setSyncingRepos]   = useState(false)
  const [syncingIssues, setSyncingIssues] = useState(false)
  const [error, setError]                 = useState<string | null>(null)
  const [status, setStatus]               = useState<SyncStatusResponse | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/sync')
      if (res.ok) setStatus(await safeJson<SyncStatusResponse>(res))
    } catch { /* non-fatal */ }
  }, [])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  async function handleSync(mode: 'repos' | 'issues') {
    const setSyncing = mode === 'repos' ? setSyncingRepos : setSyncingIssues
    setSyncing(true)
    setError(null)
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
      // Guard: server may return HTML on unexpected errors — always try text first
      const text = await res.text()
      let data: { success?: boolean; error?: string } = {}
      try { data = JSON.parse(text) } catch {
        setError(`Server error (${res.status})`)
        return
      }
      if (!data.success) {
        setError(data.error || 'Sync failed')
      } else {
        onRefresh?.()
        await fetchStatus()
      }
    } catch {
      setError('Network error')
    } finally {
      setSyncing(false)
    }
  }

  const isBusy = syncingRepos || syncingIssues

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Last synced */}
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span suppressHydrationWarning>
            {lastSynced ? `Synced ${timeAgo(lastSynced)}` : 'Never synced'}
          </span>
        </div>

        {/* Sync Repos (fast) */}
        <button
          onClick={() => handleSync('repos')}
          disabled={isBusy}
          className="
            inline-flex items-center gap-1.5 rounded-lg border border-border
            bg-secondary/50 px-3 py-1.5 text-xs font-medium text-foreground
            hover:bg-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed
          "
          title="Sync repo metadata + trending (fast)"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncingRepos ? 'animate-spin' : ''}`} />
          {syncingRepos ? 'Syncing repos…' : 'Sync Repos'}
        </button>

        {/* Sync Issues (targeted) */}
        <button
          onClick={() => handleSync('issues')}
          disabled={isBusy}
          className="
            inline-flex items-center gap-1.5 rounded-lg border border-border
            bg-secondary/50 px-3 py-1.5 text-xs font-medium text-foreground
            hover:bg-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed
          "
          title="Fetch and enrich issues for stale repos"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncingIssues ? 'animate-spin' : ''}`} />
          {syncingIssues
            ? 'Syncing issues…'
            : status?.reposPendingIssueSync
              ? `Sync Issues (${status.reposPendingIssueSync} repos stale)`
              : 'Sync Issues'}
        </button>
      </div>

      {/* Pending work summary */}
      {status && (status.pendingLlmEnrichment > 0 || status.pendingNeoApproaches > 0) && (
        <div className="flex items-center gap-1.5 text-xs text-amber-400/80">
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span>
            {[
              status.pendingLlmEnrichment > 0 && `${status.pendingLlmEnrichment} issues need LLM enrichment`,
              status.pendingNeoApproaches  > 0 && `${status.pendingNeoApproaches} need NEO approach`,
            ].filter(Boolean).join(' · ')}
          </span>
        </div>
      )}

      {error && (
        <span className="text-xs text-red-400">{error}</span>
      )}
    </div>
  )
}
