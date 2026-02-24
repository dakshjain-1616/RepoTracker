import { getRepos, getLastSynced } from '@/lib/db'
import { LeaderboardTable } from '@/components/LeaderboardTable'
import { Github } from 'lucide-react'
import type { ApiResponse } from '@/types'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function Home() {
  let initialData: ApiResponse

  try {
    const [{ repos, total }, lastSynced] = await Promise.all([
      getRepos({ page: 1, limit: 25 }),
      getLastSynced(),
    ])
    initialData = { repos, total, lastSynced, page: 1, limit: 25 }
  } catch {
    initialData = { repos: [], total: 0, lastSynced: null, page: 1, limit: 25 }
  }

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
                <Github className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight">RepoTracker</h1>
                <p className="text-xs text-muted-foreground hidden sm:block">
                  AI/ML & SWE GitHub Leaderboard
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="hidden sm:inline">Top 100 repos · Updated every 12h</span>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted/50 transition-colors"
              >
                GitHub
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        {initialData.total === 0 && initialData.repos.length === 0 ? (
          <div className="rounded-xl border border-border bg-card/30 p-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted/50">
              <Github className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Syncing repositories...</h2>
            <p className="text-muted-foreground mb-6">
              The initial sync is running in the background. This may take a minute.
            </p>
            <p className="text-sm text-muted-foreground">
              Make sure <code className="bg-muted px-1 py-0.5 rounded text-xs">GITHUB_TOKEN</code> is set.
            </p>
          </div>
        ) : (
          <LeaderboardTable initialData={initialData} />
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-border mt-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-xs text-muted-foreground">
            RepoTracker — Tracking top GitHub repos across AI/ML and Software Engineering.
            Data sourced from GitHub API.
          </p>
        </div>
      </footer>
    </main>
  )
}
