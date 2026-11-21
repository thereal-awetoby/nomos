import { useMemo } from 'react'

interface SpendGaugeProps {
  spentSats: number
  limitSats: number
  /** Diameter in pixels. Defaults to 140. */
  size?: number
}

/** Circular gauge for the effective spend used under today's mandate. */
export default function SpendGauge({ spentSats, limitSats, size = 140 }: SpendGaugeProps) {
  const { pct, color, remaining } = useMemo(() => {
    const limit = Number.isFinite(limitSats) ? Math.max(0, limitSats) : 0
    const spent = Number.isFinite(spentSats) ? Math.max(0, spentSats) : 0
    const ratio = limit > 0 ? spent / limit : (spent > 0 ? 1 : 0)
    const percentage = Math.max(0, Math.min(ratio, 1))
    const stroke = ratio >= 1 ? 'rgb(var(--nomos-refuse))' : 'rgb(var(--nomos-text))'

    return {
      pct: percentage,
      color: stroke,
      remaining: Math.max(limit - spent, 0),
    }
  }, [spentSats, limitSats])

  const diameter = Math.max(64, Math.round(Number.isFinite(size) ? size : 140))
  const radius = (diameter - 12) / 2
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - pct)
  const remainingBch = (remaining / 1e8).toFixed(8)
  const percentUsed = (pct * 100).toFixed(0)

  return (
    <div
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: diameter, height: diameter }}
      role="img"
      aria-label={`${remainingBch} BCH left today; ${percentUsed}% of the daily limit used`}
    >
      <svg width={diameter} height={diameter} className="-rotate-90" aria-hidden="true">
        <circle
          cx={diameter / 2}
          cy={diameter / 2}
          r={radius}
          fill="none"
          stroke="rgb(var(--nomos-border) / 0.18)"
          strokeWidth={8}
        />
        <circle
          className="spend-gauge-progress"
          cx={diameter / 2}
          cy={diameter / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
        <span className="font-mono text-base font-bold tabular-nums text-nomos-text">
          {remainingBch}
        </span>
        <span className="text-xs text-nomos-muted">
          BCH left
        </span>
        <span className="mt-0.5 text-xs font-medium" style={{ color }}>
          {percentUsed}% used
        </span>
      </div>
    </div>
  )
}
