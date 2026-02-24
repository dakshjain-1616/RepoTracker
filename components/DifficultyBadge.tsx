import type { IssueDifficulty } from '@/types'

const config: Record<IssueDifficulty, { label: string; className: string }> = {
  beginner:     { label: 'Beginner',     className: 'bg-green-500/20 text-green-400 border-green-500/30' },
  intermediate: { label: 'Intermediate', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  advanced:     { label: 'Advanced',     className: 'bg-red-500/20 text-red-400 border-red-500/30' },
}

interface DifficultyBadgeProps {
  difficulty: IssueDifficulty
}

export function DifficultyBadge({ difficulty }: DifficultyBadgeProps) {
  const { label, className } = config[difficulty]
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  )
}
