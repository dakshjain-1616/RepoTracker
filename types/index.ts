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
  message?: string
  error?: string
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
