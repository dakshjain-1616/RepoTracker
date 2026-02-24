import { NextRequest, NextResponse } from 'next/server'
import { discoverTrending } from '@/lib/trending'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const count = await discoverTrending()
    return NextResponse.json({ ok: true, discovered: count })
  } catch (err) {
    console.error('[cron/discover]', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
