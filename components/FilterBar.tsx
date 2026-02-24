'use client'

import { Search } from 'lucide-react'
import { type CategoryFilter, type SortField } from '@/types'

interface FilterBarProps {
  category: CategoryFilter
  sort: SortField
  search: string
  onCategoryChange: (cat: CategoryFilter) => void
  onSortChange: (sort: SortField) => void
  onSearchChange: (q: string) => void
}

const CATEGORIES: { value: CategoryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'AI/ML', label: 'AI / ML' },
  { value: 'SWE', label: 'SWE' },
  { value: 'trending', label: 'Trending' },
]

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'stars', label: 'Stars' },
  { value: 'forks', label: 'Forks' },
  { value: 'growth24h', label: '24h Growth' },
  { value: 'growth7d', label: '7d Growth' },
]

export function FilterBar({
  category,
  sort,
  search,
  onCategoryChange,
  onSortChange,
  onSearchChange,
}: FilterBarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Category Tabs */}
      <div className="flex rounded-lg border border-border bg-muted/30 p-1 gap-1">
        {CATEGORIES.map(cat => (
          <button
            key={cat.value}
            onClick={() => onCategoryChange(cat.value)}
            className={`
              rounded-md px-4 py-1.5 text-sm font-medium transition-all
              ${category === cat.value
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
              }
            `}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search repos..."
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            className="
              w-48 rounded-lg border border-border bg-background/50
              py-1.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground
              focus:outline-none focus:ring-1 focus:ring-ring
            "
          />
        </div>

        {/* Sort */}
        <select
          value={sort}
          onChange={e => onSortChange(e.target.value as SortField)}
          className="
            rounded-lg border border-border bg-background/50
            py-1.5 px-3 text-sm text-foreground
            focus:outline-none focus:ring-1 focus:ring-ring
            cursor-pointer
          "
        >
          {SORT_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>
              Sort: {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
