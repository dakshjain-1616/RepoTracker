'use client'

import { useState } from 'react'
import { RefreshCw, Clock } from 'lucide-react'
import { timeAgo } from '@/lib/utils'

interface SyncStatusProps {
  lastSynced: string | null
  onRefresh?: () => void
}

export function SyncStatus({ lastSynced, onRefresh }: SyncStatusProps) {
  const [isSyncing, setIsSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSync() {
    setIsSyncing(true)
    setError(null)
    try {
      const res = await fetch('/api/sync', { method: 'POST' })
      const data = await res.json()
      if (!data.success) {
        setError(data.error || 'Sync failed')
      } else {
        onRefresh?.()
      }
    } catch {
      setError('Network error')
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        <span suppressHydrationWarning>
          {lastSynced ? `Synced ${timeAgo(lastSynced)}` : 'Never synced'}
        </span>
      </div>

      {error && (
        <span className="text-xs text-red-400">{error}</span>
      )}

      <button
        onClick={handleSync}
        disabled={isSyncing}
        className="
          inline-flex items-center gap-1.5 rounded-lg border border-border
          bg-secondary/50 px-3 py-1.5 text-xs font-medium text-foreground
          hover:bg-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed
        "
        title="Trigger manual sync"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
        {isSyncing ? 'Syncing...' : 'Sync Now'}
      </button>
    </div>
  )
}
