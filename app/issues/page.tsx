import { getIssues, getFeaturedIssues } from '@/lib/issues'
import { IssuesLedger } from '@/components/IssuesLedger'
import { Github, BookOpen } from 'lucide-react'
import Link from 'next/link'
import type { IssuesApiResponse, IssueWithRepo } from '@/types'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function IssuesPage() {
  let initialData: IssuesApiResponse
  let featured: IssueWithRepo[] = []

  try {
    const [{ issues, total, lastSynced, stats }, featuredIssues] = await Promise.all([
      getIssues({ page: 1, limit: 24 }),
      getFeaturedIssues(5).catch(() => []),
    ])
    initialData = { issues, total, page: 1, limit: 24, lastSynced, stats }
    featured = featuredIssues
  } catch {
    initialData = { issues: [], total: 0, page: 1, limit: 24 }
  }

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
                  <Github className="h-5 w-5 text-white" />
                </div>
                <span className="text-lg font-bold tracking-tight">RepoTracker</span>
              </Link>
              <span className="text-muted-foreground">/</span>
              <div className="flex items-center gap-1.5">
                <BookOpen className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Issues Ledger</span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Link
                href="/"
                className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted/50 transition-colors"
              >
                Leaderboard
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold tracking-tight">Issues Ledger</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Curated open issues from trending repos — filtered for{' '}
            <span className="font-medium text-foreground">good first issue</span> and{' '}
            <span className="font-medium text-foreground">help wanted</span> labels.
          </p>
        </div>
        <IssuesLedger initialData={initialData} featured={featured} />
      </div>

      {/* Footer */}
      <footer className="border-t border-border mt-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-xs text-muted-foreground">
            RepoTracker — Issues sourced from GitHub API · LLM enrichment by Claude Haiku
          </p>
        </div>
      </footer>
    </main>
  )
}
