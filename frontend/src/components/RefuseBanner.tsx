import { Link } from 'react-router-dom'
import { fmtBch, fmtSats, shortAddr } from './ui'

export interface RefusalDetail {
  /** Which rule the payment breaks. */
  rule: 'limit' | 'allowlist' | 'destination' | 'amount'
  amountSats: number
  remainingSats?: number
  dailyLimitSats?: number
  destination?: string
  reason?: string
}

/** Classify a wouldRefuse() reason string into the rule it breaks. */
export function refusalRule(reason: string | undefined): RefusalDetail['rule'] {
  const r = (reason || '').toLowerCase()
  if (r.includes('daily limit')) return 'limit'
  if (r.includes('allowlist')) return 'allowlist'
  if (r.includes('destination')) return 'destination'
  return 'amount'
}

/** Full-width refusal state. Shown before signing and after a node rejects. */
export default function RefuseBanner({
  detail,
  proofUrl,
  onAdjustAmount,
  onChangeDestination,
}: {
  detail: RefusalDetail
  proofUrl?: string
  onAdjustAmount?: () => void
  onChangeDestination?: () => void
}) {
  const overBy = detail.rule === 'limit' && detail.remainingSats !== undefined
    ? Math.max(0, detail.amountSats - detail.remainingSats)
    : 0

  const headline = detail.rule === 'limit'
    ? `Daily limit exceeded by ${fmtSats(overBy)} sats`
    : detail.rule === 'allowlist'
      ? 'Destination is not on the allowlist'
      : detail.rule === 'destination'
        ? 'Destination address is invalid'
        : 'Amount is not valid'

  return (
    <section
      className="refuse-hit card overflow-hidden"
      style={{ borderColor: 'rgb(var(--nomos-refuse))', borderWidth: '2px', background: 'rgb(var(--nomos-refuse) / 0.06)' }}
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-2 font-mono text-[11px] font-black uppercase tracking-[0.18em]" style={{ background: 'rgb(var(--nomos-refuse))', color: 'rgb(var(--nomos-bg))' }}>
        <span>Mandate violation</span>
        <span>Not signed</span>
      </div>

      <div className="p-4">
        <p className="font-mono text-4xl font-black uppercase leading-none tracking-[0.08em] text-nomos-refuse sm:text-5xl">Refused</p>
        <p className="mt-3 font-mono text-sm font-semibold text-nomos-text">{headline}</p>

        <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-sm font-mono text-[11px] tabular-nums" style={{ background: 'rgb(var(--nomos-refuse) / 0.25)' }}>
          <div className="bg-nomos-surface p-2">
            <dt className="text-[9px] uppercase tracking-[0.14em] text-nomos-muted">Attempted</dt>
            <dd className="mt-0.5 text-nomos-text">{fmtBch(detail.amountSats)} BCH</dd>
          </div>
          {detail.rule === 'limit' && detail.remainingSats !== undefined ? (
            <div className="bg-nomos-surface p-2">
              <dt className="text-[9px] uppercase tracking-[0.14em] text-nomos-muted">Remaining today</dt>
              <dd className="mt-0.5 text-nomos-text">{fmtBch(detail.remainingSats)} BCH</dd>
            </div>
          ) : (
            <div className="bg-nomos-surface p-2">
              <dt className="text-[9px] uppercase tracking-[0.14em] text-nomos-muted">Destination</dt>
              <dd className="mt-0.5 truncate text-nomos-text" title={detail.destination}>{shortAddr(detail.destination || '', 6, 6) || 'none'}</dd>
            </div>
          )}
          {detail.rule === 'limit' && (
            <>
              <div className="bg-nomos-surface p-2">
                <dt className="text-[9px] uppercase tracking-[0.14em] text-nomos-muted">Over by</dt>
                <dd className="mt-0.5 text-nomos-refuse">{fmtSats(overBy)} sats</dd>
              </div>
              <div className="bg-nomos-surface p-2">
                <dt className="text-[9px] uppercase tracking-[0.14em] text-nomos-muted">Rule</dt>
                <dd className="mt-0.5 text-nomos-text">spent + amount ≤ limit</dd>
              </div>
            </>
          )}
        </dl>

        <p className="mt-3 text-xs leading-relaxed text-nomos-muted-bright">
          Nomos stopped this before your wallet signed. If a transaction like this were signed and broadcast, the covenant script would fail, nodes would reject it and miners could not include it.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {onAdjustAmount && <button type="button" onClick={onAdjustAmount} className="btn-ghost px-2 text-[10px]">Adjust amount</button>}
          {onChangeDestination && <button type="button" onClick={onChangeDestination} className="btn-ghost px-2 text-[10px]">Change destination</button>}
          <Link to="/vault" className="btn-ghost px-2 text-[10px]">View mandate</Link>
          {proofUrl && <Link to={proofUrl} className="btn-danger px-2 text-[10px]">Check with node</Link>}
        </div>
      </div>
    </section>
  )
}
