import type { ReactNode } from 'react'
import SpentMeter from './SpentMeter'
import { Chip, KV, Panel, fmtBch } from './ui'

export interface MandateView {
  dailyLimitSats: number
  spentSats: number
  allowlistEnabled: boolean
  allowlistCount: number
  agentSet: boolean
  rescueSet: boolean
}

/** The active mandate as a dense parameter panel with a spent meter. */
export default function MandateCard({
  mandate,
  title = 'Active mandate',
  right,
  pendingSats = 0,
  footer,
  className = '',
}: {
  mandate: MandateView
  title?: ReactNode
  right?: ReactNode
  pendingSats?: number
  footer?: ReactNode
  className?: string
}) {
  const remaining = Math.max(0, mandate.dailyLimitSats - mandate.spentSats)
  return (
    <Panel title={title} right={right} className={className}>
      <div className="divide-hairline">
        <KV label="Daily limit">{fmtBch(mandate.dailyLimitSats)} BCH</KV>
        <KV label="Spent today">{fmtBch(mandate.spentSats)} BCH</KV>
        <KV label="Remaining" tone={remaining > 0 ? 'paid' : 'refused'}>{fmtBch(remaining)} BCH</KV>
        <div className="kv">
          <span>Allowlist</span>
          <span className="flex items-center gap-2">
            {mandate.allowlistEnabled && <span className="text-nomos-muted-bright">{mandate.allowlistCount}/5</span>}
            <Chip kind={mandate.allowlistEnabled ? 'on' : 'off'} />
          </span>
        </div>
        <div className="kv">
          <span>Agent key</span>
          <span><Chip kind={mandate.agentSet ? 'on' : 'off'}>{mandate.agentSet ? 'Set' : 'None'}</Chip></span>
        </div>
        <div className="kv">
          <span>Rescue co-signer</span>
          <span><Chip kind={mandate.rescueSet ? 'on' : 'off'}>{mandate.rescueSet ? 'Set' : 'None'}</Chip></span>
        </div>
      </div>
      <div className="mt-3">
        <SpentMeter spentSats={mandate.spentSats} limitSats={mandate.dailyLimitSats} pendingSats={pendingSats} />
      </div>
      {footer && <div className="mt-3 border-t hairline pt-2">{footer}</div>}
    </Panel>
  )
}
