import type { ReactNode } from 'react'
import type { ReceiptKind, TxStatus } from '../lib/types'

// ── Formatting ─────────────────────────────────────────────

export function fmtBch(sats: number): string {
  return (sats / 1e8).toFixed(8)
}

export function fmtSats(sats: number): string {
  return sats.toLocaleString('en-US')
}

/** Keep the prefix and both ends of an address or hash readable. */
export function shortAddr(value: string, head = 8, tail = 6): string {
  if (!value) return ''
  const [prefix, body] = value.includes(':') ? value.split(':', 2) : ['', value]
  const core = body.length > head + tail + 1 ? `${body.slice(0, head)}…${body.slice(-tail)}` : body
  return prefix ? `${prefix}:${core}` : core
}

// ── Brand mark ─────────────────────────────────────────────

/** Pixel-grid N used as the Nomos mark. */
export function Mark({ size = 22, className = '' }: { size?: number; className?: string }) {
  // 5×5 grid; 1 = filled cell.
  const cells = [
    1, 0, 0, 0, 1,
    1, 1, 0, 0, 1,
    1, 0, 1, 0, 1,
    1, 0, 0, 1, 1,
    1, 0, 0, 0, 1,
  ]
  return (
    <svg width={size} height={size} viewBox="0 0 5 5" aria-hidden="true" className={className} shapeRendering="crispEdges">
      {cells.map((on, i) => on
        ? <rect key={i} x={i % 5} y={Math.floor(i / 5)} width="1" height="1" fill="currentColor" />
        : null)}
    </svg>
  )
}

// ── Panels ─────────────────────────────────────────────────

export function Panel({
  title,
  right,
  children,
  className = '',
  bodyClassName = 'p-3',
  tone = 'neutral',
  as: Tag = 'section',
  id,
}: {
  title?: ReactNode
  right?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  tone?: 'neutral' | 'paid' | 'refused' | 'pending'
  as?: 'section' | 'div' | 'article'
  id?: string
}) {
  const toneStyle = tone === 'paid'
    ? { borderColor: 'rgb(var(--nomos-accent) / 0.55)' }
    : tone === 'refused'
      ? { borderColor: 'rgb(var(--nomos-refuse) / 0.6)' }
      : tone === 'pending'
        ? { borderColor: 'rgb(var(--nomos-pending) / 0.55)' }
        : undefined
  return (
    <Tag id={id} className={`card overflow-hidden ${className}`} style={toneStyle}>
      {(title || right) && (
        <div className="panel-head">
          <span className="min-w-0 truncate">{title}</span>
          {right && <span className="flex shrink-0 items-center gap-2">{right}</span>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </Tag>
  )
}

export function KV({ label, children, tone }: { label: ReactNode; children: ReactNode; tone?: 'paid' | 'refused' | 'pending' | 'muted' }) {
  const color = tone === 'paid'
    ? 'text-nomos-accent'
    : tone === 'refused'
      ? 'text-nomos-refuse'
      : tone === 'pending'
        ? 'text-nomos-pending'
        : tone === 'muted'
          ? 'text-nomos-muted-bright'
          : ''
  return (
    <div className="kv">
      <span>{label}</span>
      <span className={color}>{children}</span>
    </div>
  )
}

// ── Status chips ───────────────────────────────────────────

export type ChipKind = TxStatus | ReceiptKind | 'under' | 'over' | 'on' | 'off' | 'sample'

const CHIP: Record<ChipKind, { cls: string; text: string }> = {
  paid: { cls: 'chip-paid', text: 'Paid' },
  submitted: { cls: 'chip-pending', text: 'Unconfirmed' },
  refused: { cls: 'chip-refused', text: 'Refused' },
  payment: { cls: 'chip-neutral', text: 'Payment' },
  under: { cls: 'chip-paid', text: 'Under limit' },
  over: { cls: 'chip-refused', text: 'Would refuse' },
  on: { cls: 'chip-paid', text: 'On' },
  off: { cls: 'chip-neutral', text: 'Off' },
  sample: { cls: 'chip-neutral', text: 'Sample data' },
  rescue: { cls: 'chip-refused', text: 'Rescue' },
  mandate: { cls: 'chip-neutral', text: 'Mandate' },
}

export function Chip({ kind, children }: { kind: ChipKind; children?: ReactNode }) {
  const c = CHIP[kind]
  return <span className={`chip ${c.cls}`}>{children ?? c.text}</span>
}

export function NetworkChip() {
  const isChipnet = ((import.meta.env.VITE_BCH_NETWORK as string) || 'mainnet') === 'chipnet'
  return <span className={`chip ${isChipnet ? 'chip-pending' : 'chip-neutral'}`}>{isChipnet ? 'Chipnet' : 'Mainnet'}</span>
}
