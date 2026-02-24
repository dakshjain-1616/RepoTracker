# RepoTracker — Project Guide

## Purpose

A GitHub leaderboard tracking the top 100 AI/ML and SWE repositories by star count, trending discovery, and per-repo issue browsing with optional AI/ML classification and "Solve with New" integration.

---

## Architecture

```
Next.js 16 App Router (TypeScript)
  ├── app/                  — Server Components + API routes
  ├── components/           — Client components
  ├── lib/                  — Server-only logic (DB, GitHub, sync)
  └── types/index.ts        — Shared TypeScript interfaces
```

Database: **Turso (libSQL)** — `@libsql/client` with named args (`@param` syntax).
Local dev uses a file-based SQLite: `file:./data/repos.db`.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GITHUB_TOKEN` | **Yes** | GitHub Personal Access Token (for API rate limits) |
| `TURSO_DATABASE_URL` | Optional | Turso DB URL (e.g. `libsql://...turso.io`). Falls back to local SQLite file |
| `TURSO_AUTH_TOKEN` | Optional | Required when `TURSO_DATABASE_URL` is set |
| `ANTHROPIC_API_KEY` | Optional | Enables LLM enrichment of issues (difficulty, solvability, summary) and AIML classification |
| `NEXT_PUBLIC_ENABLE_NEW_INTEGRATION` | Optional | Set to `true` to enable AIML classification + "Solve with New" UI |
| `NEXT_PUBLIC_NEW_TOOL_URL` | Optional | Base URL for the "New" tool — appended with `?issue=<url>&title=<title>` |

Without `ANTHROPIC_API_KEY`, issues still display but without difficulty badges, solvability scores, or summaries.
Without `NEXT_PUBLIC_ENABLE_NEW_INTEGRATION=true`, the AI/ML badge, classification job, and "Solve with New" button are hidden.

---

## Key Commands

```bash
npm run dev      # Start Next.js dev server (http://localhost:3000)
npm run build    # Type-check + production build
npm run start    # Start production server
```

---

## Database Schema

### `repos`
Stores tracked repositories (static list + discovered trending).
Key columns: `full_name`, `stars`, `category` (`AI/ML` | `SWE`), `source` (`static` | `discovered`), `created_at`.

### `star_history`
Time-series star/fork snapshots per repo. Used to compute `growth24h`/`growth7d`.

### `issues`
Open GitHub issues from trending repos with optional LLM enrichment and AIML classification.

```sql
github_id           INTEGER UNIQUE -- GitHub issue ID
repo_id             INTEGER        -- FK → repos.id
repo_full_name      TEXT           -- e.g. "owner/repo"
number              INTEGER        -- issue number
title, body         TEXT
html_url            TEXT
state               TEXT           -- 'open' | 'closed'
labels              TEXT           -- JSON array of label names
comments            INTEGER
created_at, updated_at TEXT
llm_summary         TEXT           -- 1-sentence description (LLM generated)
llm_solvability     REAL           -- 0.0–10.0 (LLM generated)
llm_difficulty      TEXT           -- 'beginner' | 'intermediate' | 'advanced'
llm_analyzed_at     TEXT           -- timestamp of last LLM analysis
is_aiml_issue       INTEGER        -- 1 | 0 | NULL (classified by AIML job)
aiml_categories     TEXT           -- JSON array of category strings
aiml_classified_at  TEXT           -- timestamp of last AIML classification
```

---

## Key Files

| File | Purpose |
|---|---|
| `lib/db.ts` | libSQL singleton, all DB queries, `ensureInit()`, `getDb()` (exported) |
| `lib/github.ts` | `runSync()` — syncs static 100 repos |
| `lib/trending.ts` | `discoverTrending()` — searches GitHub for viral new repos |
| `lib/issues.ts` | `syncIssues()`, `getIssues()`, LLM enrichment, `classifyAimlIssues()` |
| `lib/constants.ts` | 100 tracked repos (50 AI/ML, 50 SWE) |
| `types/index.ts` | All TypeScript interfaces |

---

## API Routes

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/repos` | List repos with filtering, sorting, pagination |
| `POST` | `/api/sync` | Trigger full sync (repos + trending + issues) |
| `GET` | `/api/history/[owner]/[repo]` | Star history for a specific repo |
| `GET` | `/api/issues` | List issues with filtering and pagination |

### `/api/repos` query params
- `category`: `all` | `AI/ML` | `SWE` | `trending`
- `sort`: `stars` | `forks` | `growth24h` | `growth7d`
- `q`: search string
- `page`, `limit`: pagination

### `/api/issues` query params
- `repo`: filter by `repo_full_name` (e.g. `owner/repo`) — used by `RepoIssuesDrawer`
- `difficulty`: `beginner` | `intermediate` | `advanced`
- `aiml`: `true` — filter to AI/ML classified issues only
- `sort`: `solvability` | `newest` | `comments`
- `q`: search string
- `page`, `limit`: pagination

---

## Sync Flow

```typescript
// POST /api/sync
const [count, trendingCount] = await Promise.all([runSync(), discoverTrending()])
const issueCount = await syncIssues()  // sequential — needs fresh trending repos first
```

`syncIssues()` fetches open issues labeled `good first issue` or `help wanted` from trending repos
(source='discovered', created within 6 months), then runs:
1. LLM enrichment (difficulty, solvability, summary) — requires `ANTHROPIC_API_KEY`
2. AIML classification (is_aiml_issue, aiml_categories) — requires both `ANTHROPIC_API_KEY` and `NEXT_PUBLIC_ENABLE_NEW_INTEGRATION=true`

Both jobs only process issues that are new or updated since last analysis (smart caching via timestamps).

---

## UI: Issues Per Repo (Leaderboard)

Each repo row in the leaderboard has an **Issues button** (BookOpen icon + open_issues count).
Clicking it opens `RepoIssuesDrawer` — a slide-in panel from the right showing:
- Repo header (name, stars, forks, category)
- Compact list of labeled issues from the DB for that repo
- Difficulty badges, AIML badge, solvability meter per issue
- "Solve with New" button on AI/ML issues (when `NEXT_PUBLIC_ENABLE_NEW_INTEGRATION=true`)
- Pagination + link to all issues on GitHub

Issues are fetched via `GET /api/issues?repo=owner/repo`.

## UI: Issues Ledger (`/issues`)

Separate page showing all labeled issues across all trending repos.
Supports filtering by difficulty, AI/ML only, search, and sort.

---

## LLM Integration

- **Model**: `claude-haiku-4-5` (cheap/fast for bulk classification)
- **Enrichment batch size**: 5 issues per API call
- **AIML classification batch size**: 10 issues per API call
- **Delay between batches**: 1 second
- **Graceful fallback**: failures are non-fatal; issues still display without enrichment
- Issues are re-analyzed only if `updated_at > llm_analyzed_at` (or `aiml_classified_at`)

### AIML Categories
`agent_building` | `memory_context` | `model_integration` | `training` | `inference` | `embeddings` | `evaluation` | `tools_plugins`

---

## Important Conventions

### Next.js 16 — `await params`
Dynamic route params are Promises:
```typescript
// app/api/history/[owner]/[repo]/route.ts
export async function GET(req: Request, { params }: { params: Promise<{ owner: string; repo: string }> }) {
  const { owner, repo } = await params
}
```

### libSQL named args
Use `@param` syntax (not `?` positional or `:param`):
```typescript
await db.execute({
  sql: `SELECT * FROM repos WHERE full_name = @name`,
  args: { name: 'owner/repo' },
})
```

### Two tsconfigs
- `tsconfig.json` — Next.js/browser/app code
- `tsconfig.server.json` — CommonJS output for custom server (`server.ts`)

### In-memory caching
Both `lib/db.ts` and `lib/issues.ts` use 60-second in-memory caches invalidated on sync.
Cache key in `getIssues()` includes all filter params including `repo` and `aiml`.
