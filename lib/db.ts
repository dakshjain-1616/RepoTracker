import { createClient, type Client } from '@libsql/client'
import path from 'path'
import type { Repo, StarHistory } from '../types'

// ---------------------------------------------------------------------------
// Client singleton
// ---------------------------------------------------------------------------

let _db: Client | null = null

export function getDb(): Client {
  if (!_db) {
    const url =
      process.env.TURSO_DATABASE_URL ??
      `file:${path.join(process.cwd(), 'data', 'repos.db')}`
    _db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  }
  return _db
}

// ---------------------------------------------------------------------------
// Schema init (idempotent — runs once per container lifetime)
// ---------------------------------------------------------------------------

let _initialized = false

export async function ensureInit(): Promise<void> {
  if (_initialized) return
  const db = getDb()

  await db.batch(
    [
      {
        sql: `CREATE TABLE IF NOT EXISTS repos (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          full_name   TEXT UNIQUE NOT NULL,
          owner       TEXT NOT NULL,
          name        TEXT NOT NULL,
          description TEXT,
          category    TEXT NOT NULL,
          language    TEXT,
          topics      TEXT,
          homepage    TEXT,
          stars       INTEGER DEFAULT 0,
          forks       INTEGER DEFAULT 0,
          open_issues INTEGER DEFAULT 0,
          watchers    INTEGER DEFAULT 0,
          rank        INTEGER,
          created_at  TEXT,
          pushed_at   TEXT,
          last_synced TEXT,
          source      TEXT DEFAULT 'static'
        )`,
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS star_history (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          repo_id     INTEGER NOT NULL REFERENCES repos(id),
          stars       INTEGER NOT NULL,
          forks       INTEGER NOT NULL,
          recorded_at TEXT NOT NULL
        )`,
      },
      { sql: `CREATE INDEX IF NOT EXISTS idx_sh_repo ON star_history(repo_id)` },
      { sql: `CREATE INDEX IF NOT EXISTS idx_sh_ts ON star_history(recorded_at)` },
      { sql: `CREATE INDEX IF NOT EXISTS idx_repos_stars ON repos(stars)` },
      { sql: `CREATE INDEX IF NOT EXISTS idx_repos_cat ON repos(category)` },
      {
        sql: `CREATE TABLE IF NOT EXISTS issues (
          id               INTEGER PRIMARY KEY AUTOINCREMENT,
          github_id        INTEGER UNIQUE NOT NULL,
          repo_id          INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
          repo_full_name   TEXT NOT NULL,
          number           INTEGER NOT NULL,
          title            TEXT NOT NULL,
          body             TEXT,
          html_url         TEXT NOT NULL,
          state            TEXT NOT NULL DEFAULT 'open',
          labels           TEXT NOT NULL DEFAULT '[]',
          comments         INTEGER NOT NULL DEFAULT 0,
          created_at       TEXT NOT NULL,
          updated_at       TEXT NOT NULL,
          closed_at        TEXT,
          llm_summary      TEXT,
          llm_solvability  REAL,
          llm_difficulty   TEXT,
          llm_analyzed_at  TEXT,
          last_synced      TEXT NOT NULL
        )`,
      },
      { sql: `CREATE INDEX IF NOT EXISTS idx_issues_repo_id     ON issues(repo_id)` },
      { sql: `CREATE INDEX IF NOT EXISTS idx_issues_github_id   ON issues(github_id)` },
      { sql: `CREATE INDEX IF NOT EXISTS idx_issues_solvability ON issues(llm_solvability)` },
      { sql: `CREATE INDEX IF NOT EXISTS idx_issues_updated_at  ON issues(updated_at)` },
    ],
    'write'
  )

  // Migrate existing DBs that predate the source column
  try {
    await db.execute(`ALTER TABLE repos ADD COLUMN source TEXT DEFAULT 'static'`)
  } catch {
    // Column already exists — ignore
  }

  // Migrate: AIML classification columns
  try {
    await db.execute(`ALTER TABLE issues ADD COLUMN is_aiml_issue INTEGER DEFAULT NULL`)
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_issues_aiml ON issues(is_aiml_issue)`)
  } catch {
    // Column already exists — ignore
  }
  try {
    await db.execute(`ALTER TABLE issues ADD COLUMN aiml_categories TEXT DEFAULT NULL`)
  } catch {
    // Column already exists — ignore
  }
  try {
    await db.execute(`ALTER TABLE issues ADD COLUMN aiml_classified_at TEXT DEFAULT NULL`)
  } catch {
    // Column already exists — ignore
  }

  // Migrate: per-repo issues sync tracking
  try {
    await db.execute(`ALTER TABLE repos ADD COLUMN issues_last_synced_at TEXT DEFAULT NULL`)
  } catch {
    // Column already exists — ignore
  }

  // Migrate: NEO approach column
  try {
    await db.execute(`ALTER TABLE issues ADD COLUMN neo_approach TEXT DEFAULT NULL`)
  } catch {
    // Column already exists — ignore
  }

  // Migrate: opportunity type classification column
  try {
    await db.execute(`ALTER TABLE issues ADD COLUMN opportunity_type TEXT DEFAULT NULL`)
  } catch {
    // Column already exists — ignore
  }

  // Migrate: per-repo LLM opportunity insights
  try {
    await db.execute(`ALTER TABLE repos ADD COLUMN opportunity_insights TEXT DEFAULT NULL`)
  } catch {
    // Column already exists — ignore
  }
  try {
    await db.execute(`ALTER TABLE repos ADD COLUMN insights_generated_at TEXT DEFAULT NULL`)
  } catch {
    // Column already exists — ignore
  }

  // Migrate: NEO approach freshness tracking
  try {
    await db.execute(`ALTER TABLE issues ADD COLUMN neo_generated_at TEXT DEFAULT NULL`)
  } catch {
    // Column already exists — ignore
  }

  // Migrate: content hash columns for LLM dedup
  try { await db.execute(`ALTER TABLE issues ADD COLUMN content_hash TEXT DEFAULT NULL`) } catch {}
  try { await db.execute(`ALTER TABLE issues ADD COLUMN llm_content_hash TEXT DEFAULT NULL`) } catch {}
  try { await db.execute(`ALTER TABLE issues ADD COLUMN aiml_content_hash TEXT DEFAULT NULL`) } catch {}
  try { await db.execute(`ALTER TABLE issues ADD COLUMN neo_content_hash TEXT DEFAULT NULL`) } catch {}

  _initialized = true
}

// ---------------------------------------------------------------------------
// In-memory query cache (60 s TTL, invalidated after every sync)
// ---------------------------------------------------------------------------

const QUERY_CACHE_TTL_MS = 60_000
interface CacheEntry {
  data: { repos: RepoWithGrowth[]; total: number }
  expiresAt: number
}
const queryCache = new Map<string, CacheEntry>()

export function invalidateQueryCache(): void {
  queryCache.clear()
}

// ---------------------------------------------------------------------------
// Upsert repo
// ---------------------------------------------------------------------------

export interface UpsertRepoData {
  full_name: string
  owner: string
  name: string
  description: string | null
  category: string
  language: string | null
  topics: string[]
  homepage: string | null
  stars: number
  forks: number
  open_issues: number
  watchers: number
  created_at: string | null
  pushed_at: string | null
  source?: 'static' | 'discovered'
}

export async function upsertRepo(data: UpsertRepoData): Promise<number> {
  await ensureInit()
  const db = getDb()
  const now = new Date().toISOString()

  const result = await db.execute({
    sql: `
      INSERT INTO repos (
        full_name, owner, name, description, category, language, topics,
        homepage, stars, forks, open_issues, watchers, created_at, pushed_at,
        last_synced, source
      ) VALUES (
        @full_name, @owner, @name, @description, @category, @language, @topics,
        @homepage, @stars, @forks, @open_issues, @watchers, @created_at, @pushed_at,
        @last_synced, @source
      )
      ON CONFLICT(full_name) DO UPDATE SET
        description = excluded.description,
        language    = excluded.language,
        topics      = excluded.topics,
        homepage    = excluded.homepage,
        stars       = excluded.stars,
        forks       = excluded.forks,
        open_issues = excluded.open_issues,
        watchers    = excluded.watchers,
        pushed_at   = excluded.pushed_at,
        last_synced = excluded.last_synced
      RETURNING id
    `,
    args: {
      full_name:   data.full_name,
      owner:       data.owner,
      name:        data.name,
      description: data.description,
      category:    data.category,
      language:    data.language,
      topics:      JSON.stringify(data.topics),
      homepage:    data.homepage,
      stars:       data.stars,
      forks:       data.forks,
      open_issues: data.open_issues,
      watchers:    data.watchers,
      created_at:  data.created_at,
      pushed_at:   data.pushed_at,
      last_synced: now,
      source:      data.source ?? 'static',
    },
  })

  return Number(result.rows[0].id)
}

// ---------------------------------------------------------------------------
// Insert star history
// ---------------------------------------------------------------------------

export async function insertStarHistory(
  repoId: number,
  stars: number,
  forks: number
): Promise<void> {
  await ensureInit()
  const db = getDb()

  // Deduplication: skip insert if stars+forks unchanged and last snapshot < 6 hours old
  const last = await db.execute({
    sql: `SELECT stars, forks, recorded_at FROM star_history
          WHERE repo_id = @repo_id ORDER BY recorded_at DESC LIMIT 1`,
    args: { repo_id: repoId },
  })
  const prev = last.rows[0] as unknown as
    | { stars: number; forks: number; recorded_at: string }
    | undefined
  const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000
  if (
    prev &&
    Number(prev.stars) === stars &&
    Number(prev.forks) === forks &&
    new Date(prev.recorded_at).getTime() > sixHoursAgo
  ) return

  await db.execute({
    sql: `INSERT INTO star_history (repo_id, stars, forks, recorded_at)
          VALUES (@repo_id, @stars, @forks, @recorded_at)`,
    args: { repo_id: repoId, stars, forks, recorded_at: new Date().toISOString() },
  })
}

// ---------------------------------------------------------------------------
// Update ranks
// ---------------------------------------------------------------------------

export async function updateRanks(): Promise<void> {
  await ensureInit()
  const db = getDb()
  // SQLite window functions — supported since 3.25 (2018)
  await db.execute(`
    UPDATE repos SET rank = (
      SELECT COUNT(*) + 1 FROM repos r2 WHERE r2.stars > repos.stars
    )
  `)
}

// ---------------------------------------------------------------------------
// Get repos (with growth, cache, filtering)
// ---------------------------------------------------------------------------

export interface GetReposOptions {
  category?: string
  sort?: string
  q?: string
  page?: number
  limit?: number
}

export interface RepoWithGrowth extends Repo {
  growth24h: number | null
  growth7d: number | null
}

export async function getRepos(
  options: GetReposOptions = {}
): Promise<{ repos: RepoWithGrowth[]; total: number }> {
  await ensureInit()
  const { category = 'all', sort = 'stars', q = '', page = 1, limit = 25 } = options

  const cacheKey = `${category}|${sort}|${q}|${page}|${limit}`
  const cached = queryCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.data

  const db = getDb()
  const isTrending   = category === 'trending'

  const innerConditions: string[] = []
  const args: Record<string, string | number> = {}

  if (isTrending) {
    innerConditions.push("r.source = 'discovered'")
    innerConditions.push("r.created_at >= datetime('now', '-6 months')")
  } else if (category && category !== 'all') {
    innerConditions.push('r.category = @category')
    args.category = category
  }
  if (q) {
    innerConditions.push('(r.full_name LIKE @q OR r.description LIKE @q)')
    args.q = `%${q}%`
  }

  const innerWhere =
    innerConditions.length > 0 ? `WHERE ${innerConditions.join(' AND ')}` : ''

  const sortMap: Record<string, string> = {
    stars:      'stars DESC',
    forks:      'forks DESC',
    growth24h:  'growth24h DESC NULLS LAST',
    growth7d:   'growth7d DESC NULLS LAST',
  }
  const orderBy = sortMap[sort] ?? 'stars DESC'
  const offset = (page - 1) * limit

  // Wrap CTE in subquery so the outer ORDER BY can reference computed aliases
  const cteQuery = `
    WITH latest_history AS (
      SELECT repo_id, MAX(recorded_at) as max_ts
      FROM star_history GROUP BY repo_id
    ),
    latest_stars AS (
      SELECT sh.repo_id, sh.stars as current_stars
      FROM star_history sh
      INNER JOIN latest_history lh
        ON sh.repo_id = lh.repo_id AND sh.recorded_at = lh.max_ts
    ),
    history_24h AS (
      SELECT repo_id, MIN(stars) as stars_at_start
      FROM star_history
      WHERE recorded_at >= datetime('now', '-1 day')
      GROUP BY repo_id
    ),
    history_7d AS (
      SELECT repo_id, MIN(stars) as stars_at_start
      FROM star_history
      WHERE recorded_at >= datetime('now', '-7 days')
      GROUP BY repo_id
    )
    SELECT
      r.*,
      (ls.current_stars - h24.stars_at_start) AS growth24h,
      (ls.current_stars - h7.stars_at_start)  AS growth7d
    FROM repos r
    LEFT JOIN latest_stars ls  ON ls.repo_id  = r.id
    LEFT JOIN history_24h  h24 ON h24.repo_id = r.id
    LEFT JOIN history_7d   h7  ON h7.repo_id  = r.id
    ${innerWhere}
  `

  const [rowsResult, countResult] = await Promise.all([
    db.execute({
      sql: `SELECT * FROM (${cteQuery}) ORDER BY ${orderBy} LIMIT @lim OFFSET @off`,
      args: { ...args, lim: limit, off: offset },
    }),
    db.execute({
      sql: `SELECT COUNT(*) as count FROM (${cteQuery})`,
      args,
    }),
  ])

  const repos = (rowsResult.rows as unknown as RepoWithGrowth[]).map(r => ({
    ...r,
    topics: r.topics ? JSON.parse(r.topics as unknown as string) : [],
    opportunity_insights: r.opportunity_insights
      ? JSON.parse(r.opportunity_insights as unknown as string)
      : null,
  }))
  const total = Number(countResult.rows[0].count)

  const result = { repos, total }
  queryCache.set(cacheKey, { data: result, expiresAt: Date.now() + QUERY_CACHE_TTL_MS })
  return result
}

// ---------------------------------------------------------------------------
// Misc queries
// ---------------------------------------------------------------------------

export async function getLastSynced(): Promise<string | null> {
  await ensureInit()
  const db = getDb()
  const result = await db.execute(`SELECT MAX(last_synced) as last_synced FROM repos`)
  return (result.rows[0]?.last_synced as string) ?? null
}

export async function getRepoLastSynced(): Promise<Record<string, string>> {
  await ensureInit()
  const db = getDb()
  const result = await db.execute(
    `SELECT full_name, last_synced FROM repos WHERE last_synced IS NOT NULL`
  )
  return Object.fromEntries(
    result.rows.map(r => [r.full_name as string, r.last_synced as string])
  )
}

export async function getStarHistory(
  owner: string,
  repo: string
): Promise<{ history: StarHistory[]; repoData: Repo | null }> {
  await ensureInit()
  const db = getDb()
  const fullName = `${owner}/${repo}`

  const repoResult = await db.execute({
    sql: `SELECT * FROM repos WHERE full_name = ?`,
    args: [fullName],
  })

  if (!repoResult.rows.length) return { history: [], repoData: null }

  const repoData = repoResult.rows[0] as unknown as Repo
  if (repoData.topics) {
    repoData.topics = JSON.parse(repoData.topics as unknown as string)
  }

  const historyResult = await db.execute({
    sql: `SELECT * FROM star_history WHERE repo_id = ? ORDER BY recorded_at ASC LIMIT 90`,
    args: [repoData.id],
  })

  return {
    history: historyResult.rows as unknown as StarHistory[],
    repoData,
  }
}
