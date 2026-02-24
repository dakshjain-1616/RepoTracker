import { NextRequest, NextResponse } from 'next/server'
import { getStarHistory } from '@/lib/db'
import type { HistoryResponse } from '@/types'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> }
) {
  try {
    const { owner, repo } = await params
    const { history, repoData } = await getStarHistory(owner, repo)

    if (!repoData) {
      return NextResponse.json({ error: 'Repository not found' }, { status: 404 })
    }

    const response: HistoryResponse = {
      history,
      repo: {
        full_name: repoData.full_name,
        owner: repoData.owner,
        name: repoData.name,
        stars: repoData.stars,
      },
    }

    return NextResponse.json(response)
  } catch (err) {
    console.error('GET /api/history error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
