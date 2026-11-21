import { useEffect, useState } from 'react'

// ── The landing's example vault ─────────────────────────────
// A 5,000-sat daily limit. Two payments fit; a third would take the day
// to 5,500, crosses the limit line and is refused. The node's answer is
// the one a mainnet node gave Nomos for a real over-limit payment.

const LIMIT = 5_000
const FIRST = 2_000
const SECOND = 2_500
const OVER = 1_000
const NODE_ANSWER = 'mandatory-script-verify-flag-failed (Script failed an OP_VERIFY operation)'

// 0 empty, 1 first paid, 2 second paid, 3 third crossing the line, 4 refused
type Step = 0 | 1 | 2 | 3 | 4
// The coins float for a moment first, then drop in one by one.
const TIMELINE: [Step, number][] = [[1, 1400], [2, 2400], [3, 3400], [4, 3950]]

const sats = (n: number) => n.toLocaleString('en-US')
const share = (n: number) => `${(n / LIMIT) * 100}%`

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

function Mark({ ok }: { ok: boolean }) {
  return (
    <span
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${ok ? 'bg-land-pass text-land-on-pass' : 'bg-land-refuse text-white'}`}
      aria-hidden="true"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
        <path d={ok ? 'M5 12.5l4.5 4.5L19 7.5' : 'M7 7l10 10M17 7 7 17'} />
      </svg>
    </span>
  )
}

export default function LimitDemo() {
  const [step, setStep] = useState<Step>(() => (reducedMotion() ? 4 : 0))
  const [run, setRun] = useState(0)

  useEffect(() => {
    if (reducedMotion()) {
      setStep(4)
      return undefined
    }
    setStep(0)
    const timers = TIMELINE.map(([next, at]) => window.setTimeout(() => setStep(next), at))
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [run])

  const spent = (step >= 1 ? FIRST : 0) + (step >= 2 ? SECOND : 0)

  return (
    <figure className="rounded-[22px] border l-hair bg-land-raised p-5 sm:p-7">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <span className="text-[15px] font-semibold text-land-ink">Example: a vault with a 5,000-sat daily limit</span>
        <span className="text-[15px] tabular-nums text-land-muted">
          Spent today <span className="font-semibold text-land-ink">{sats(spent)}</span> of {sats(LIMIT)}
        </span>
      </figcaption>

      <p className="sr-only">
        The vault pays {sats(FIRST)} sats, then {sats(SECOND)} sats. A third payment of {sats(OVER)} sats would make
        {' '}{sats(FIRST + SECOND + OVER)} for the day, over the limit, so the network refuses it: {NODE_ANSWER}.
      </p>

      {/* Keyed by run, so Replay starts from an empty track instead of shrinking it. */}
      <div key={run} className="mt-24" aria-hidden="true">
        <div className="limit-track">
          {/* Each payment is a coin that drops into the bar; the last one hits the limit and bounces off. */}
          <span className={`coin ${step >= 1 ? 'is-dropped' : 'is-floating'}`} style={{ left: share(FIRST / 2) }}>{sats(FIRST)}</span>
          <span className={`coin coin-delay-1 ${step >= 2 ? 'is-dropped' : 'is-floating'}`} style={{ left: share(FIRST + SECOND / 2) }}>{sats(SECOND)}</span>
          <span className={`coin coin-delay-2 coin-over ${step >= 4 ? 'is-bounced' : step >= 3 ? 'is-hitting' : 'is-floating'}`}>{sats(OVER)}</span>
          <span className={`limit-seg is-paid ${step >= 1 ? 'is-shown' : ''}`} style={{ left: 0, width: step >= 1 ? `calc(${share(FIRST)} - 3px)` : 0 }}>
            <span className="limit-seg-label">{sats(FIRST)}</span>
          </span>
          <span className={`limit-seg is-paid ${step >= 2 ? 'is-shown' : ''}`} style={{ left: share(FIRST), width: step >= 2 ? `calc(${share(SECOND)} - 3px)` : 0 }}>
            <span className="limit-seg-label">{sats(SECOND)}</span>
          </span>
          <span
            className={`limit-seg is-attempt ${step >= 4 ? 'is-refused is-shown' : ''}`}
            style={{ left: share(FIRST + SECOND), width: step >= 3 ? share(OVER) : 0 }}
          >
          </span>
          <span className={`limit-line ${step >= 4 ? 'is-hit' : ''}`}>
            <span className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[12px] font-bold text-land-rule-line">Limit</span>
          </span>
        </div>

        <ol className="mt-7 space-y-3">
          <li className={`limit-row flex items-center gap-3 ${step >= 1 ? 'is-shown' : ''}`}>
            <Mark ok />
            <span className="text-[15px] text-land-ink">Paid {sats(FIRST)} sats</span>
          </li>
          <li className={`limit-row flex items-center gap-3 ${step >= 2 ? 'is-shown' : ''}`}>
            <Mark ok />
            <span className="text-[15px] text-land-ink">Paid {sats(SECOND)} sats</span>
          </li>
          <li className={`limit-row flex items-start gap-3 ${step >= 4 ? 'is-shown' : ''}`}>
            <Mark ok={false} />
            <span className="min-w-0">
              <span className="block text-[15px] text-land-ink">
                Refused {sats(OVER)} sats: {sats(FIRST + SECOND + OVER)} would be over the limit
              </span>
              <span className="mt-1 block font-mono text-[12.5px] leading-relaxed text-land-muted">{NODE_ANSWER}</span>
            </span>
          </li>
        </ol>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={() => setRun((r) => r + 1)}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-land-muted transition-colors hover:bg-land-ink/5 hover:text-land-ink"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />
          </svg>
          Replay
        </button>
      </div>
    </figure>
  )
}
