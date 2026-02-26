import { Octokit } from '@octokit/rest'
import { ensureInit, getDb, invalidateQueryCache, getLastSynced } from './db'
import type { IssueWithRepo, IssueStats, AimlCategory, IssueDifficulty, NeoApproachStructured } from '../types'

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
// Opportunity type classification (label-based heuristic)
// ---------------------------------------------------------------------------

const BUG_LABELS = new Set([
  'bug', 'crash', 'fix', 'defect', 'regression', 'broken', 'error',
  'type: bug', 'kind: bug', 'bug report',
])

const FEATURE_LABELS = new Set([
  'enhancement', 'feature', 'new feature', 'feature request', 'wish',
  'type: feature', 'kind: feature', 'type: enhancement',
])

function classifyOpportunityType(labels: string[]): 'bug' | 'feature' | 'improvement' {
  const normalized = labels.map(l => l.toLowerCase().trim())
  if (normalized.some(l => BUG_LABELS.has(l))) return 'bug'
  if (normalized.some(l => FEATURE_LABELS.has(l))) return 'feature'
  return 'improvement'
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
  repo: string,
  since?: string
): Promise<GitHubIssue[]> {
  try {
    const { data } = await octokit.issues.listForRepo({
      owner,
      repo,
      state: 'open',
      per_page: 50,
      sort: 'updated',
      direction: 'desc',
      ...(since ? { since } : {}),
    })
    return data.filter(i => !i.pull_request) as GitHubIssue[]
  } catch (err) {
    const e = err as { status?: number; message?: string }
    console.warn(`[Issues] Failed to fetch issues for ${owner}/${repo}:`, e.message)
    return []
  }
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
    LIMIT 200
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
    LIMIT 200
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
// NEO approach generation via OpenRouter (openai/gpt-oss-120b:free)
// ---------------------------------------------------------------------------

interface NeoResult {
  id: number
  neo_approach: string | NeoApproachStructured
}

export async function generateNeoApproaches(): Promise<void> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return

  await ensureInit()
  const db = getDb()

  // Process issues that have never received a NEO approach, or whose issue was
  // updated after the last generation (freshness check)
  const result = await db.execute(`
    SELECT id, title, body FROM issues
    WHERE neo_approach IS NULL
       OR (neo_generated_at IS NOT NULL AND updated_at > neo_generated_at)
    ORDER BY updated_at DESC
    LIMIT 100
  `)

  const rows = result.rows as unknown as Array<{ id: number; title: string; body: string | null }>
  if (rows.length === 0) return

  console.log(`[Issues] Generating NEO approaches for ${rows.length} issues...`)

  const BATCH_SIZE = 5
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)

    const issuesText = batch
      .map((issue, idx) => {
        const body = issue.body ? issue.body.slice(0, 400) : ''
        return `Issue ${idx + 1} (id=${issue.id}):\nTitle: ${issue.title}\nBody: ${body}`
      })
      .join('\n\n---\n\n')

    const prompt = `For each GitHub issue below, describe how NEO — an autonomous AI agent that reads entire codebases, writes and runs code, executes tests, opens PRs, and calls external APIs — would solve it. Be concrete and specific.

Return ONLY a JSON array (no other text):
[{ "id": <number>, "neo_approach": {
  "summary": "<1-2 sentence concrete overview, max 200 chars>",
  "steps": ["Verb phrase step 1...", "Verb phrase step 2...", "Verb phrase step 3..."],
  "effort": "<one of: '< 1 hour' | '2-4 hours' | '< 1 day' | '1-2 days'>",
  "confidence": <integer 1-10: 9-10=well-defined bugs/docs, 7-8=features, 5-6=architectural>
}}]

Issues:
${issuesText}

Return ONLY the JSON array.`

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/repotracker',
          'X-Title': 'RepoTracker',
        },
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b',
          max_tokens: 3000,
          messages: [{ role: 'user', content: prompt }],
        }),
      })

      if (!response.ok) {
        console.warn(`[Issues] OpenRouter NEO batch failed: ${response.status} ${response.statusText}`)
        continue
      }

      const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
      const text = json.choices?.[0]?.message?.content ?? ''
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (!jsonMatch) {
        console.warn('[Issues] OpenRouter returned no JSON array')
        continue
      }

      // Attempt to parse; if truncated JSON, try to salvage complete objects
      let results: NeoResult[]
      try {
        results = JSON.parse(jsonMatch[0])
      } catch {
        // Try to recover complete objects from a truncated array
        const objMatches = jsonMatch[0].matchAll(/\{\s*"id"\s*:\s*(\d+)[\s\S]*?"confidence"\s*:\s*\d+\s*\}\s*\}/g)
        const salvaged: NeoResult[] = []
        for (const m of objMatches) {
          try { salvaged.push(JSON.parse(m[0])) } catch { /* skip malformed */ }
        }
        if (salvaged.length === 0) {
          console.warn('[Issues] NEO batch: could not salvage any results from malformed JSON')
          continue
        }
        results = salvaged
      }
      const now = new Date().toISOString()
      for (const res of results) {
        const neoValue = typeof res.neo_approach === 'string'
          ? res.neo_approach
          : JSON.stringify(res.neo_approach)
        await db.execute({
          sql: `UPDATE issues SET neo_approach = @neo, neo_generated_at = @now WHERE id = @id`,
          args: { neo: neoValue, now, id: res.id },
        })
      }
    } catch (err) {
      console.error('[Issues] NEO approach batch failed:', err)
      // Non-fatal — continue with next batch
    }

    if (i + BATCH_SIZE < rows.length) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  console.log('[Issues] NEO approach generation complete')
}

// ---------------------------------------------------------------------------
// Per-repo opportunity insights (LLM synthesis of top issues per category)
// ---------------------------------------------------------------------------

export async function generateRepoInsights(): Promise<void> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const openrouterKey = process.env.OPENROUTER_API_KEY
  if (!anthropicKey && !openrouterKey) return

  await ensureInit()
  const db = getDb()

  // Only generate insights for the top 20 trending (discovered) repos by stars
  const reposResult = await db.execute(`
    SELECT DISTINCT r.id, r.full_name, r.name
    FROM repos r
    JOIN issues i ON i.repo_id = r.id
    WHERE r.source = 'discovered'
      AND r.id IN (
        SELECT id FROM repos WHERE source = 'discovered'
        ORDER BY stars DESC LIMIT 5
      )
      AND (
        r.opportunity_insights IS NULL
        OR json_type(r.opportunity_insights, '$.bugs') = 'text'
        OR (r.issues_last_synced_at IS NOT NULL
            AND r.insights_generated_at IS NOT NULL
            AND r.issues_last_synced_at > r.insights_generated_at)
      )
    LIMIT 8
  `)

  const repos = reposResult.rows as unknown as Array<{ id: number; full_name: string; name: string }>
  if (repos.length === 0) return

  console.log(`[Issues] Generating opportunity insights for ${repos.length} repos...`)

  // Helper: call LLM via whichever provider is available
  async function callLLM(prompt: string): Promise<string> {
    if (anthropicKey) {
      const Anthropic = (await import('@anthropic-ai/sdk')).default
      const client = new Anthropic({ apiKey: anthropicKey })
      const message = await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      })
      return message.content[0].type === 'text' ? message.content[0].text : ''
    } else {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openrouterKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/repotracker',
          'X-Title': 'RepoTracker',
        },
        body: JSON.stringify({
          model: 'anthropic/claude-haiku-4-5',
          max_tokens: 2048,
          messages: [
            { role: 'system', content: 'You are a helpful assistant. Respond only with valid JSON.' },
            { role: 'user', content: prompt },
          ],
        }),
      })
      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`OpenRouter ${response.status}: ${errText.slice(0, 200)}`)
      }
      const json = await response.json() as {
        choices?: Array<{ message?: { content?: string }; finish_reason?: string }>
        error?: { message?: string }
      }
      if (json.error) throw new Error(`OpenRouter error: ${json.error.message}`)
      const content = json.choices?.[0]?.message?.content ?? ''
      if (!content) console.warn(`[Issues] OpenRouter returned empty content, finish_reason=${json.choices?.[0]?.finish_reason}, response:`, JSON.stringify(json).slice(0, 600))
      return content
    }
  }

  for (const repo of repos) {
    try {
      // Fetch top issues per category by comment count
      const [bugsRes, featuresRes, improvementsRes] = await Promise.all([
        db.execute({
          sql: `SELECT title, comments, llm_summary FROM issues
                WHERE repo_id = @repo_id AND opportunity_type = 'bug'
                ORDER BY comments DESC LIMIT 6`,
          args: { repo_id: repo.id },
        }),
        db.execute({
          sql: `SELECT title, comments, llm_summary FROM issues
                WHERE repo_id = @repo_id AND opportunity_type = 'feature'
                ORDER BY comments DESC LIMIT 6`,
          args: { repo_id: repo.id },
        }),
        db.execute({
          sql: `SELECT title, comments, llm_summary FROM issues
                WHERE repo_id = @repo_id AND opportunity_type = 'improvement'
                ORDER BY comments DESC LIMIT 5`,
          args: { repo_id: repo.id },
        }),
      ])

      type IssueRow = { title: string; comments: number; llm_summary: string | null }
      const bugs = bugsRes.rows as unknown as IssueRow[]
      const features = featuresRes.rows as unknown as IssueRow[]
      const improvements = improvementsRes.rows as unknown as IssueRow[]

      if (bugs.length === 0 && features.length === 0 && improvements.length === 0) continue

      const formatList = (items: IssueRow[]) =>
        items.map(i => `- "${i.title}" (${i.comments} comments)${i.llm_summary ? ` — ${i.llm_summary}` : ''}`).join('\n')

      const prompt = `Analyze GitHub issues for "${repo.full_name}" and group them into synthesized themes. Each theme clusters related issues sharing a common root cause, request, or pattern.

Top bugs (by comment count):
${bugs.length > 0 ? formatList(bugs) : '(none)'}

Top feature requests:
${features.length > 0 ? formatList(features) : '(none)'}

Top improvements:
${improvements.length > 0 ? formatList(improvements) : '(none)'}

Return a JSON object with exactly this structure:
{
  "bugs": [{"title": "Specific 4-8 word theme", "description": "2-3 sentences about what users experience and why it matters.", "issue_count": 2, "total_comments": 45, "urgency": "high", "suggested_approach": "One sentence on best way to address this."}],
  "features": [{"title": "Specific 4-8 word theme", "description": "2-3 sentences about what users want and the use case.", "issue_count": 3, "total_comments": 67, "urgency": "medium", "suggested_approach": "One sentence on best way to address this."}],
  "improvements": [{"title": "Specific 4-8 word theme", "description": "2-3 sentences about the pain point and benefit.", "issue_count": 1, "total_comments": 12, "urgency": "low", "suggested_approach": "One sentence on best way to address this."}]
}

Rules:
- 2-4 themes per category maximum
- Use null (not empty array) if a category has no issues
- issue_count = number of listed issues this theme covers (integer)
- total_comments = sum of comments for those issues (integer)
- Titles must be specific, not generic (avoid "Bug Fixes" or "Performance Issues")
- urgency: "high"=crashes/data loss/blockers with many comments, "medium"=usability/popular requests, "low"=nice-to-haves/minor polish
- suggested_approach: one concrete sentence on the best technical approach to address this theme`

      const text = await callLLM(prompt)

      // Robust JSON extraction: handle markdown fences, leading/trailing text
      let insights: unknown = null
      // 1. Try stripping markdown code fences first
      const stripped = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
      // 2. Find the outermost JSON object via first { … last }
      const firstBrace = stripped.indexOf('{')
      const lastBrace  = stripped.lastIndexOf('}')
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        try {
          insights = JSON.parse(stripped.slice(firstBrace, lastBrace + 1))
        } catch {
          console.warn(`[Issues] Insights JSON parse failed for ${repo.full_name}, raw (200 chars):`, stripped.slice(0, 200))
          continue
        }
      } else {
        console.warn(`[Issues] Insights LLM returned no JSON object for ${repo.full_name}, raw (200 chars):`, text.slice(0, 200))
        continue
      }
      await db.execute({
        sql: `UPDATE repos SET
          opportunity_insights    = @insights,
          insights_generated_at   = @now
          WHERE id = @id`,
        args: {
          insights: JSON.stringify(insights),
          now:      new Date().toISOString(),
          id:       repo.id,
        },
      })

      console.log(`[Issues] Insights generated for ${repo.full_name}`)
    } catch (err) {
      console.error(`[Issues] Insights failed for ${repo.full_name}:`, err)
      // Non-fatal — continue with next repo
    }

    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  console.log('[Issues] Repo insights generation complete')
}

// ---------------------------------------------------------------------------
// Main sync function
// ---------------------------------------------------------------------------

export async function syncIssues(batchSize = 25): Promise<number> {
  console.log('[Issues] Starting issue sync...')
  await ensureInit()
  const db = getDb()

  // Pick the next batch of repos to sync, prioritized by:
  //   1. Never-synced issues first
  //   2. Trending (discovered) before static
  //   3. Stalest sync time first
  // Repos synced within the last 12 hours are skipped.
  const reposResult = await db.execute({
    sql: `
      SELECT id, owner, name, full_name, source, issues_last_synced_at
      FROM repos
      WHERE issues_last_synced_at IS NULL
         OR issues_last_synced_at < datetime('now', '-12 hours')
      ORDER BY
        CASE WHEN issues_last_synced_at IS NULL THEN 0 ELSE 1 END ASC,
        CASE WHEN source = 'discovered' THEN 0 ELSE 1 END ASC,
        issues_last_synced_at ASC
      LIMIT @batchSize
    `,
    args: { batchSize },
  })

  const repos = reposResult.rows as unknown as Array<{
    id: number
    owner: string
    name: string
    full_name: string
    source: string
    issues_last_synced_at: string | null
  }>

  if (repos.length === 0) {
    console.log('[Issues] All repos recently synced, skipping issue sync')
    return 0
  }

  const trendingCount = repos.filter(r => r.source === 'discovered').length
  const staticCount = repos.length - trendingCount
  console.log(`[Issues] Syncing issues for ${repos.length} repos (${trendingCount} trending, ${staticCount} static)...`)

  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })
  const now = new Date().toISOString()
  let totalCount = 0

  for (const repo of repos) {
    // Delta sync: pass the last-synced timestamp (minus 60s buffer) as 'since'
    // so GitHub only returns issues updated after that point
    const sinceTs = repo.issues_last_synced_at
      ? new Date(new Date(repo.issues_last_synced_at).getTime() - 60_000).toISOString()
      : undefined

    const issues = await fetchIssuesForRepo(octokit, repo.owner, repo.name, sinceTs)

    for (const issue of issues) {
      const labels = issue.labels
        .map(l => l.name ?? '')
        .filter(Boolean)

      const opportunityType = classifyOpportunityType(labels)

      try {
        await db.execute({
          sql: `INSERT INTO issues (
            github_id, repo_id, repo_full_name, number, title, body,
            html_url, state, labels, comments, created_at, updated_at,
            closed_at, last_synced, opportunity_type
          ) VALUES (
            @github_id, @repo_id, @repo_full_name, @number, @title, @body,
            @html_url, @state, @labels, @comments, @created_at, @updated_at,
            @closed_at, @last_synced, @opportunity_type
          )
          ON CONFLICT(github_id) DO UPDATE SET
            title            = excluded.title,
            body             = excluded.body,
            state            = excluded.state,
            labels           = excluded.labels,
            comments         = excluded.comments,
            updated_at       = excluded.updated_at,
            closed_at        = excluded.closed_at,
            last_synced      = excluded.last_synced,
            opportunity_type = excluded.opportunity_type`,
          args: {
            github_id:        issue.id,
            repo_id:          repo.id,
            repo_full_name:   repo.full_name,
            number:           issue.number,
            title:            issue.title,
            body:             issue.body,
            html_url:         issue.html_url,
            state:            issue.state,
            labels:           JSON.stringify(labels),
            comments:         issue.comments,
            created_at:       issue.created_at,
            updated_at:       issue.updated_at,
            closed_at:        issue.closed_at,
            last_synced:      now,
            opportunity_type: opportunityType,
          },
        })
        totalCount++
      } catch (err) {
        console.error(`[Issues] Failed to upsert issue #${issue.number} for ${repo.full_name}:`, err)
      }
    }

    // Stale closure: on a full fetch (no since filter) where we got all issues,
    // any DB open issue for this repo that wasn't in the fetch is now closed on GitHub
    if (!sinceTs && issues.length < 50) {
      await db.execute({
        sql: `UPDATE issues SET state = 'closed', closed_at = @now
              WHERE repo_id = @repo_id AND state = 'open' AND last_synced < @now`,
        args: { repo_id: repo.id, now },
      })
    }

    // Update watermark to the most recent issue's updated_at (not wall-clock 'now'),
    // so the next sync's 'since' param is accurate
    const watermark = issues.reduce<string | null>((latest, i) =>
      !latest || i.updated_at > latest ? i.updated_at : latest, null)
    await db.execute({
      sql: `UPDATE repos SET issues_last_synced_at = @ts WHERE id = @id`,
      args: { ts: watermark ?? now, id: repo.id },
    })

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
  repo?: string   // filter by repo_full_name
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
    repo,
  } = options

  const cacheKey = `${difficulty}|${label}|${q}|${sort}|${page}|${limit}|${aiml ?? ''}|${repo ?? ''}`
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
  if (repo) {
    conditions.push('i.repo_full_name = @repo')
    args.repo = repo
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

// ---------------------------------------------------------------------------
// Featured issues — highest-value opportunities for the hero section
// ---------------------------------------------------------------------------

export async function getFeaturedIssues(limit = 5): Promise<IssueWithRepo[]> {
  await ensureInit()
  const db = getDb()

  const result = await db.execute({
    sql: `
      SELECT i.*, r.stars AS repo_stars, r.language AS repo_language, r.category AS repo_category
      FROM issues i JOIN repos r ON r.id = i.repo_id
      WHERE i.state = 'open'
        AND i.neo_approach IS NOT NULL
      ORDER BY
        CASE WHEN i.is_aiml_issue = 1 THEN 0 ELSE 1 END ASC,
        CASE WHEN i.llm_solvability >= 6.0 THEN 0 ELSE 1 END ASC,
        COALESCE(i.llm_solvability, 0) DESC,
        i.comments DESC
      LIMIT @limit
    `,
    args: { limit },
  })

  return (result.rows as unknown as IssueWithRepo[]).map(row => ({
    ...row,
    labels: row.labels ? JSON.parse(row.labels as unknown as string) : [],
    aiml_categories: row.aiml_categories
      ? JSON.parse(row.aiml_categories as unknown as string)
      : null,
  }))
}
