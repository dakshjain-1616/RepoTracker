import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { NeoApproachStructured } from '../types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatStars(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}k`
  }
  return count.toString()
}

export function formatChange(change: number | null | undefined): string {
  if (change === null || change === undefined) return '—'
  if (change === 0) return '0'
  const formatted = formatStars(Math.abs(change))
  return change > 0 ? `+${formatted}` : `-${formatted}`
}

export function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 60) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 30) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

export function truncate(str: string | null | undefined, maxLen: number): string {
  if (!str) return ''
  if (str.length <= maxLen) return str
  return `${str.slice(0, maxLen)}…`
}

/**
 * Safe JSON fetch helper — reads response as text first, detects HTML error
 * pages (which start with '<'), and throws a descriptive error instead of the
 * cryptic "Unexpected token '<'" SyntaxError.
 *
 * Works regardless of HTTP status code, guarding against dev-mode Turbopack
 * edge cases where an error page can be returned with 200 OK.
 */
export async function safeJson<T>(res: Response): Promise<T> {
  const text = await res.text()
  if (text.trimStart().startsWith('<')) {
    throw new Error(`Expected JSON but received HTML (HTTP ${res.status})`)
  }
  return JSON.parse(text) as T
}

export function parseNeoApproach(raw: string | null): NeoApproachStructured | string | null {
  if (!raw) return null
  try {
    const p = JSON.parse(raw) as unknown
    if (
      p !== null &&
      typeof p === 'object' &&
      typeof (p as { summary?: unknown }).summary === 'string' &&
      Array.isArray((p as { steps?: unknown }).steps)
    ) {
      return p as NeoApproachStructured
    }
  } catch {
    // not JSON — fall through to plain text
  }
  return raw
}

export const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  Rust: '#dea584',
  Go: '#00ADD8',
  C: '#555555',
  'C++': '#f34b7d',
  'C#': '#178600',
  Java: '#b07219',
  Ruby: '#701516',
  PHP: '#4F5D95',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  Shell: '#89e051',
  Dockerfile: '#384d54',
  Makefile: '#427819',
  Jupyter: '#DA5B0B',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Zig: '#ec915c',
  Lua: '#000080',
  Scala: '#c22d40',
  Haskell: '#5e5086',
  Elixir: '#6e4a7e',
}
