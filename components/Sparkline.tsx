'use client'

import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts'
import type { StarHistory } from '@/types'
import { formatStars } from '@/lib/utils'

interface SparklineProps {
  history: StarHistory[]
  color?: string
  width?: number
  height?: number
}

interface TooltipPayload {
  value: number
}

interface CustomTooltipProps {
  active?: boolean
  payload?: TooltipPayload[]
  label?: string
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (active && payload && payload.length) {
    return (
      <div className="rounded bg-card border border-border px-2 py-1 text-xs">
        <span className="text-muted-foreground">Stars: </span>
        <span className="font-medium">{formatStars(payload[0].value)}</span>
      </div>
    )
  }
  return null
}

export function Sparkline({ history, color = '#10b981', width = 80, height = 30 }: SparklineProps) {
  if (!history || history.length < 2) {
    return (
      <div
        style={{ width, height }}
        className="flex items-center justify-center text-muted-foreground text-xs"
      >
        —
      </div>
    )
  }

  const data = history.slice(-14).map(h => ({ stars: h.stars, date: h.recorded_at }))

  // Determine trend color
  const first = data[0]?.stars ?? 0
  const last = data[data.length - 1]?.stars ?? 0
  const trendColor = last >= first ? '#10b981' : '#f87171'
  const lineColor = color === '#10b981' ? trendColor : color

  return (
    <ResponsiveContainer width={width} height={height}>
      <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <Line
          type="monotone"
          dataKey="stars"
          stroke={lineColor}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
        <Tooltip
          content={<CustomTooltip />}
          cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
