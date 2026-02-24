import { NextRequest, NextResponse } from 'next/server'
import { getIssues } from '@/lib/issues'
import type { IssuesApiResponse } from '@/types'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const difficulty = searchParams.get('difficulty') ?? undefined
    const label      = searchParams.get('label') ?? undefined
    const q          = searchParams.get('q') ?? undefined
    const sort       = searchParams.get('sort') ?? undefined
    const page       = parseInt(searchParams.get('page') ?? '1', 10)
    const limit      = parseInt(searchParams.get('limit') ?? '24', 10)

    const { issues, total, lastSynced, stats } = await getIssues({ difficulty, label, q, sort, page, limit })

    const response: IssuesApiResponse = { issues, total, page, limit, lastSynced, stats }
    return NextResponse.json(response)
  } catch (err) {
    console.error('GET /api/issues error:', err)
    return NextResponse.json({ error: 'Failed to fetch issues' }, { status: 500 })
  }
}
