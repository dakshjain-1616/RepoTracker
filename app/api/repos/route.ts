import { NextRequest, NextResponse } from 'next/server'
import { getRepos, getLastSynced } from '@/lib/db'
import type { ApiResponse } from '@/types'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category') || 'all'
    const sort = searchParams.get('sort') || 'stars'
    const q = searchParams.get('q') || ''
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '25', 10)

    const [{ repos, total }, lastSynced] = await Promise.all([
      getRepos({ category, sort, q, page, limit }),
      getLastSynced(),
    ])

    const response: ApiResponse = {
      repos,
      total,
      lastSynced,
      page,
      limit,
    }

    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    })
  } catch (err) {
    console.error('GET /api/repos error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
