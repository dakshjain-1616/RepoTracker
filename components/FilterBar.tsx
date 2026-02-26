'use client'

import { type CategoryFilter } from '@/types'

interface FilterBarProps {
  category: CategoryFilter
  onCategoryChange: (cat: CategoryFilter) => void
}

const CATEGORIES: { value: CategoryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'AI/ML', label: 'AI / ML' },
  { value: 'SWE', label: 'SWE' },
  { value: 'trending', label: 'Trending' },
  { value: 'innovation', label: '✦ Innovation' },
]

export function FilterBar({ category, onCategoryChange }: FilterBarProps) {
  return (
    <div className="flex rounded-lg border border-border bg-muted/30 p-1 gap-1 flex-wrap">
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
  )
}
