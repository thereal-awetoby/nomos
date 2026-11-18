import { Link } from 'react-router-dom'

export default function Bridge() {
  return (
    <div className="page-enter space-y-5">
      <Link to="/vault" className="text-xs text-nomos-muted hover:text-nomos-accent transition-colors duration-200">
        ← Back to vault
      </Link>

      <header>
        <p className="label">Nomos · BCH</p>
        <h1 className="mt-2 font-mono text-2xl font-bold text-nomos-text">Bridge &amp; Swap</h1>
        <p className="mt-2 text-sm leading-relaxed text-nomos-muted">
          Planned BCH ↔ PUSD conversion through a same-chain CashTokens pool.
        </p>
      </header>

      <div className="card border-amber-400/20 bg-amber-400/[0.04] p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-nomos-text">Pool not deployed</p>
          <span className="rounded-pill bg-amber-400/15 px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-wider text-amber-500">
            Coming soon
          </span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-nomos-muted">
          No verified PUSD category or live pool is configured for this network. Swap actions are disabled; do not send funds to a pool address from this preview.
        </p>
      </div>

      <section className="card space-y-4 p-5" aria-label="Swap preview">
        <div>
          <p className="label mb-2">You pay</p>
          <div className="flex items-center gap-3 rounded-2xl bg-nomos-surface-raised/60 px-4 py-3">
            <input
              className="min-w-0 flex-1 bg-transparent font-mono text-lg text-nomos-muted outline-none"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              disabled
              aria-label="BCH amount, unavailable"
            />
            <span className="font-mono text-sm font-semibold text-nomos-text">BCH</span>
          </div>
        </div>

        <div className="flex justify-center" aria-hidden="true">
          <span className="rounded-pill border border-nomos-border/10 px-3 py-1 text-xs text-nomos-muted">↓</span>
        </div>

        <div>
          <p className="label mb-2">You receive</p>
          <div className="flex items-center gap-3 rounded-2xl bg-nomos-surface-raised/60 px-4 py-3">
            <input
              className="min-w-0 flex-1 bg-transparent font-mono text-lg text-nomos-muted outline-none"
              type="text"
              placeholder="—"
              disabled
              aria-label="PUSD estimate, unavailable"
            />
            <span className="font-mono text-sm font-semibold text-nomos-text">PUSD</span>
          </div>
        </div>

        <p className="text-[11px] leading-relaxed text-nomos-muted">
          A 0.3% pool fee is the proposed design, not a live quote. Final pricing, token metadata, and network support are pending verification.
        </p>
        <button className="btn-primary w-full opacity-50" type="button" disabled>
          Swaps unavailable
        </button>
      </section>

      <p className="text-center text-[10px] text-nomos-muted/70">
        This is a UI placeholder, not a cross-chain bridge or a transaction interface.
      </p>
    </div>
  )
}
