import { Link } from 'react-router-dom'

interface Layer {
  label: string
  items: string[]
  tone: 'accent' | 'muted' | 'warning'
}

const LAYERS: Layer[] = [
  {
    label: 'Frontend pages',
    items: [
      'Connect', 'Vault', 'Mandate', 'Pay', 'Activity', 'Proof',
      'Rescue', 'Bridge', 'Identity', 'Simulate', 'Architecture',
    ],
    tone: 'accent',
  },
  {
    label: 'Application layer',
    items: ['WalletContext', 'wallet.ts', 'contract.ts', 'nostr.ts', 'proofs.ts', 'theme.ts'],
    tone: 'muted',
  },
  {
    label: 'External services',
    items: ['WizardConnect / WalletConnect', 'Electrum provider', 'NIP-05 domains and Nostr relays'],
    tone: 'accent',
  },
  {
    label: 'Bitcoin Cash network',
    items: ['NomosVault covenant', 'StableSwap prototype', 'HTLC prototype'],
    tone: 'warning',
  },
]

const layerToneClasses: Record<Layer['tone'], string> = {
  accent: 'text-nomos-accent',
  muted: 'text-nomos-muted-bright',
  warning: 'text-amber-400',
}

interface ContractRow {
  name: string
  file: string
  purpose: string
  status: 'Chipnet evidence' | 'Mock tested' | 'Prototype'
}

const CONTRACTS: ContractRow[] = [
  {
    name: 'NomosVault · CashScript',
    file: 'contracts/NomosVault.cash',
    purpose: 'BCH spend mandate: daily limit, optional allowlist, state continuity, and rescue path.',
    status: 'Chipnet evidence',
  },
  {
    name: 'NomosVault · SolidCash',
    file: 'contracts/solidcash/NomosVault.scash',
    purpose: 'SolidCash vault implementation with mock-network coverage and a chipnet demo script.',
    status: 'Mock tested',
  },
  {
    name: 'StableSwap',
    file: 'contracts/solidcash/StableSwap.scash',
    purpose: 'Experimental BCH / configured CashToken pool; mock tests only, no verified PUSD deployment.',
    status: 'Prototype',
  },
  {
    name: 'HashedTimeLock',
    file: 'contracts/solidcash/HashedTimeLock.scash',
    purpose: 'BCH-only hash-preimage claim and timestamp-refund prototype; not a cross-chain bridge.',
    status: 'Prototype',
  },
]

const statusClasses: Record<ContractRow['status'], string> = {
  'Chipnet evidence': 'bg-nomos-accent/15 text-nomos-accent',
  'Mock tested': 'bg-amber-400/15 text-amber-400',
  Prototype: 'bg-nomos-muted/15 text-nomos-muted-bright',
}

interface CoverageRow {
  track: string
  repository: string
  boundary: string
}

const COVERAGE: CoverageRow[] = [
  {
    track: 'BCH BLAZE 2026 · Mainnet track',
    repository: 'NomosVault covenant and published chipnet transaction evidence',
    boundary: 'Chipnet evidence is not a mainnet deployment claim.',
  },
  {
    track: 'Build with XO',
    repository: 'xo/nomos.template.json with 14 offline parser/compiler checks',
    boundary: 'Not yet run in the XO live engine.',
  },
  {
    track: 'Best SolidCash App',
    repository: 'Vault, StableSwap, and BCH-side HTLC source with mock-network tests',
    boundary: 'StableSwap and HTLC remain prototypes, not deployed services.',
  },
  {
    track: 'Stablecoin Bridge',
    repository: 'StableSwap / HTLC prototypes and a disabled Bridge preview',
    boundary: 'No PUSD pool or cross-chain integration is claimed.',
  },
  {
    track: 'Decentralized Identity',
    repository: 'Nostr pay-by-name resolution and standalone identity lookup',
    boundary: 'NIP-05 domains and public relays are external dependencies.',
  },
  {
    track: 'Community Choice',
    repository: 'EMBER2026 vote address listed in the README and banner',
    boundary: 'No voting result is claimed.',
  },
  {
    track: 'Migrate to XO',
    repository: 'XO template byte-matched against CashScript in offline checks',
    boundary: 'This does not demonstrate an XO live-engine run.',
  },
]

export default function Architecture() {
  return (
    <div className="page-enter space-y-6">
      <header>
        <Link to="/" className="text-xs text-nomos-muted transition-colors hover:text-nomos-accent">
          ← Home
        </Link>
        <h1 className="mt-3 font-mono text-2xl font-bold text-nomos-text">Architecture</h1>
        <p className="mt-2 text-sm leading-relaxed text-nomos-muted">
          How the browser app, wallet providers, BCH network, and experimental
          contracts fit together. No Nomos server holds wallet keys or signs
          transactions.
        </p>
      </header>

      <section className="card space-y-1 p-5" aria-labelledby="architecture-stack-title">
        <h2 id="architecture-stack-title" className="label mb-3">System stack</h2>
        {LAYERS.map((layer, index) => (
          <div key={layer.label}>
            <div className="rounded-xl bg-nomos-surface-raised/60 px-4 py-3">
              <p className={`mb-2 text-[10px] font-semibold uppercase tracking-wider ${layerToneClasses[layer.tone]}`}>
                {layer.label}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {layer.items.map((item) => (
                  <span
                    key={item}
                    className="rounded-lg bg-nomos-bg/60 px-2 py-1 font-mono text-[10px] text-nomos-text"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
            {index < LAYERS.length - 1 && (
              <div className="flex justify-center py-0.5" aria-hidden="true">
                <span className="text-xs text-nomos-muted/40">↓</span>
              </div>
            )}
          </div>
        ))}
      </section>

      <section className="card space-y-3 p-5" aria-labelledby="architecture-flow-title">
        <h2 id="architecture-flow-title" className="label">Data flow</h2>
        <ol className="space-y-2 text-xs leading-relaxed text-nomos-muted-bright">
          <li>
            <strong className="text-nomos-text">1. Wallet pairs.</strong>{' '}
            WizardConnect or WalletConnect connects a wallet provider; signing
            requests go to that provider.
          </li>
          <li>
            <strong className="text-nomos-text">2. Vault state loads.</strong>{' '}
            The browser uses the Electrum provider through <code>contract.ts</code>
            to read BCH UTXOs and decode the vault state.
          </li>
          <li>
            <strong className="text-nomos-text">3. A payment is prepared.</strong>{' '}
            CashScript builds the covenant transaction and the connected wallet
            is asked to sign it. Frontend preflight checks are not consensus rules.
          </li>
          <li>
            <strong className="text-nomos-text">4. BCH nodes validate.</strong>{' '}
            The covenant script enforces its rules when a transaction is
            submitted; an invalid spend is rejected by the network.
          </li>
        </ol>
      </section>

      <section className="card p-5" aria-labelledby="architecture-contracts-title">
        <h2 id="architecture-contracts-title" className="label mb-3">Contract surfaces</h2>
        <ul className="space-y-2">
          {CONTRACTS.map((contract) => (
            <li key={contract.name} className="rounded-xl bg-nomos-surface-raised/40 px-4 py-3">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-mono text-sm font-semibold text-nomos-text">{contract.name}</h3>
                <span className={`rounded-pill px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${statusClasses[contract.status]}`}>
                  {contract.status}
                </span>
              </div>
              <p className="mb-1 break-all font-mono text-[10px] text-nomos-muted">{contract.file}</p>
              <p className="text-xs leading-relaxed text-nomos-muted-bright">{contract.purpose}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[10px] leading-relaxed text-nomos-muted">
          These labels describe repository evidence only; they are not an audit,
          safety guarantee, mainnet deployment record, or proof of live PUSD.
          See the{' '}
          <a href="https://github.com/thereal-awetoby/nomos/blob/main/README.md" target="_blank" rel="noreferrer" className="text-nomos-accent hover:underline">README</a>{' '}
          and{' '}
          <a href="https://github.com/thereal-awetoby/nomos/blob/main/docs/MAINNET_PROOFS.md" target="_blank" rel="noreferrer" className="text-nomos-accent hover:underline">mainnet proof checklist</a>.
        </p>
      </section>

      <section className="card space-y-3 p-5" aria-labelledby="architecture-security-title">
        <h2 id="architecture-security-title" className="label">Security boundaries</h2>
        <ul className="space-y-2 text-xs leading-relaxed text-nomos-muted-bright">
          <li>
            <strong className="text-nomos-accent">Wallet custody.</strong>{' '}
            The application requests signatures from the connected wallet; it
            does not receive the wallet's signing key. Verify important state
            with the wallet and a trusted explorer.
          </li>
          <li>
            <strong className="text-nomos-accent">Covenant state.</strong>{' '}
            NomosVault carries spend state in a CashTokens NFT commitment. For
            ordinary payments, the covenant requires output 0 to recreate the
            vault with updated state; mandate changes and rescue use their
            defined paths.
          </li>
          <li>
            <strong className="text-nomos-accent">Rescue path.</strong>{' '}
            The covenant's emergency path requires the configured owner and
            co-signer; one party alone cannot satisfy the two-signature path.
          </li>
          <li>
            <strong className="text-nomos-accent">Nostr lookups.</strong>{' '}
            Event signatures are checked client-side, but NIP-05 domains and
            public relays are external. Relays may withhold or serve stale events.
          </li>
          <li>
            <strong className="text-nomos-accent">Simulator.</strong>{' '}
            The simulator is local illustrative logic only. It neither executes
            the covenant nor proves on-chain behavior.
          </li>
        </ul>
      </section>

      <section className="card p-5" aria-labelledby="architecture-coverage-title">
        <h2 id="architecture-coverage-title" className="label mb-2">Repository / track coverage</h2>
        <p className="mb-4 text-[10px] leading-relaxed text-nomos-muted">
          This inventory describes code and validation present in the repository,
          not bounty eligibility, judging, awards, audit, or deployment claims.
        </p>
        <ul className="space-y-3">
          {COVERAGE.map((row) => (
            <li key={row.track} className="border-t border-nomos-border/10 pt-3 first:border-0 first:pt-0">
              <h3 className="text-xs font-medium text-nomos-text">{row.track}</h3>
              <p className="mt-1 text-[10px] leading-relaxed text-nomos-muted-bright">{row.repository}</p>
              <p className="mt-1 text-[10px] leading-relaxed text-nomos-muted">{row.boundary}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="card space-y-3 p-5" aria-labelledby="architecture-validation-title">
        <h2 id="architecture-validation-title" className="label">Validation commands</h2>
        <div className="space-y-1 rounded-xl bg-nomos-bg/60 px-4 py-3 font-mono text-[10px] text-nomos-muted-bright">
          <p><span className="text-nomos-accent">$</span> cd contracts/solidcash &amp;&amp; npm test</p>
          <p className="pl-3 text-nomos-muted">→ Vault, StableSwap, and HTLC mock-network tests</p>
          <p><span className="text-nomos-accent">$</span> cd xo &amp;&amp; npm test</p>
          <p className="pl-3 text-nomos-muted">→ 14 offline XO template checks</p>
          <p><span className="text-nomos-accent">$</span> cd frontend &amp;&amp; npm run build</p>
          <p className="pl-3 text-nomos-muted">→ TypeScript check and production bundle</p>
        </div>
      </section>

      <nav aria-label="Explore Nomos" className="flex flex-wrap gap-2">
        <a
          href="https://github.com/thereal-awetoby/nomos"
          target="_blank"
          rel="noreferrer"
          className="btn-ghost flex-1 py-2.5 text-center text-xs"
        >
          GitHub →
        </a>
        <Link to="/simulate" className="btn-ghost flex-1 py-2.5 text-center text-xs">
          Simulator
        </Link>
        <Link to="/proof" className="btn-ghost flex-1 py-2.5 text-center text-xs">
          Proof checker
        </Link>
        <Link to="/identity" className="btn-ghost flex-1 py-2.5 text-center text-xs">
          Nostr lookup
        </Link>
      </nav>
    </div>
  )
}
