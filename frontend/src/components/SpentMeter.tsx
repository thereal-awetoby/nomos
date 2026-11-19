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
  const usedColor = spentPct >= 95 ? 'rgb(var(--nomos-refuse))' : spentPct >= 80 ? 'rgb(var(--nomos-pending))' : 'rgb(var(--nomos-accent))'

  return (
    <div
      role="meter"
      aria-label="Spent today against daily limit"
      aria-valuemin={0}
      aria-valuemax={limitSats}
      aria-valuenow={spentSats}
      aria-valuetext={`${fmtSats(spentSats)} of ${fmtSats(limitSats)} sats spent, ${pendingSats > 0 ? `${fmtSats(pendingSats)} sats in the current preview, ` : ''}${fmtSats(remaining)} remaining`}
    >
      <div className="mb-1.5 flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-nomos-muted">
        <span>Spent / limit</span>
        <span className="tabular-nums text-nomos-muted-bright">{spentPct.toFixed(1)}%</span>
      </div>
      <div className="relative h-3 w-full overflow-hidden rounded-sm" style={{ background: 'rgb(var(--nomos-bg-deep) / 0.7)', border: '1px solid var(--line-strong)' }}>
        <div className="spent-meter-fill absolute inset-y-0 left-0" style={{ width: `${spentPct}%`, background: usedColor }} />
        {pendingSats > 0 && (
          <div
            className="spent-meter-fill absolute inset-y-0"
            style={{
              left: `${spentPct}%`,
              width: over ? `${100 - spentPct}%` : `${pendingPct}%`,
              background: over
                ? 'repeating-linear-gradient(135deg, rgb(var(--nomos-refuse) / 0.85) 0 4px, rgb(var(--nomos-refuse) / 0.35) 4px 8px)'
                : 'repeating-linear-gradient(135deg, rgb(var(--nomos-accent) / 0.7) 0 4px, rgb(var(--nomos-accent) / 0.3) 4px 8px)',
            }}
          />
        )}
        {[25, 50, 75].map((tick) => (
          <span key={tick} className="absolute inset-y-0 w-px" style={{ left: `${tick}%`, background: 'var(--line-strong)' }} aria-hidden="true" />
        ))}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[9px] tabular-nums text-nomos-muted">
        <span>0</span>
        <span>{fmtSats(limitSats)} sats</span>
      </div>
    </div>
  )
}
