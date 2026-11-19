import { useState } from 'react'

type Tab = 'swap' | 'bridge-in' | 'bridge-out'

const tabs: { key: Tab; label: string }[] = [
  { key: 'swap', label: 'Swap' },
  { key: 'bridge-in', label: 'Bridge In' },
  { key: 'bridge-out', label: 'Bridge Out' },
]

export default function Bridge() {
  const [tab, setTab] = useState<Tab>('swap')

  return (
    <div className="page-enter space-y-5">
      <header>
        <p className="label">Nomos · BCH</p>
        <h1 className="page-title mt-2">Get BCH / Get PUSD</h1>
        <p className="mt-2 text-sm leading-relaxed text-nomos-muted">
          Preview the planned BCH/PUSD swap and cross-chain bridge flows.
        </p>
      </header>

      <div className="card border-nomos-pending/20 bg-nomos-pending/[0.04] p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-nomos-text">Bridge and pool are not live</p>
          <span className="rounded-pill bg-nomos-pending/15 px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-wider text-nomos-pending">
            Preview only
          </span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-nomos-muted">
          No verified PUSD category, deployed StableSwap pool, or cross-chain partner is configured. Inputs and actions are disabled; do not send funds to a pool address from this page.
        </p>
      </div>

      <div className="card grid grid-cols-3 gap-px overflow-hidden" style={{ background: 'var(--line)' }}>
        {[
          { label: 'Last swap', value: 'None' },
          { label: 'Last bridge', value: 'None' },
          { label: 'PUSD category', value: 'Not set' },
        ].map((cell) => (
          <div key={cell.label} className="bg-nomos-surface px-3 py-2">
            <p className="label">{cell.label}</p>
            <p className="mt-0.5 font-mono text-xs text-nomos-muted-bright">{cell.value}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-1 rounded-2xl bg-nomos-surface-raised/60 p-1" role="tablist" aria-label="Bridge options">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            id={`bridge-tab-${key}`}
            type="button"
            role="tab"
            aria-selected={tab === key}
            aria-controls={`bridge-panel-${key}`}
            onClick={() => setTab(key)}
            className={`flex-1 rounded-xl px-2 py-2 text-xs font-medium transition-colors ${
              tab === key
                ? 'bg-nomos-accent/15 text-nomos-accent'
                : 'text-nomos-muted hover:text-nomos-text'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <section
        id="bridge-panel-swap"
        className="card space-y-4 p-5"
        role="tabpanel"
        aria-labelledby="bridge-tab-swap"
        hidden={tab !== 'swap'}
        tabIndex={0}
      >
        <div>
          <p className="label mb-2">BCH ↔ PUSD swap</p>
          <p className="text-xs text-nomos-muted">A same-chain constant-product pool is under development.</p>
        </div>
        <AssetRow label="You pay" asset="BCH or PUSD" />
        <AssetRow label="Estimated receive" asset="—" />
        <p className="text-[11px] leading-relaxed text-nomos-muted">
          0.3% is the proposed pool fee, not a live quote. Token metadata, pricing, and deployment remain unverified.
        </p>
        <button className="btn-primary w-full" type="button" disabled>Swap unavailable</button>
      </section>

      <section
        id="bridge-panel-bridge-in"
        className="card space-y-4 p-5"
        role="tabpanel"
        aria-labelledby="bridge-tab-bridge-in"
        hidden={tab !== 'bridge-in'}
        tabIndex={0}
      >
        <div>
          <p className="label mb-2">Bridge In · other-chain stablecoins to BCH</p>
          <p className="text-xs leading-relaxed text-nomos-muted">
            A source-chain lock and verified release path have not been integrated. The BCH-side HTLC is a local prototype only.
          </p>
        </div>
        <AssetRow label="Source asset" asset="USDC · network TBD" />
        <AssetRow label="Receive on BCH" asset="PUSD · not configured" />
        <button className="btn-primary w-full" type="button" disabled>Bridge In unavailable</button>
      </section>

      <section
        id="bridge-panel-bridge-out"
        className="card space-y-4 p-5"
        role="tabpanel"
        aria-labelledby="bridge-tab-bridge-out"
        hidden={tab !== 'bridge-out'}
        tabIndex={0}
      >
        <div>
          <p className="label mb-2">Bridge Out · BCH to other-chain stablecoins</p>
          <p className="text-xs leading-relaxed text-nomos-muted">
            No PUSD lock/burn flow or destination-chain release contract is deployed.
          </p>
        </div>
        <AssetRow label="Send from BCH" asset="PUSD · not configured" />
        <AssetRow label="Destination" asset="Network and address unavailable" />
        <button className="btn-primary w-full" type="button" disabled>Bridge Out unavailable</button>
      </section>

      <section className="card space-y-3 p-4">
        <div>
          <p className="label">External links</p>
          <p className="mt-1 text-[10px] text-nomos-muted">
            These sites are not integrated into the swap or bridge. Verify any service independently before use.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="https://mercar.asgaya.org/"
            target="_blank"
            rel="noreferrer"
            className="rounded-xl bg-nomos-accent/10 px-3 py-1.5 text-xs font-medium text-nomos-accent transition-colors hover:bg-nomos-accent/20"
          >
            Mercar
          </a>
          <a
            href="https://asgaya.org/"
            target="_blank"
            rel="noreferrer"
            className="rounded-xl bg-nomos-accent/10 px-3 py-1.5 text-xs font-medium text-nomos-accent transition-colors hover:bg-nomos-accent/20"
          >
            Asgaya
          </a>
        </div>
      </section>

      <p className="text-center text-[10px] text-nomos-muted/70">
        This is not yet a transaction interface or a deployed cross-chain bridge.
      </p>
    </div>
  )
}

function AssetRow({ label, asset }: { label: string; asset: string }) {
  return (
    <div>
      <p className="label mb-2">{label}</p>
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-nomos-surface-raised/60 px-4 py-3">
        <input
          type="text"
          placeholder="—"
          disabled
          aria-label={`${label}: unavailable`}
          className="min-w-0 flex-1 bg-transparent font-mono text-sm text-nomos-muted outline-none"
        />
        <span className="shrink-0 text-right font-mono text-xs text-nomos-muted-bright">{asset}</span>
      </div>
    </div>
  )
}
