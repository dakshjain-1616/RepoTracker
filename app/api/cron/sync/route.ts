import { NextRequest, NextResponse } from 'next/server'
import { runSync } from '@/lib/github'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 min — Vercel Pro/hobby max

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const count = await runSync()
    return NextResponse.json({ ok: true, synced: count })
  } catch (err) {
    console.error('[cron/sync]', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
