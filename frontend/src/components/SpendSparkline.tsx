import type { Receipt } from '../lib/types'

interface DaySpend {
  date: Date
  sats: number
}

function formatCompactSats(sats: number): string {
  if (sats >= 1_000_000) return `${(sats / 1_000_000).toFixed(sats >= 10_000_000 ? 0 : 1)}m`
  if (sats >= 1_000) return `${(sats / 1_000).toFixed(sats >= 100_000 ? 0 : 1)}k`
  return String(sats)
}

function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

export default function SpendSparkline({
  receipts,
  dailyLimitSats,
}: {
  receipts: Receipt[]
  dailyLimitSats: number
}) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days: DaySpend[] = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today)
    date.setDate(today.getDate() - (6 - index))
    return { date, sats: 0 }
  })
  const spendByDay = new Map(days.map((day) => [localDayKey(day.date), day]))

  for (const receipt of receipts) {
    if ((receipt.kind ?? 'payment') !== 'payment') continue
    if (receipt.status === 'refused' || !Number.isFinite(receipt.amount) || receipt.amount <= 0) continue
    const date = new Date(receipt.timestamp)
    const day = spendByDay.get(localDayKey(date))
    if (day) day.sats += receipt.amount
  }

  const peak = Math.max(1, dailyLimitSats, ...days.map((day) => day.sats))
  const barW = 26
  const slot = 256 / 7
  const barX = (index: number) => 12 + index * slot + (slot - barW) / 2
  const barY = (sats: number) => 66 - Math.min(sats / peak, 1) * 52
  const capY = barY(dailyLimitSats)
  const ariaDescription = days.map((day) => `${day.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}: ${day.sats.toLocaleString()} sats`).join('; ')

  return (
    <section className="text-nomos-text" aria-labelledby="seven-day-spend-title">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h3 id="seven-day-spend-title" className="text-sm text-nomos-muted">Last 7 days</h3>
        <span className="text-xs text-nomos-muted">sats</span>
      </div>
      <svg viewBox="0 0 280 72" preserveAspectRatio="none" className="h-20 w-full overflow-visible" role="img" shapeRendering="crispEdges" aria-label={`Payments saved on this device for the last seven days. ${ariaDescription}. Dashed line marks the current daily limit.`}>
        <line x1="12" y1="66" x2="268" y2="66" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {days.map((day, index) => {
          const y = barY(day.sats)
          const atCap = dailyLimitSats > 0 && day.sats >= dailyLimitSats
          return (
            <g key={localDayKey(day.date)}>
              <rect x={barX(index)} y={14} width={barW} height={52} fill="currentColor" fillOpacity="0.04" />
              {day.sats > 0 && (
                <rect x={barX(index)} y={y} width={barW} height={66 - y} fill="currentColor" fillOpacity={atCap ? 0.9 : 0.55}>
                  <title>{`${day.sats.toLocaleString()} sats · ${day.date.toLocaleDateString()}`}</title>
                </rect>
              )}
            </g>
          )
        })}
        {dailyLimitSats > 0 && <line x1="12" y1={capY} x2="268" y2={capY} stroke="currentColor" strokeOpacity="0.45" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
      </svg>
      <div className="grid grid-cols-7" style={{ paddingLeft: `${(12 / 280) * 100}%`, paddingRight: `${(12 / 280) * 100}%` }}>
        {days.map((day) => (
          <div key={localDayKey(day.date)} className="min-w-0 text-center" title={`${day.sats.toLocaleString()} sats`}>
            <p className="text-xs text-nomos-muted">{day.date.toLocaleDateString(undefined, { weekday: 'narrow' })}</p>
            <p className="truncate text-[11px] tabular-nums text-nomos-muted-bright">{formatCompactSats(day.sats)}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
