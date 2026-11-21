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
      className="refuse-hit card p-4"
      style={{ borderColor: 'rgb(var(--nomos-refuse) / 0.5)' }}
      role="alert"
      aria-live="assertive"
    >
      <p className="text-xl font-semibold text-nomos-refuse">Refused</p>
      <p className="mt-1 text-[15px] text-nomos-text">{headline}</p>
      <p className="mt-1 text-sm text-nomos-muted">Stopped before signing. Nodes would reject it too.</p>

      <dl className="mt-3 divide-hairline border-t hairline">
        <div className="kv">
          <dt>Amount</dt>
          <dd>{fmtBch(detail.amountSats)} BCH</dd>
        </div>
        {detail.rule === 'limit' && detail.remainingSats !== undefined ? (
          <div className="kv">
            <dt>Left today</dt>
            <dd>{fmtBch(detail.remainingSats)} BCH</dd>
          </div>
        ) : (
          <div className="kv">
            <dt>Destination</dt>
            <dd title={detail.destination}>{shortAddr(detail.destination || '', 6, 6) || 'none'}</dd>
          </div>
        )}
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        {onAdjustAmount && <button type="button" onClick={onAdjustAmount} className="btn-ghost">Use what's left</button>}
        {onChangeDestination && <button type="button" onClick={onChangeDestination} className="btn-ghost">Change destination</button>}
        {proofUrl && <Link to={proofUrl} className="btn-ghost">Check with a node</Link>}
      </div>
    </section>
  )
}
