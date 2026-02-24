import { Octokit } from '@octokit/rest'
import { ensureInit, getDb, invalidateQueryCache, getLastSynced } from './db'
import type { IssueWithRepo, IssueStats, AimlCategory, IssueDifficulty } from '../types'

// ---------------------------------------------------------------------------
// In-memory cache for issues queries
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60_000
interface IssuesCacheEntry {
  data: { issues: IssueWithRepo[]; total: number; lastSynced: string | null; stats: IssueStats }
  expiresAt: number
}
const issuesCache = new Map<string, IssuesCacheEntry>()

export function invalidateIssuesCache(): void {
  issuesCache.clear()
}

// ---------------------------------------------------------------------------
// GitHub fetch helpers
// ---------------------------------------------------------------------------

interface GitHubIssue {
  id: number
  number: number
  title: string
  body: string | null
  html_url: string
  state: string
  labels: Array<{ name?: string }>
  comments: number
  created_at: string
  updated_at: string
  closed_at: string | null
  pull_request?: unknown
}

async function fetchIssuesForRepo(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<GitHubIssue[]> {
  const seen = new Map<number, GitHubIssue>()

  for (const label of ['good first issue', 'help wanted']) {
    try {
      const { data } = await octokit.issues.listForRepo({
        owner,
        repo,
        state: 'open',
        labels: label,
        per_page: 30,
        sort: 'updated',
        direction: 'desc',
      })
      for (const issue of data) {
        if (!issue.pull_request) {
          seen.set(issue.id, issue as GitHubIssue)
        }
      }
    } catch (err) {
      const e = err as { status?: number; message?: string }
      console.warn(`[Issues] Failed to fetch label "${label}" for ${owner}/${repo}:`, e.message)
    }
  }

  return Array.from(seen.values())
}

// ---------------------------------------------------------------------------
// LLM enrichment
// ---------------------------------------------------------------------------

interface LLMResult {
  id: number
  summary: string
  solvability: number
  difficulty: IssueDifficulty
}

async function enrichIssuesWithLLM(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return

  // Lazy import to avoid issues when SDK not installed
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey })

  await ensureInit()
  const db = getDb()

  // Fetch issues that haven't been analyzed or have updates since last analysis
  const result = await db.execute(`
    SELECT id, title, body FROM issues
    WHERE llm_analyzed_at IS NULL OR updated_at > llm_analyzed_at
    ORDER BY updated_at DESC
    LIMIT 50
  `)

  const rows = result.rows as unknown as Array<{ id: number; title: string; body: string | null }>
  if (rows.length === 0) return

  console.log(`[Issues] Enriching ${rows.length} issues with LLM...`)

  const BATCH_SIZE = 5
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)

    const issuesText = batch
      .map((issue, idx) => {
        const body = issue.body ? issue.body.slice(0, 500) : ''
        return `Issue ${idx + 1} (id=${issue.id}):\nTitle: ${issue.title}\nBody: ${body}`
      })
      .join('\n\n---\n\n')

    const prompt = `For each GitHub issue below, return a JSON array (no other text) with objects:
{ "id": <number>, "summary": "<1 sentence max 120 chars>", "solvability": <0-10>, "difficulty": "<beginner|intermediate|advanced>" }

Scoring guide:
- beginner (solvability 7-10): docs, small bugs, tests, typos
- intermediate (solvability 4-6): moderate features, refactors, bug fixes needing context
- advanced (solvability 0-3): architectural changes, vague requirements, deep domain knowledge

Issues:
${issuesText}

Return ONLY the JSON array.`

    try {
      const message = await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      })

      const text = message.content[0].type === 'text' ? message.content[0].text : ''
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (!jsonMatch) {
        console.warn('[Issues] LLM returned no JSON array')
        continue
      }

      const results: LLMResult[] = JSON.parse(jsonMatch[0])
      const now = new Date().toISOString()

      for (const res of results) {
        await db.execute({
          sql: `UPDATE issues SET
            llm_summary      = @summary,
            llm_solvability  = @solvability,
            llm_difficulty   = @difficulty,
            llm_analyzed_at  = @analyzed_at
          WHERE id = @id`,
          args: {
            summary:     res.summary,
            solvability: res.solvability,
            difficulty:  res.difficulty,
            analyzed_at: now,
            id:          res.id,
          },
        })
      }
    } catch (err) {
      console.error('[Issues] LLM enrichment batch failed:', err)
      // Non-fatal — continue with next batch
    }

    if (i + BATCH_SIZE < rows.length) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  console.log('[Issues] LLM enrichment complete')
}

// ---------------------------------------------------------------------------
// AIML classification (feature-flagged via NEXT_PUBLIC_ENABLE_NEW_INTEGRATION)
// ---------------------------------------------------------------------------

interface AimlClassificationResult {
  id: number
  is_aiml: boolean
  categories: AimlCategory[]
}

async function classifyAimlIssues(): Promise<void> {
  if (process.env.NEXT_PUBLIC_ENABLE_NEW_INTEGRATION !== 'true') return

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return

  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey })

  await ensureInit()
  const db = getDb()

  // Only classify issues that are new or updated since last classification
  const result = await db.execute(`
    SELECT id, title, body FROM issues
    WHERE state = 'open'
      AND (aiml_classified_at IS NULL OR updated_at > aiml_classified_at)
    ORDER BY updated_at DESC
    LIMIT 100
  `)

  const rows = result.rows as unknown as Array<{ id: number; title: string; body: string | null }>
  if (rows.length === 0) return

  console.log(`[Issues] Classifying ${rows.length} issues for AI/ML relevance...`)

  const BATCH_SIZE = 10
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)

    const issuesText = batch
      .map((issue, idx) => {
        const body = issue.body ? issue.body.slice(0, 300) : ''
        return `Issue ${idx + 1} (id=${issue.id}):\nTitle: ${issue.title}\nBody: ${body}`
      })
      .join('\n\n---\n\n')

    const prompt = `Classify each GitHub issue as AI/ML related or not.
An issue is AI/ML related if it involves: LLM/AI agents, memory systems, context windows, RAG,
model integration/APIs, training/fine-tuning, inference/deployment, vector embeddings, evaluation,
tool use/function calling, or any ML framework work.

Categories (only include matching ones, or empty array if not AI/ML):
"agent_building", "memory_context", "model_integration", "training",
"inference", "embeddings", "evaluation", "tools_plugins"

Return ONLY a JSON array (no other text):
[{ "id": <number>, "is_aiml": <boolean>, "categories": [<strings>] }]

Issues:
${issuesText}

Return ONLY the JSON array.`

    try {
      const message = await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      })

      const text = message.content[0].type === 'text' ? message.content[0].text : ''
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (!jsonMatch) {
        console.warn('[Issues] AIML classification returned no JSON array')
        continue
      }

      const results: AimlClassificationResult[] = JSON.parse(jsonMatch[0])
      const now = new Date().toISOString()

      for (const res of results) {
        await db.execute({
          sql: `UPDATE issues SET
            is_aiml_issue      = @is_aiml,
            aiml_categories    = @categories,
            aiml_classified_at = @classified_at
          WHERE id = @id`,
          args: {
            is_aiml:       res.is_aiml ? 1 : 0,
            categories:    JSON.stringify(res.categories ?? []),
            classified_at: now,
            id:            res.id,
          },
        })
      }
    } catch (err) {
      console.error('[Issues] AIML classification batch failed:', err)
      // Non-fatal — continue
    }

    if (i + BATCH_SIZE < rows.length) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  console.log('[Issues] AIML classification complete')
}

// ---------------------------------------------------------------------------
// Main sync function
// ---------------------------------------------------------------------------

export async function syncIssues(): Promise<number> {
  console.log('[Issues] Starting issue sync...')
  await ensureInit()
  const db = getDb()

  // Get trending repos from last 6 months
  const trendingResult = await db.execute(`
    SELECT id, owner, name, full_name
    FROM repos
    WHERE source = 'discovered'
      AND created_at >= datetime('now', '-6 months')
  `)

  const trendingRepos = trendingResult.rows as unknown as Array<{
    id: number
    owner: string
    name: string
    full_name: string
  }>

  if (trendingRepos.length === 0) {
    console.log('[Issues] No trending repos found, skipping issue sync')
    return 0
  }

  console.log(`[Issues] Syncing issues for ${trendingRepos.length} trending repos...`)
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })
  const now = new Date().toISOString()
  let totalCount = 0

  for (const repo of trendingRepos) {
    const issues = await fetchIssuesForRepo(octokit, repo.owner, repo.name)

    for (const issue of issues) {
      const labels = issue.labels
        .map(l => l.name ?? '')
        .filter(Boolean)

      try {
        await db.execute({
          sql: `INSERT INTO issues (
            github_id, repo_id, repo_full_name, number, title, body,
            html_url, state, labels, comments, created_at, updated_at,
            closed_at, last_synced
          ) VALUES (
            @github_id, @repo_id, @repo_full_name, @number, @title, @body,
            @html_url, @state, @labels, @comments, @created_at, @updated_at,
            @closed_at, @last_synced
          )
          ON CONFLICT(github_id) DO UPDATE SET
            title        = excluded.title,
            body         = excluded.body,
            state        = excluded.state,
            labels       = excluded.labels,
            comments     = excluded.comments,
            updated_at   = excluded.updated_at,
            closed_at    = excluded.closed_at,
            last_synced  = excluded.last_synced`,
          args: {
            github_id:     issue.id,
            repo_id:       repo.id,
            repo_full_name: repo.full_name,
            number:        issue.number,
            title:         issue.title,
            body:          issue.body,
            html_url:      issue.html_url,
            state:         issue.state,
            labels:        JSON.stringify(labels),
            comments:      issue.comments,
            created_at:    issue.created_at,
            updated_at:    issue.updated_at,
            closed_at:     issue.closed_at,
            last_synced:   now,
          },
        })
        totalCount++
      } catch (err) {
        console.error(`[Issues] Failed to upsert issue #${issue.number} for ${repo.full_name}:`, err)
      }
    }

    // Small delay between repos to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 200))
  }

  // LLM enrichment (non-blocking failures)
  try {
    await enrichIssuesWithLLM()
  } catch (err) {
    console.error('[Issues] LLM enrichment failed (non-fatal):', err)
  }

  // AIML classification (feature-flagged, non-blocking)
  try {
    await classifyAimlIssues()
  } catch (err) {
    console.error('[Issues] AIML classification failed (non-fatal):', err)
  }

  invalidateIssuesCache()
  invalidateQueryCache()
  console.log(`[Issues] Sync complete: ${totalCount} issues upserted`)
  return totalCount
}

// ---------------------------------------------------------------------------
// Query function
// ---------------------------------------------------------------------------

export interface GetIssuesOptions {
  difficulty?: string
  label?: string
  q?: string
  sort?: string
  page?: number
  limit?: number
  aiml?: boolean
}

export async function getIssues(
  options: GetIssuesOptions = {}
): Promise<{ issues: IssueWithRepo[]; total: number; lastSynced: string | null; stats: IssueStats }> {
  await ensureInit()

  const {
    difficulty,
    label,
    q = '',
    sort = 'solvability',
    page = 1,
    limit = 24,
    aiml,
  } = options

  const cacheKey = `${difficulty}|${label}|${q}|${sort}|${page}|${limit}|${aiml ?? ''}`
  const cached = issuesCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.data

  const db = getDb()
  const conditions: string[] = ["i.state = 'open'"]
  const args: Record<string, string | number> = {}

  if (difficulty) {
    conditions.push('i.llm_difficulty = @difficulty')
    args.difficulty = difficulty
  }
  if (label) {
    conditions.push('i.labels LIKE @label')
    args.label = `%${label}%`
  }
  if (q) {
    conditions.push('(i.title LIKE @q OR i.llm_summary LIKE @q)')
    args.q = `%${q}%`
  }
  if (aiml) {
    conditions.push('i.is_aiml_issue = 1')
  }

  const where = `WHERE ${conditions.join(' AND ')}`

  const sortMap: Record<string, string> = {
    solvability: 'i.llm_solvability DESC NULLS LAST',
    newest:      'i.created_at DESC',
    comments:    'i.comments DESC',
  }
  const orderBy = sortMap[sort] ?? 'i.llm_solvability DESC NULLS LAST'
  const offset = (page - 1) * limit

  const selectFields = `
    i.*,
    r.stars  AS repo_stars,
    r.language AS repo_language,
    r.category AS repo_category
  `

  const [rowsResult, countResult, statsResult, aimlCountResult, lastSynced] = await Promise.all([
    db.execute({
      sql: `SELECT ${selectFields}
            FROM issues i
            JOIN repos r ON r.id = i.repo_id
            ${where}
            ORDER BY ${orderBy}
            LIMIT @lim OFFSET @off`,
      args: { ...args, lim: limit, off: offset },
    }),
    db.execute({
      sql: `SELECT COUNT(*) as count FROM issues i JOIN repos r ON r.id = i.repo_id ${where}`,
      args,
    }),
    db.execute(`
      SELECT llm_difficulty, COUNT(*) as count
      FROM issues
      WHERE state = 'open'
      GROUP BY llm_difficulty
    `),
    db.execute(`
      SELECT COUNT(*) as count FROM issues WHERE state = 'open' AND is_aiml_issue = 1
    `),
    getLastSynced(),
  ])

  const issues = (rowsResult.rows as unknown as IssueWithRepo[]).map(row => ({
    ...row,
    labels: row.labels ? JSON.parse(row.labels as unknown as string) : [],
    aiml_categories: row.aiml_categories
      ? JSON.parse(row.aiml_categories as unknown as string)
      : null,
  }))
  const total = Number(countResult.rows[0].count)

  const statsRows = statsResult.rows as unknown as Array<{ llm_difficulty: string | null; count: number }>
  const aimlCount = Number((aimlCountResult.rows[0] as unknown as { count: number }).count)
  const stats: IssueStats = { beginner: 0, intermediate: 0, advanced: 0, unanalyzed: 0, aiml: aimlCount }
  for (const row of statsRows) {
    if (row.llm_difficulty === 'beginner')          stats.beginner     = Number(row.count)
    else if (row.llm_difficulty === 'intermediate') stats.intermediate = Number(row.count)
    else if (row.llm_difficulty === 'advanced')     stats.advanced     = Number(row.count)
    else                                            stats.unanalyzed  += Number(row.count)
  }

  const result = { issues, total, lastSynced, stats }
  issuesCache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL_MS })
  return result
}
