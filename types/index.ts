export interface NeoApproachStructured {
  summary: string      // 1-2 sentence overview
  steps: string[]      // 2-4 concrete steps starting with a verb
  effort: string       // e.g. "2-4 hours", "< 1 day"
  confidence: number   // 1-10 integer
}

export interface RepoInsightTheme {
  title: string          // short synthesized theme title, e.g. "GPU Memory Crashes on Windows"
  description: string    // 2–3 sentences explaining the theme and why it matters
  issue_count: number    // how many real issues this theme covers
  total_comments: number // total comments across those issues
  urgency?: 'high' | 'medium' | 'low'  // high=crashes/blockers, medium=usability, low=nice-to-haves
  suggested_approach?: string           // 1 sentence on best way to address this theme
}

export interface RepoInsights {
  bugs: RepoInsightTheme[] | null
  features: RepoInsightTheme[] | null
  improvements: RepoInsightTheme[] | null
}

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
  // LLM-generated opportunity insights per category
  opportunity_insights?: RepoInsights | null
  insights_generated_at?: string | null
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
  mode?: 'repos' | 'issues' | 'all'
}

export interface SyncStatusResponse {
  reposPendingIssueSync: number   // repos past 12h cooldown — have stale or no issue data
  pendingLlmEnrichment: number    // issues without LLM analysis (or updated since last)
  pendingNeoApproaches: number    // issues without neo_approach
  totalIssues: number
  lastSynced: string | null
}

export type IssueDifficulty = 'beginner' | 'intermediate' | 'advanced'

export type OpportunityType = 'bug' | 'feature' | 'improvement'

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
  neo_approach: string | null        // 1-2 lines on how NEO can solve this issue
  opportunity_type: OpportunityType | null  // 'bug' | 'feature' | 'improvement'
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
  live?: boolean           // true when results are fetched live from GitHub (not from DB)
  featured?: IssueWithRepo[]
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
