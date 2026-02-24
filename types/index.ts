export interface Repo {
  id: number
  full_name: string
  owner: string
  name: string
  description: string | null
  category: 'AI/ML' | 'SWE'
  language: string | null
  topics: string[] | null
  homepage: string | null
  stars: number
  forks: number
  open_issues: number
  watchers: number
  rank: number | null
  created_at: string | null
  pushed_at: string | null
  last_synced: string | null
  source: 'static' | 'discovered'
  // Computed fields from history
  growth24h?: number | null
  growth7d?: number | null
  history?: StarHistory[]
}

export interface StarHistory {
  id: number
  repo_id: number
  stars: number
  forks: number
  recorded_at: string
}

export interface ApiResponse {
  repos: Repo[]
  total: number
  lastSynced: string | null
  page: number
  limit: number
}

export interface SyncResponse {
  success: boolean
  count: number
  issueCount?: number
  message?: string
  error?: string
}

export type IssueDifficulty = 'beginner' | 'intermediate' | 'advanced'

export type AimlCategory =
  | 'agent_building'
  | 'memory_context'
  | 'model_integration'
  | 'training'
  | 'inference'
  | 'embeddings'
  | 'evaluation'
  | 'tools_plugins'

export interface Issue {
  id: number
  github_id: number
  repo_id: number
  repo_full_name: string
  number: number
  title: string
  body: string | null
  html_url: string
  state: string
  labels: string[]
  comments: number
  created_at: string
  updated_at: string
  closed_at: string | null
  llm_summary: string | null
  llm_solvability: number | null
  llm_difficulty: IssueDifficulty | null
  llm_analyzed_at: string | null
  last_synced: string
  is_aiml_issue: number | null       // 1 | 0 | null (unclassified)
  aiml_categories: AimlCategory[] | null  // deserialized from JSON
  aiml_classified_at: string | null
}

export interface IssueWithRepo extends Issue {
  repo_stars: number
  repo_language: string | null
  repo_category: string
}

export interface IssueStats {
  beginner: number
  intermediate: number
  advanced: number
  unanalyzed: number
  aiml: number
}

export interface IssuesApiResponse {
  issues: IssueWithRepo[]
  total: number
  page: number
  limit: number
  lastSynced?: string | null
  stats?: IssueStats
}

export interface HistoryResponse {
  history: StarHistory[]
  repo: Pick<Repo, 'full_name' | 'owner' | 'name' | 'stars'>
}

export type SortField = 'stars' | 'forks' | 'growth24h' | 'growth7d'
export type CategoryFilter = 'all' | 'AI/ML' | 'SWE' | 'trending'

export interface RepoListItem {
  full_name: string
  category: 'AI/ML' | 'SWE'
}
