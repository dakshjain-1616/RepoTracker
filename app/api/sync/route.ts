import { NextResponse } from 'next/server'
import { runSync } from '@/lib/github'
import { discoverTrending } from '@/lib/trending'
import { syncIssues, generateNeoApproaches, generateRepoInsights } from '@/lib/issues'
import { ensureInit, getDb, getLastSynced } from '@/lib/db'
import type { SyncResponse, SyncStatusResponse } from '@/types'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// GET /api/sync — returns pending work counts (how stale is the data?)
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    await ensureInit()
    const db = getDb()

    const [reposPending, pendingLlm, pendingNeo, totalIssues, lastSynced] = await Promise.all([
      // Repos whose issues are stale (past 12h cooldown) or never synced
      db.execute(`
        SELECT COUNT(*) as count FROM repos
        WHERE issues_last_synced_at IS NULL
           OR issues_last_synced_at < datetime('now', '-12 hours')
      `),
      // Issues that need LLM enrichment (new or updated since last analysis)
      db.execute(`
        SELECT COUNT(*) as count FROM issues
        WHERE state = 'open'
          AND (llm_analyzed_at IS NULL OR updated_at > llm_analyzed_at)
      `),
      // Issues that still need a NEO approach (new or updated since last generation)
      db.execute(`
        SELECT COUNT(*) as count FROM issues
        WHERE neo_approach IS NULL
           OR (neo_generated_at IS NOT NULL AND updated_at > neo_generated_at)
      `),
      // Total open issues in DB
      db.execute(`SELECT COUNT(*) as count FROM issues WHERE state = 'open'`),
      getLastSynced(),
    ])

    const status: SyncStatusResponse = {
      reposPendingIssueSync: Number(reposPending.rows[0].count),
      pendingLlmEnrichment:  Number(pendingLlm.rows[0].count),
      pendingNeoApproaches:  Number(pendingNeo.rows[0].count),
      totalIssues:           Number(totalIssues.rows[0].count),
      lastSynced,
    }

    return NextResponse.json(status)
  } catch (err) {
    console.error('GET /api/sync error:', err)
    return NextResponse.json({ error: 'Failed to get sync status' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// POST /api/sync — trigger sync
//   body: { mode?: "repos" | "issues" | "all" }
//   mode="repos"  → only repo metadata + trending (fast, ~5s)
//   mode="issues" → only issue sync + LLM enrichment + NEO approaches
//   mode="all"    → full sync (default, existing behavior)
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  let mode: 'repos' | 'issues' | 'all' = 'all'
  try {
    const body = await req.json().catch(() => ({}))
    if (body?.mode === 'repos' || body?.mode === 'issues') mode = body.mode
  } catch {
    // no body — default to 'all'
  }

  try {
    if (mode === 'repos') {
      // Fast path: only repo metadata + trending discovery
      const [count, trendingCount] = await Promise.all([runSync(), discoverTrending()])
      const response: SyncResponse = {
        success: true,
        count,
        mode: 'repos',
        message: `Synced ${count} repos, discovered ${trendingCount} trending`,
      }
      return NextResponse.json(response)
    }

    if (mode === 'issues') {
      // Targeted path: only issue sync + enrichment
      const issueCount = await syncIssues()
      await generateNeoApproaches()
      await generateRepoInsights()
      const response: SyncResponse = {
        success: true,
        count: 0,
        issueCount,
        mode: 'issues',
        message: `Fetched ${issueCount} issues`,
      }
      return NextResponse.json(response)
    }

    // Full sync (mode === 'all')
    const [count, trendingCount] = await Promise.all([runSync(), discoverTrending()])
    const issueCount = await syncIssues()
    await generateNeoApproaches()
    await generateRepoInsights()
    const response: SyncResponse = {
      success: true,
      count,
      issueCount,
      mode: 'all',
      message: `Synced ${count} repos, discovered ${trendingCount} trending, fetched ${issueCount} issues`,
    }
    return NextResponse.json(response)
  } catch (err) {
    console.error('POST /api/sync error:', err)
    const response: SyncResponse = {
      success: false,
      count: 0,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
    return NextResponse.json(response, { status: 500 })
  }
}
