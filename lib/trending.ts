import { Octokit } from '@octokit/rest'
import { upsertRepo, insertStarHistory, invalidateQueryCache } from './db'
import { REPOS } from './constants'

const STATIC_NAMES = new Set(REPOS.map(r => r.full_name.toLowerCase()))

// Topics that strongly indicate AI/ML
const AIML_TOPICS = new Set([
  'llm', 'large-language-model', 'language-model', 'machine-learning', 'deep-learning',
  'neural-network', 'nlp', 'natural-language-processing', 'computer-vision', 'generative-ai',
  'stable-diffusion', 'ai-agent', 'rag', 'retrieval-augmented-generation', 'embeddings',
  'fine-tuning', 'transformers', 'pytorch', 'tensorflow', 'reinforcement-learning',
  'chatgpt', 'gpt', 'openai', 'huggingface', 'diffusion-model', 'multimodal',
  'ai', 'artificial-intelligence', 'ml', 'inference', 'quantization',
])

const AIML_LANGUAGES = new Set(['Jupyter Notebook', 'Python'])

function categorize(topics: string[], language: string | null, fullName: string): 'AI/ML' | 'SWE' {
  const lowerTopics = topics.map(t => t.toLowerCase())
  if (lowerTopics.some(t => AIML_TOPICS.has(t))) return 'AI/ML'
  // Python repos with certain keywords in name/description are likely AI/ML
  if (AIML_LANGUAGES.has(language ?? '') && lowerTopics.length > 0) {
    const name = fullName.toLowerCase()
    if (/llm|gpt|ai|ml|model|train|infer|diffus|embed|vector/.test(name)) return 'AI/ML'
  }
  return 'SWE'
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

interface SearchItem {
  full_name: string
  owner: { login: string }
  name: string
  description: string | null
  language: string | null
  topics?: string[]
  homepage: string | null
  stargazers_count: number
  forks_count: number
  open_issues_count: number
  watchers_count: number
  created_at: string
  pushed_at: string
}

// Date string N months ago: e.g. "2025-08-24"
function monthsAgo(n: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return d.toISOString().slice(0, 10)
}

async function searchRepos(octokit: Octokit, query: string, perPage = 30): Promise<SearchItem[]> {
  try {
    const { data } = await octokit.search.repos({
      q: query,
      sort: 'stars',
      order: 'desc',
      per_page: perPage,
    })
    return data.items as SearchItem[]
  } catch (err) {
    const e = err as { status?: number; message?: string }
    console.error(`[Trending] Search failed (${query}):`, e.message)
    return []
  }
}

export async function discoverTrending(): Promise<number> {
  console.log('[Trending] Starting discovery...')
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })

  const since6m = monthsAgo(6)
  const since3m = monthsAgo(3)

  // Run multiple searches to cover AI/ML and SWE trending repos
  const searches: Array<{ query: string; label: string }> = [
    // Fast-growing new repos — AI/ML focused
    { query: `created:>${since3m} stars:>500 language:Python`, label: 'new Python' },
    { query: `created:>${since3m} stars:>300 topic:llm`, label: 'new LLM' },
    { query: `created:>${since3m} stars:>300 topic:ai-agent`, label: 'new AI agents' },
    { query: `created:>${since3m} stars:>300 topic:generative-ai`, label: 'new GenAI' },
    // Fast-growing new repos — SWE focused
    { query: `created:>${since3m} stars:>500 language:TypeScript`, label: 'new TS' },
    { query: `created:>${since3m} stars:>500 language:Rust`, label: 'new Rust' },
    { query: `created:>${since3m} stars:>500 language:Go`, label: 'new Go' },
    // Recently active high-star repos (catching viral moments)
    { query: `pushed:>${since6m} stars:>5000 created:>${since6m}`, label: 'viral recent' },
  ]

  const seen = new Set<string>()
  let added = 0

  for (const { query, label } of searches) {
    const items = await searchRepos(octokit, query, 20)
    console.log(`[Trending] "${label}": ${items.length} results`)

    for (const item of items) {
      const key = item.full_name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)

      // Skip repos already in static list
      if (STATIC_NAMES.has(key)) continue

      const topics = item.topics ?? []
      const category = categorize(topics, item.language, item.full_name)

      try {
        const repoId = await upsertRepo({
          full_name: item.full_name,
          owner: item.owner.login,
          name: item.name,
          description: item.description,
          category,
          language: item.language,
          topics,
          homepage: item.homepage,
          stars: item.stargazers_count,
          forks: item.forks_count,
          open_issues: item.open_issues_count,
          watchers: item.watchers_count,
          created_at: item.created_at,
          pushed_at: item.pushed_at,
          source: 'discovered',
        })
        await insertStarHistory(repoId, item.stargazers_count, item.forks_count)
        added++
      } catch (err) {
        console.error(`[Trending] Failed to upsert ${item.full_name}:`, err)
      }
    }

    await sleep(300)
  }

  invalidateQueryCache()
  console.log(`[Trending] Discovery complete: ${added} repos added/updated`)
  return added
}
