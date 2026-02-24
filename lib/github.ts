import { Octokit } from '@octokit/rest'
import { REPOS, BATCH_SIZE, BATCH_DELAY_MS, SYNC_INTERVAL_HOURS } from './constants'
import { upsertRepo, insertStarHistory, updateRanks, getRepoLastSynced, invalidateQueryCache } from './db'

const CACHE_TTL_MS = (SYNC_INTERVAL_HOURS - 1) * 60 * 60 * 1000

function getOctokit(): Octokit {
  return new Octokit({ auth: process.env.GITHUB_TOKEN })
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

interface GitHubRepoData {
  full_name: string
  owner: { login: string }
  name: string
  description: string | null
  language: string | null
  topics: string[]
  homepage: string | null
  stargazers_count: number
  forks_count: number
  open_issues_count: number
  watchers_count: number
  created_at: string | null
  pushed_at: string | null
}

async function fetchRepo(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<GitHubRepoData | null> {
  try {
    const { data } = await octokit.repos.get({ owner, repo })
    return {
      full_name:          data.full_name,
      owner:              { login: data.owner.login },
      name:               data.name,
      description:        data.description ?? null,
      language:           data.language ?? null,
      topics:             data.topics ?? [],
      homepage:           data.homepage ?? null,
      stargazers_count:   data.stargazers_count,
      forks_count:        data.forks_count,
      open_issues_count:  data.open_issues_count,
      watchers_count:     data.watchers_count,
      created_at:         data.created_at ?? null,
      pushed_at:          data.pushed_at ?? null,
    }
  } catch (err) {
    const e = err as { status?: number; message?: string }
    console.error(`Failed to fetch ${owner}/${repo}:`, e.message ?? err)
    return null
  }
}

export async function runSync(): Promise<number> {
  console.log(`[Sync] Starting at ${new Date().toISOString()}`)
  const octokit = getOctokit()
  let successCount = 0
  let skippedCount = 0

  const syncedMap = await getRepoLastSynced()
  const now = Date.now()

  for (let i = 0; i < REPOS.length; i += BATCH_SIZE) {
    const batch = REPOS.slice(i, i + BATCH_SIZE)

    await Promise.all(
      batch.map(async ({ full_name, category }) => {
        const lastSynced = syncedMap[full_name]
        if (lastSynced && now - new Date(lastSynced).getTime() < CACHE_TTL_MS) {
          skippedCount++
          return
        }

        const [owner, repo] = full_name.split('/')
        const data = await fetchRepo(octokit, owner, repo)
        if (!data) return

        try {
          const repoId = await upsertRepo({
            full_name:   data.full_name,
            owner:       data.owner.login,
            name:        data.name,
            description: data.description,
            category,
            language:    data.language,
            topics:      data.topics,
            homepage:    data.homepage,
            stars:       data.stargazers_count,
            forks:       data.forks_count,
            open_issues: data.open_issues_count,
            watchers:    data.watchers_count,
            created_at:  data.created_at,
            pushed_at:   data.pushed_at,
          })
          await insertStarHistory(repoId, data.stargazers_count, data.forks_count)
          successCount++
        } catch (err) {
          console.error(`Failed to upsert ${full_name}:`, err)
        }
      })
    )

    if (i + BATCH_SIZE < REPOS.length) await sleep(BATCH_DELAY_MS)
  }

  await updateRanks()
  invalidateQueryCache()
  console.log(
    `[Sync] Done: ${successCount} fetched, ${skippedCount} skipped, ` +
    `${REPOS.length - successCount - skippedCount} failed`
  )
  return successCount
}
