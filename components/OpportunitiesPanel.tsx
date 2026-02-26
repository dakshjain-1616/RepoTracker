'use client'

import { useState } from 'react'
import { Bug, Zap, Lightbulb, ChevronDown, ChevronRight } from 'lucide-react'
import { OpportunityCard } from './OpportunityCard'
import type { IssueWithRepo } from '@/types'

const MAX_PER_SECTION = 3

interface OpportunitiesPanelProps {
  issues: IssueWithRepo[]
  onBuildWithNeo: (issue: IssueWithRepo) => void
}

interface SectionConfig {
  key: 'bug' | 'feature' | 'improvement'
  label: string
  Icon: React.ElementType
  iconClass: string
  issues: IssueWithRepo[]
}

export function OpportunitiesPanel({ issues, onBuildWithNeo }: OpportunitiesPanelProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const bugs = issues
    .filter(i => i.opportunity_type === 'bug')
    .sort((a, b) => b.comments - a.comments)

  const features = issues
    .filter(i => i.opportunity_type === 'feature')
    .sort((a, b) => b.comments - a.comments)

  const improvements = issues
    .filter(i => i.opportunity_type === 'improvement')
    .sort((a, b) => (b.llm_solvability ?? 0) - (a.llm_solvability ?? 0))

  const sections: SectionConfig[] = [
    { key: 'bug',         label: 'Most Prominent Bugs',             Icon: Bug,        iconClass: 'text-red-400',    issues: bugs },
    { key: 'feature',     label: 'Most Prominent Feature Requests', Icon: Zap,        iconClass: 'text-blue-400',   issues: features },
    { key: 'improvement', label: 'Improvements & Recommendations',  Icon: Lightbulb,  iconClass: 'text-yellow-400', issues: improvements },
  ]

  const nonEmpty = sections.filter(s => s.issues.length > 0)
  if (nonEmpty.length === 0) return null

  return (
    <div className="flex flex-col gap-4 mb-2">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
          Opportunities
        </h3>
        <div className="flex-1 h-px bg-border" />
      </div>

      {nonEmpty.map(section => {
        const isExpanded = expanded[section.key]
        const visible = isExpanded ? section.issues : section.issues.slice(0, MAX_PER_SECTION)
        const hasMore = section.issues.length > MAX_PER_SECTION
        const extraCount = section.issues.length - MAX_PER_SECTION

        return (
          <div key={section.key}>
            {/* Section header row */}
            <div className="flex items-center gap-1.5 mb-2">
              <section.Icon className={`h-3.5 w-3.5 ${section.iconClass}`} />
              <span className="text-xs font-semibold text-foreground">
                {section.label}
              </span>
              <span className="text-xs text-muted-foreground">
                ({section.issues.length})
              </span>
            </div>

            {/* Opportunity cards */}
            <div className="flex flex-col gap-2">
              {visible.map(issue => (
                <OpportunityCard
                  key={issue.github_id}
                  issue={issue}
                  onBuildWithNeo={onBuildWithNeo}
                />
              ))}
            </div>

            {/* Expand / collapse */}
            {hasMore && (
              <button
                onClick={() => setExpanded(prev => ({ ...prev, [section.key]: !isExpanded }))}
                className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {isExpanded ? (
                  <><ChevronDown className="h-3 w-3" /> Show less</>
                ) : (
                  <><ChevronRight className="h-3 w-3" /> Show {extraCount} more</>
                )}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
