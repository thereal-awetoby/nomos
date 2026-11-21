import { fmtSats } from './ui'

/** Linear spent-vs-limit meter with quarter ticks. */
export default function SpentMeter({
  spentSats,
  limitSats,
  pendingSats = 0,
}: {
  spentSats: number
  limitSats: number
  /** Optional amount being previewed on top of what is already spent. */
  pendingSats?: number
}) {
  const safeLimit = Math.max(limitSats, 1)
  const spentPct = Math.min(100, (spentSats / safeLimit) * 100)
  const pendingPct = Math.max(0, Math.min(100 - spentPct, (pendingSats / safeLimit) * 100))
  const over = spentSats + pendingSats > limitSats
  const remaining = Math.max(0, limitSats - spentSats)
  const usedColor = spentSats > limitSats ? 'rgb(var(--nomos-refuse))' : 'rgb(var(--nomos-text))'

  return (
    <div
      role="meter"
      aria-label="Spent today against daily limit"
      aria-valuemin={0}
      aria-valuemax={limitSats}
      aria-valuenow={spentSats}
      aria-valuetext={`${fmtSats(spentSats)} of ${fmtSats(limitSats)} sats spent, ${pendingSats > 0 ? `${fmtSats(pendingSats)} sats in the current preview, ` : ''}${fmtSats(remaining)} remaining`}
    >
      <div className="mb-2 flex items-baseline justify-between gap-3 text-sm">
        <span className="text-nomos-muted">Spent today</span>
        <span className="tabular-nums text-nomos-text">{fmtSats(spentSats)} / {fmtSats(limitSats)} sats</span>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full" style={{ background: 'rgb(var(--nomos-surface-raised))' }}>
        <div className="spent-meter-fill absolute inset-y-0 left-0" style={{ width: `${spentPct}%`, background: usedColor }} />
        {pendingSats > 0 && (
          <div
            className="spent-meter-fill absolute inset-y-0"
            style={{
              left: `${spentPct}%`,
              width: over ? `${100 - spentPct}%` : `${pendingPct}%`,
              background: over
                ? 'rgb(var(--nomos-refuse) / 0.6)'
                : 'rgb(var(--nomos-text) / 0.35)',
            }}
          />
        )}
      </div>
    </div>
  )
}
