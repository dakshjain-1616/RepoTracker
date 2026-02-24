import { Bot } from 'lucide-react'

export function AimlBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-400">
      <Bot className="h-3 w-3" />
      AI/ML
    </span>
  )
}
