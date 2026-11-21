import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import SpendGauge from '../components/SpendGauge'

interface SimulationResult {
  id: number
  amountSats: number
  accepted: boolean
  reason: string
}

function parseSats(value: string): number {
  const sats = Number(value)
  return Number.isSafeInteger(sats) && sats >= 0 ? sats : 0
}

function parseBchToSats(value: string): number {
  if (!value.trim()) return 0
  const amountBch = Number(value)
  if (!Number.isFinite(amountBch) || amountBch <= 0) return Number.NaN
  const amountSats = Math.round(amountBch * 1e8)
  return Number.isSafeInteger(amountSats) ? amountSats : Number.NaN
}

/** Local, illustrative mandate calculator. It does not execute the covenant. */
export default function Simulate() {
  const [dailyLimit, setDailyLimit] = useState(10_000)
  const [spentToday, setSpentToday] = useState(0)
  const [payAmount, setPayAmount] = useState('')
  const [allowlistOn, setAllowlistOn] = useState(false)
  const [allowedDestination, setAllowedDestination] = useState('demo-recipient')
  const [payTo, setPayTo] = useState('')
  const [results, setResults] = useState<SimulationResult[]>([])
  const nextResultId = useRef(0)

  const paySats = parseBchToSats(payAmount)
  const validAmount = Number.isSafeInteger(paySats) && paySats > 0

  const verdict = useMemo(() => {
    if (!Number.isSafeInteger(paySats) || paySats <= 0) {
      return { ok: false, reason: 'Enter a positive amount that fits in satoshis.' }
    }
    if (spentToday + paySats > dailyLimit) {
      return {
        ok: false,
        reason: `Over daily limit: ${spentToday + paySats} > ${dailyLimit} sats.`,
      }
    }
    if (allowlistOn) {
      const destination = payTo.trim()
      const allowed = allowedDestination.trim()
      if (!destination) return { ok: false, reason: 'Enter a destination.' }
      if (!allowed) return { ok: false, reason: 'Set an allowed destination first.' }
      if (destination !== allowed) {
        return { ok: false, reason: 'Destination does not exactly match the allowlisted text.' }
      }
    }
    return { ok: true, reason: 'Would pass the enabled simulated checks.' }
  }, [paySats, spentToday, dailyLimit, allowlistOn, payTo, allowedDestination])

  const simulatePay = () => {
    if (!validAmount) return

    const result: SimulationResult = {
      id: ++nextResultId.current,
      amountSats: paySats,
      accepted: verdict.ok,
      reason: verdict.reason,
    }
    setResults((previous) => [result, ...previous].slice(0, 10))
    if (verdict.ok) setSpentToday((previous) => previous + paySats)
    setPayAmount('')
  }

  return (
    <div className="page-enter space-y-4">
      <h1 className="page-title">Simulator</h1>
      <p className="text-sm text-nomos-muted">
        Try the daily limit and allowlist without a wallet. Nothing is sent; this runs only in your browser.
      </p>

      <section className="card p-5" aria-labelledby="simulation-budget-title">
        <h2 id="simulation-budget-title" className="mb-4 text-[15px] font-semibold text-nomos-text">Budget</h2>
        <div className="flex flex-col items-center gap-5 sm:flex-row">
          <SpendGauge spentSats={spentToday} limitSats={dailyLimit} />
          <div className="w-full flex-1 space-y-3">
            <div>
              <label htmlFor="sim-daily-limit" className="label mb-1.5 block">Daily limit (sats)</label>
              <input
                id="sim-daily-limit"
                type="number"
                min="0"
                step="1"
                value={dailyLimit}
                onChange={(event) => setDailyLimit(parseSats(event.target.value))}
                className="input"
              />
            </div>
            <div>
              <label htmlFor="sim-spent-today" className="label mb-1.5 block">Spent today (sats)</label>
              <input
                id="sim-spent-today"
                type="number"
                min="0"
                step="1"
                value={spentToday}
                onChange={(event) => setSpentToday(parseSats(event.target.value))}
                className="input"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="card p-5" aria-labelledby="simulation-allowlist-title">
        <div className="flex items-center justify-between gap-4">
          <h2 id="simulation-allowlist-title" className="text-[15px] font-semibold text-nomos-text">Allowlist</h2>
          <button
            type="button"
            aria-pressed={allowlistOn}
            onClick={() => setAllowlistOn((enabled) => !enabled)}
            className={`rounded-lg border hairline-strong px-3 py-1 text-sm font-medium transition-colors ${
              allowlistOn ? 'bg-nomos-accent text-nomos-on-accent' : 'bg-nomos-surface text-nomos-muted'
            }`}
          >
            {allowlistOn ? 'On' : 'Off'}
          </button>
        </div>
        {allowlistOn && (
          <div className="mt-3">
            <label htmlFor="sim-allowed-destination" className="label mb-1.5 block">
              Allowed destination
            </label>
            <input
              id="sim-allowed-destination"
              type="text"
              value={allowedDestination}
              onChange={(event) => setAllowedDestination(event.target.value)}
              className="input"
              autoComplete="off"
            />
            <p className="mt-1 text-sm text-nomos-muted">Compared as plain text here.</p>
          </div>
        )}
      </section>

      <form
        className="card space-y-3 p-5"
        onSubmit={(event) => {
          event.preventDefault()
          simulatePay()
        }}
      >
        <h2 className="text-[15px] font-semibold text-nomos-text">Try a payment</h2>
        <div>
          <label htmlFor="sim-amount" className="label mb-1.5 block">Amount (BCH)</label>
          <input
            id="sim-amount"
            type="number"
            min="0"
            step="0.00000001"
            value={payAmount}
            onChange={(event) => setPayAmount(event.target.value)}
            placeholder="0.0001"
            className="input"
          />
        </div>
        {allowlistOn && (
          <div>
            <label htmlFor="sim-pay-to" className="label mb-1.5 block">Destination text</label>
            <input
              id="sim-pay-to"
              type="text"
              value={payTo}
              onChange={(event) => setPayTo(event.target.value)}
              placeholder="Enter the same text as the allowlisted destination"
              className="input"
              autoComplete="off"
            />
          </div>
        )}

        {payAmount && (
          <div
            role="status"
            aria-live="polite"
            className={`text-sm ${verdict.ok ? 'text-nomos-muted-bright' : 'text-nomos-refuse'}`}
          >
            {verdict.reason}
          </div>
        )}

        <button
          type="submit"
          disabled={!validAmount}
          className="btn-primary w-full"
        >
          Try it
        </button>
      </form>

      {results.length > 0 && (
        <section className="card p-5" aria-labelledby="simulation-log-title">
          <h2 id="simulation-log-title" className="mb-1 text-[15px] font-semibold text-nomos-text">Results</h2>
          <ul className="divide-hairline">
            {results.map((result) => (
              <li key={result.id} className="py-2.5">
                <div className="flex items-center justify-between gap-3 text-[15px]">
                  <span className="tabular-nums text-nomos-text">{(result.amountSats / 1e8).toFixed(8)} BCH</span>
                  <span className={result.accepted ? 'text-nomos-ok' : 'text-nomos-refuse'}>
                    {result.accepted ? 'Would pay' : 'Would refuse'}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-nomos-muted">{result.reason}</p>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => {
              setResults([])
              setSpentToday(0)
            }}
            className="btn-ghost mt-3 w-full"
          >
            Start a new day
          </button>
        </section>
      )}

      <section className="card space-y-3 p-5" aria-labelledby="simulation-rules-title">
        <h2 id="simulation-rules-title" className="text-[15px] font-semibold text-nomos-text">What the real contract checks</h2>
        <ol className="space-y-1.5 text-sm text-nomos-muted-bright">
          <li>1. The owner or agent key signed it.</li>
          <li>2. Spent today plus this payment stays within the daily limit.</li>
          <li>3. If the allowlist is on, the address is on it.</li>
          <li>4. The vault continues with its spending total updated.</li>
        </ol>
      </section>
    </div>
  )
}
