import { fmtSats } from './ui'

/**
 * Spent today against the daily limit, drawn the way the landing page draws
 * it: green for what is spent, the payment being previewed on top of it, and
 * the limit as a line. A payment that would cross the line shows past it,
 * hatched red, before anything is signed.
 */
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
  const remaining = Math.max(0, limitSats - spentSats)
  const previewing = pendingSats > 0
  const fits = spentSats + pendingSats <= limitSats
  const pendingPct = previewing ? Math.min(100 - spentPct, (pendingSats / safeLimit) * 100) : 0
  const overSats = Math.max(0, spentSats + pendingSats - limitSats)
  // The part past the line is drawn to scale, up to the room beside the bar.
  const overPct = Math.min(13, (overSats / safeLimit) * 100)
  const spentColor = spentSats > limitSats ? 'bg-nomos-refuse' : 'bg-nomos-ok'

  return (
    <div
      role="meter"
      aria-label="Spent today against daily limit"
      aria-valuemin={0}
      aria-valuemax={limitSats}
      aria-valuenow={spentSats}
      aria-valuetext={`${fmtSats(spentSats)} of ${fmtSats(limitSats)} sats spent, ${previewing ? `${fmtSats(pendingSats)} sats in the current preview, ` : ''}${fmtSats(remaining)} remaining`}
    >
      <div className="mb-3 flex items-baseline justify-between gap-3 text-sm">
        <span className="text-nomos-muted">Spent today</span>
        <span className="tabular-nums text-nomos-muted">
          <span className="font-semibold text-nomos-text">{fmtSats(spentSats)}</span> of {fmtSats(limitSats)} sats
        </span>
      </div>
      <div className="relative mr-[12%] h-4" aria-hidden="true">
        <div className="absolute inset-0 rounded-full bg-nomos-surface-raised" />
        <div className={`spent-meter-fill absolute inset-y-0 left-0 rounded-full ${spentColor}`} style={{ width: `${spentPct}%` }} />
        {previewing && fits && (
          <div className="spent-meter-fill meter-pending absolute inset-y-0 rounded-r-full" style={{ left: `${spentPct}%`, width: `${pendingPct}%` }} />
        )}
        {previewing && !fits && (
          <div
            className="spent-meter-fill meter-over absolute inset-y-0 rounded-r-md"
            style={{ left: `${spentPct}%`, width: `calc(${100 - spentPct}% + ${overPct}% )` }}
          />
        )}
        <span className="absolute -bottom-1.5 -top-1.5 right-0 w-[3px] translate-x-1/2 rounded-full bg-[rgb(var(--nomos-focus))]" />
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-3 text-xs">
        {previewing ? (
          <span className={`font-medium ${fits ? 'text-nomos-ok' : 'text-nomos-refuse'}`}>
            {fits
              ? `This payment fits: ${fmtSats(limitSats - spentSats - pendingSats)} sats left after it`
              : `Over today's limit by ${fmtSats(overSats)} sats: every node would refuse it`}
          </span>
        ) : (
          <span className="text-nomos-muted">{fmtSats(remaining)} sats left today</span>
        )}
        <span className="shrink-0 font-medium text-[rgb(var(--nomos-focus))]">Limit</span>
      </div>
    </div>
  )
}
