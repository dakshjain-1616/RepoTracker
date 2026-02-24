import { NextResponse } from 'next/server'
import { runSync } from '@/lib/github'
import type { SyncResponse } from '@/types'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const count = await runSync()
    const response: SyncResponse = {
      success: true,
      count,
      message: `Synced ${count} repositories`,
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
