import type { ReactNode } from 'react'
import SpentMeter from './SpentMeter'
import { KV, Panel, fmtBch } from './ui'

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
      <SpentMeter spentSats={mandate.spentSats} limitSats={mandate.dailyLimitSats} pendingSats={pendingSats} />
      <div className="mt-3 divide-hairline border-t hairline">
        <KV label="Daily limit">{fmtBch(mandate.dailyLimitSats)} BCH</KV>
        <KV label="Left today" tone={remaining > 0 ? undefined : 'refused'}>{fmtBch(remaining)} BCH</KV>
        <KV label="Allowlist">{mandate.allowlistEnabled ? `On · ${mandate.allowlistCount} of 5` : 'Off'}</KV>
        <KV label="Agent key">{mandate.agentSet ? 'Set' : 'None'}</KV>
        <KV label="Rescue key">{mandate.rescueSet ? 'Set' : 'None'}</KV>
      </div>
      {footer && <div className="mt-3 border-t hairline pt-3">{footer}</div>}
    </Panel>
  )
}
