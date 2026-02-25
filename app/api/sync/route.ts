import { NextResponse } from 'next/server'
import { runSync } from '@/lib/github'
import { discoverTrending } from '@/lib/trending'
import { syncIssues, generateNeoApproaches } from '@/lib/issues'
import type { SyncResponse } from '@/types'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const [count, trendingCount] = await Promise.all([runSync(), discoverTrending()])
    const issueCount = await syncIssues()
    await generateNeoApproaches()
    const response: SyncResponse = {
      success: true,
      count,
      issueCount,
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
