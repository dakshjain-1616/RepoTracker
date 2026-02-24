# RepoTracker — Project Guide

## Purpose

A GitHub leaderboard tracking the top 100 AI/ML and SWE repositories by star count, trending discovery, and a curated Issues Ledger showing solvable open issues from trending repos.

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
| `ANTHROPIC_API_KEY` | Optional | Enables LLM enrichment of issues (difficulty, solvability, summary) |

Without `ANTHROPIC_API_KEY`, issues still display but without difficulty badges, solvability scores, or summaries — they show body text snippets instead.

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
Open GitHub issues from trending repos with optional LLM enrichment.

```sql
github_id        INTEGER UNIQUE -- GitHub issue ID
repo_id          INTEGER        -- FK → repos.id
repo_full_name   TEXT           -- e.g. "owner/repo"
number           INTEGER        -- issue number
title, body      TEXT
html_url         TEXT
state            TEXT           -- 'open' | 'closed'
labels           TEXT           -- JSON array of label names
comments         INTEGER
created_at, updated_at TEXT
llm_summary      TEXT           -- 1-sentence description (LLM generated)
llm_solvability  REAL           -- 0.0–10.0 (LLM generated)
llm_difficulty   TEXT           -- 'beginner' | 'intermediate' | 'advanced'
llm_analyzed_at  TEXT           -- timestamp of last LLM analysis
```

---

## Key Files

| File | Purpose |
|---|---|
| `lib/db.ts` | libSQL singleton, all DB queries, `ensureInit()`, `getDb()` (exported) |
| `lib/github.ts` | `runSync()` — syncs static 100 repos |
| `lib/trending.ts` | `discoverTrending()` — searches GitHub for viral new repos |
| `lib/issues.ts` | `syncIssues()`, `getIssues()`, LLM enrichment |
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
- `difficulty`: `beginner` | `intermediate` | `advanced`
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

`syncIssues()` fetches open issues labeled `good first issue` or `help wanted` from trending repos (source='discovered', created within 6 months), then optionally runs LLM enrichment in batches of 5.

---

## LLM Integration (Issues Enrichment)

- **Model**: `claude-haiku-4-5` (cheap/fast for bulk classification)
- **Batching**: 5 issues per API call, 1-second delay between batches
- **Graceful fallback**: If `ANTHROPIC_API_KEY` is not set or LLM calls fail, issues still display without enrichment
- Issues are re-analyzed if `updated_at > llm_analyzed_at`

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
