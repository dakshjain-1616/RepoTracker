import { getRepos, getLastSynced } from '@/lib/db'
import { LeaderboardTable } from '@/components/LeaderboardTable'
import { Github, BookOpen, Sparkles, Bot, TrendingUp } from 'lucide-react'
import Link from 'next/link'
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
              <span className="hidden sm:inline">Top 100 repos · Click Sync to refresh</span>
              <Link
                href="/issues"
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 hover:bg-muted/50 transition-colors"
              >
                <BookOpen className="h-3.5 w-3.5" />
                Issues Ledger
              </Link>
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
        {/* Feature strip — tells first-time users what this app can do */}
        <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 px-4 py-3 flex items-start gap-3">
            <Sparkles className="h-4 w-4 text-purple-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-foreground">✦ Innovation Intel</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                AI scans open issues in trending repos and groups them into bug themes, feature patterns, and improvement opportunities.
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 flex items-start gap-3">
            <Bot className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-foreground">NEO Build Plans</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Every issue gets an AI-generated step-by-step plan — concrete actions, time estimate, and confidence score — so you can start building immediately.
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 flex items-start gap-3">
            <TrendingUp className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-foreground">Live Trending</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Discovers viral GitHub repos before they hit mainstream. Scored by star velocity — find the next hot project early.
              </p>
            </div>
          </div>
        </div>
        <LeaderboardTable initialData={initialData} />
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
