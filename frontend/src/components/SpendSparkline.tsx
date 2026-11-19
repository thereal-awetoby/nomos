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
    if (receipt.status === 'refused' || !Number.isFinite(receipt.amount) || receipt.amount <= 0) continue
    const date = new Date(receipt.timestamp)
    const day = spendByDay.get(localDayKey(date))
    if (day) day.sats += receipt.amount
  }

  const peak = Math.max(1, dailyLimitSats, ...days.map((day) => day.sats))
  const pointX = (index: number) => 18 + index * 40.7
  const pointY = (sats: number) => 66 - Math.min(sats / peak, 1) * 48
  const points = days.map((day, index) => `${pointX(index)},${pointY(day.sats)}`).join(' ')
  const capY = pointY(dailyLimitSats)
  const ariaDescription = days.map((day) => `${day.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}: ${day.sats.toLocaleString()} sats`).join('; ')

  return (
    <section className="mt-5 border-t border-nomos-border/10 pt-4" aria-labelledby="seven-day-spend-title">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 id="seven-day-spend-title" className="text-[11px] font-semibold text-nomos-text">Seven-day spend</h3>
        <span className="text-[9px] text-nomos-muted">saved sent receipts · sats</span>
      </div>
      <svg viewBox="0 0 280 82" className="h-24 w-full overflow-visible" role="img" aria-label={`Saved outgoing receipt totals for the last seven local days. ${ariaDescription}. Dashed line marks the current daily limit.`}>
        <line x1="12" y1="66" x2="268" y2="66" stroke="currentColor" strokeOpacity="0.16" strokeWidth="1" />
        {dailyLimitSats > 0 && <line x1="12" y1={capY} x2="268" y2={capY} stroke="currentColor" strokeOpacity="0.28" strokeWidth="1" strokeDasharray="3 4" />}
        <polyline points={points} fill="none" stroke="rgb(var(--nomos-accent))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {days.map((day, index) => (
          <circle key={localDayKey(day.date)} cx={pointX(index)} cy={pointY(day.sats)} r="3" fill="rgb(var(--nomos-accent))">
            <title>{`${day.sats.toLocaleString()} sats · ${day.date.toLocaleDateString()}`}</title>
          </circle>
        ))}
      </svg>
      <div className="-mt-1 grid grid-cols-7 gap-1">
        {days.map((day) => (
          <div key={localDayKey(day.date)} className="min-w-0 text-center" title={`${day.sats.toLocaleString()} sats`}>
            <p className="text-[8px] text-nomos-muted/70">{day.date.toLocaleDateString(undefined, { weekday: 'narrow' })}</p>
            <p className="truncate font-mono text-[8px] text-nomos-muted-bright">{formatCompactSats(day.sats)}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[9px] leading-relaxed text-nomos-muted/70">This chart groups sent receipts saved on this device by local calendar date; the covenant’s locktime-derived day bucket may differ. It may omit unrecorded spends or include another vault’s receipts, and is not an on-chain history query.</p>
    </section>
  )
}
