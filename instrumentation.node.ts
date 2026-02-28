/**
 * Node.js-only scheduler — imported exclusively from instrumentation.ts
 * when NEXT_RUNTIME === 'nodejs'. Keeping all Node.js/DB imports here
 * prevents Turbopack from bundling them into the Edge runtime.
 *
 * Two-phase sync schedule:
 *   Phase 1 (first 48 h):  every SYNC_INTERVAL_PHASE1_HOURS  (default 2.5 h)
 *   Phase 2 (after 48 h):  every SYNC_INTERVAL_PHASE2_HOURS  (default 12 h)
 *
 * The first-deployment timestamp is persisted in the DB so the phase
 * boundary survives container restarts and redeploys.
 *
 * Weekly maintenance: prune star_history rows older than 90 days.
 */

// Prevent double-registration during Turbopack hot-reload in dev
const _registered = (global as Record<string, unknown>)['__scheduler_registered__']

// ---------------------------------------------------------------------------
// Phase configuration
// ---------------------------------------------------------------------------

const PHASE1_DURATION_MS = 48 * 60 * 60 * 1000 // 2 days

function getPhase1IntervalMs(): number {
  const hours = Math.max(0.25, Number(process.env.SYNC_INTERVAL_PHASE1_HOURS ?? '2.5'))
  return hours * 60 * 60 * 1000
}

function getPhase2IntervalMs(): number {
  // Legacy SYNC_INTERVAL_HOURS maps to Phase 2 if set
  const hours = Math.max(1, Number(
    process.env.SYNC_INTERVAL_PHASE2_HOURS ??
    process.env.SYNC_INTERVAL_HOURS ??
    '12'
  ))
  return hours * 60 * 60 * 1000
}

function getNextInterval(firstDeployAt: Date): { ms: number; phase: 1 | 2 } {
  const ageMs = Date.now() - firstDeployAt.getTime()
  if (ageMs < PHASE1_DURATION_MS) {
    const remaining = PHASE1_DURATION_MS - ageMs
    const ms = getPhase1IntervalMs()
    // Don't schedule further than the remaining phase-1 window
    return { ms: Math.min(ms, remaining + 1_000), phase: 1 }
  }
  return { ms: getPhase2IntervalMs(), phase: 2 }
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

export async function startScheduler() {
  if (_registered) return
  ;(global as Record<string, unknown>)['__scheduler_registered__'] = true

  const { runSync } = await import('./lib/github')
  const { discoverTrending } = await import('./lib/trending')
  const { syncIssues, generateNeoApproaches, generateRepoInsights } = await import('./lib/issues')
  const { getOrSetFirstDeployAt, pruneOldStarHistory } = await import('./lib/db')

  // Retrieve (or record) the first-deploy timestamp from the DB
  const firstDeployAt = await getOrSetFirstDeployAt()
  const deployAgeHours = ((Date.now() - firstDeployAt.getTime()) / 3_600_000).toFixed(1)
  console.log(
    `[Scheduler] First deployment: ${firstDeployAt.toISOString()} (${deployAgeHours} h ago)`
  )

  let syncInProgress = false
  let lastMaintenanceAt = 0
  const MAINTENANCE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000 // weekly

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

      // Weekly DB maintenance — prune star_history older than 90 days
      if (Date.now() - lastMaintenanceAt > MAINTENANCE_INTERVAL_MS) {
        await pruneOldStarHistory(90)
        lastMaintenanceAt = Date.now()
      }
    } catch (err) {
      console.error(`[Scheduler] ${label} sync failed:`, err)
    } finally {
      syncInProgress = false
    }
  }

  // Recursive scheduler — re-evaluates phase after every sync
  function scheduleNext() {
    const { ms, phase } = getNextInterval(firstDeployAt)
    const nextRun = new Date(Date.now() + ms)
    console.log(
      `[Scheduler] Phase ${phase} — next sync in ${(ms / 3_600_000).toFixed(2)} h ` +
      `(${nextRun.toISOString()})`
    )

    setTimeout(async () => {
      await runFullSync('scheduled')
      scheduleNext() // schedule next after current sync completes
    }, ms)
  }

  // Startup sync (unless disabled)
  if (process.env.SYNC_ON_STARTUP !== 'false') {
    setTimeout(() => runFullSync('startup'), 5_000)
  }

  // Kick off the adaptive schedule
  scheduleNext()
}
