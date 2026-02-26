/**
 * Node.js-only scheduler — imported exclusively from instrumentation.ts
 * when NEXT_RUNTIME === 'nodejs'. Keeping all Node.js/DB imports here
 * prevents Turbopack from bundling them into the Edge runtime.
 */

// Prevent double-registration during Turbopack hot-reload in dev
const _registered = (global as Record<string, unknown>)['__scheduler_registered__']

export async function startScheduler() {
  if (_registered) return
  ;(global as Record<string, unknown>)['__scheduler_registered__'] = true

  const INTERVAL_HOURS = Math.max(0.25, Number(process.env.SYNC_INTERVAL_HOURS ?? '2'))
  const INTERVAL_MS = INTERVAL_HOURS * 60 * 60 * 1000

  const { runSync } = await import('./lib/github')
  const { discoverTrending } = await import('./lib/trending')
  const { syncIssues, generateNeoApproaches, generateRepoInsights } = await import('./lib/issues')

  let syncInProgress = false

  async function runFullSync(label = 'scheduled') {
    if (syncInProgress) {
      console.log(`[Scheduler] ${label} sync skipped — previous sync still running`)
      return
    }
    syncInProgress = true
    const start = Date.now()
    try {
      console.log(`[Scheduler] Starting ${label} sync...`)
      const [count, trendingCount] = await Promise.all([runSync(), discoverTrending()])
      const issueCount = await syncIssues()
      await generateNeoApproaches()
      await generateRepoInsights()
      const elapsed = ((Date.now() - start) / 1000).toFixed(1)
      console.log(
        `[Scheduler] ${label} sync done in ${elapsed}s — ` +
        `${count} repos, ${trendingCount} trending, ${issueCount} issues`
      )
    } catch (err) {
      console.error(`[Scheduler] ${label} sync failed:`, err)
    } finally {
      syncInProgress = false
    }
  }

  if (process.env.SYNC_ON_STARTUP !== 'false') {
    setTimeout(() => runFullSync('startup'), 5_000)
  }

  setInterval(() => runFullSync('scheduled'), INTERVAL_MS)
  console.log(`[Scheduler] Auto-sync registered — every ${INTERVAL_HOURS}h (${(INTERVAL_MS / 60_000).toFixed(0)} min)`)
}
