interface SolvabilityMeterProps {
  score: number
}

export function SolvabilityMeter({ score }: SolvabilityMeterProps) {
  const clamped = Math.max(0, Math.min(10, score))
  const pct = (clamped / 10) * 100

  const color =
    clamped >= 7 ? 'bg-green-500' :
    clamped >= 4 ? 'bg-yellow-500' :
    'bg-red-500'

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">
        {clamped.toFixed(1)}
      </span>
    </div>
  )
}
