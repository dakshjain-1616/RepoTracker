'use client'

import { Search, Bot } from 'lucide-react'

interface IssuesFilterBarProps {
  difficulty: string
  q: string
  sort: string
  aimlOnly: boolean
  onDifficulty: (v: string) => void
  onQ: (v: string) => void
  onSort: (v: string) => void
  onAimlOnly: (v: boolean) => void
}

const DIFFICULTY_TABS = [
  { value: '',             label: 'All' },
  { value: 'beginner',     label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced',     label: 'Advanced' },
]

const SORT_OPTIONS = [
  { value: 'solvability', label: 'Solvability' },
  { value: 'newest',      label: 'Newest' },
  { value: 'comments',    label: 'Most discussed' },
]

export function IssuesFilterBar({
  difficulty, q, sort, aimlOnly, onDifficulty, onQ, onSort, onAimlOnly,
}: IssuesFilterBarProps) {
  const newEnabled = process.env.NEXT_PUBLIC_ENABLE_NEW_INTEGRATION === 'true'

  return (
    <div className="flex flex-col gap-3">
      {/* Row 1: difficulty tabs + AI/ML toggle + sort */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Difficulty tabs */}
        <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1">
          {DIFFICULTY_TABS.map(tab => (
            <button
              key={tab.value}
              onClick={() => onDifficulty(tab.value)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                difficulty === tab.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* AI/ML toggle — only shown when feature is enabled */}
        {newEnabled && (
          <button
            onClick={() => onAimlOnly(!aimlOnly)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              aimlOnly
                ? 'border-amber-500/40 bg-amber-500/20 text-amber-400'
                : 'border-border bg-muted/30 text-muted-foreground hover:text-foreground'
            }`}
          >
            <Bot className="h-3.5 w-3.5" />
            AI/ML
          </button>
        )}

        {/* Sort — pushed to the right */}
        <select
          value={sort}
          onChange={e => onSort(e.target.value)}
          className="ml-auto rounded-lg border border-border bg-background/50 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {SORT_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Row 2: search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={q}
          onChange={e => onQ(e.target.value)}
          placeholder="Search issues..."
          className="w-full rounded-lg border border-border bg-background/50 pl-8 pr-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
    </div>
  )
}
