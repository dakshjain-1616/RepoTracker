import { NextRequest, NextResponse } from 'next/server'
import { Octokit } from '@octokit/rest'
import { ensureInit, getDb } from '@/lib/db'
import type { IssueWithRepo } from '@/types'

export const dynamic = 'force-dynamic'

// 5-minute in-memory cache per repo
const cache = new Map<string, { issues: IssueWithRepo[]; total: number; expiresAt: number }>()

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const repoParam = searchParams.get('repo')
  const page  = parseInt(searchParams.get('page')  ?? '1',  10)
  const limit = parseInt(searchParams.get('limit') ?? '15', 10)

  if (!repoParam) {
    return NextResponse.json({ error: 'repo param required' }, { status: 400 })
  }

  const [owner, name] = repoParam.split('/')
  if (!owner || !name) {
    return NextResponse.json({ error: 'invalid repo format — expected owner/repo' }, { status: 400 })
  }

  // Check cache
  const cached = cache.get(repoParam)
  if (cached && cached.expiresAt > Date.now()) {
    const start = (page - 1) * limit
    return NextResponse.json({
      issues: cached.issues.slice(start, start + limit),
      total: cached.total,
      page,
      limit,
      live: true,
    })
  }

  try {
    await ensureInit()
    const db = getDb()

    // Look up repo category/stats from DB
    const repoResult = await db.execute({
      sql: `SELECT category, stars, forks, language FROM repos WHERE full_name = @repo`,
      args: { repo: repoParam },
    })
    const repoData = repoResult.rows[0] as unknown as {
      category: string; stars: number; forks: number; language: string | null
    } | undefined

    const isAimlRepo = repoData?.category === 'AI/ML'

    // Fetch live from GitHub
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })
    const seen = new Map<number, IssueWithRepo>()

    for (const label of ['good first issue', 'help wanted']) {
      try {
        const { data } = await octokit.issues.listForRepo({
          owner,
          repo: name,
          state: 'open',
          labels: label,
          per_page: 50,
          sort: 'updated',
          direction: 'desc',
        })
        for (const issue of data) {
          if (issue.pull_request || seen.has(issue.id)) continue
          const labelNames = (issue.labels as Array<{ name?: string }>)
            .map(l => l.name ?? '')
            .filter(Boolean)

          seen.set(issue.id, {
            id: issue.id,
            github_id: issue.id,
            repo_id: -1,
            repo_full_name: repoParam,
            number: issue.number,
            title: issue.title,
            body: issue.body ?? null,
            html_url: issue.html_url,
            state: issue.state,
            labels: labelNames,
            comments: issue.comments,
            created_at: issue.created_at,
            updated_at: issue.updated_at,
            closed_at: issue.closed_at ?? null,
            last_synced: new Date().toISOString(),
            // No LLM enrichment for live issues
            llm_summary: null,
            llm_solvability: null,
            llm_difficulty: null,
            llm_analyzed_at: null,
            // AI/ML flag based on repo category
            is_aiml_issue: isAimlRepo ? 1 : 0,
            aiml_categories: null,
            aiml_classified_at: null,
            // Repo fields
            repo_stars:    repoData?.stars    ?? 0,
            repo_language: repoData?.language ?? null,
            repo_category: repoData?.category ?? 'SWE',
          })
        }
      } catch {
        // skip label if it fails (repo may not use it)
      }
    }

    const allIssues = Array.from(seen.values())
    // Store in cache
    cache.set(repoParam, {
      issues: allIssues,
      total: allIssues.length,
      expiresAt: Date.now() + 5 * 60 * 1000,
    })

    const start = (page - 1) * limit
    return NextResponse.json({
      issues: allIssues.slice(start, start + limit),
      total: allIssues.length,
      page,
      limit,
      live: true,
    })
  } catch (err) {
    console.error('GET /api/issues/live error:', err)
    return NextResponse.json({ error: 'Failed to fetch live issues' }, { status: 500 })
  }
}
