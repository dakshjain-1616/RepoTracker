import { NextResponse } from 'next/server'
import { ensureInit, getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await ensureInit()
    await getDb().execute(`SELECT 1`)
    return NextResponse.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ status: 'error' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
