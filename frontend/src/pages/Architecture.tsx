import { Link } from 'react-router-dom'

const REPO = 'https://github.com/thereal-awetoby/nomos'

const LAYERS: { label: string; items: string[] }[] = [
  { label: 'App (in your browser)', items: ['Vault', 'Pay', 'Rules', 'Activity', 'Proof checker', 'Swap', 'Nostr identity'] },
  { label: 'Wallets', items: ['WizardConnect wallets: Paytaca, Selene, Cashonize', 'WalletConnect', 'Any EVM wallet for Base'] },
  { label: 'Networks', items: ['BCH nodes (Electrum)', 'Nostr relays', 'Base'] },
]

const CONTRACTS: { name: string; file: string; purpose: string; status: string }[] = [
  {
    name: 'NomosVault (CashScript)',
    file: 'contracts/NomosVault.cash',
    purpose: 'Daily limit, optional allowlist, agent key and rescue path.',
    status: 'Run on mainnet',
  },
  {
    name: 'NomosVault (SolidCash)',
    file: 'contracts/solidcash/NomosVault.scash',
    purpose: 'The same vault written in SolidCash.',
    status: 'Run on mainnet',
  },
  {
    name: 'SwapLock',
    file: 'contracts/SwapLock.cash, contracts/evm/SwapLock.sol',
    purpose: 'Hash-time locks for swapping PUSD and USDC between Bitcoin Cash and Base.',
    status: 'Tested locally',
  },
  {
    name: 'StableSwap and HashedTimeLock',
    file: 'contracts/solidcash/',
    purpose: 'A BCH pool and a hash-time lock. The app does not use them.',
    status: 'Prototype, run on mainnet',
  },
]

const STEPS = [
  'Your wallet connects. It keeps your keys and signs every transaction.',
  'The app reads the vault and its state NFT from a BCH node.',
  'The app builds a payment; your wallet signs it.',
  'Every node runs the contract. A payment that breaks the rules is rejected.',
]

const BOUNDARIES = [
  'No Nomos server: the app runs in your browser and never sees your keys.',
  'The rules live in the contract, so the app cannot bypass them either.',
  'Rescue needs both the owner and the rescue key.',
  'Nostr lookups depend on public relays, which can be slow or incomplete.',
]

export default function Architecture() {
  return (
    <div className="page-enter space-y-4">
      <h1 className="page-title">How it's built</h1>
      <p className="text-sm text-nomos-muted">A browser app, your wallet, and a contract that every BCH node enforces.</p>

      <section className="card p-4" aria-labelledby="architecture-stack-title">
        <h2 id="architecture-stack-title" className="mb-3 text-[15px] font-semibold text-nomos-text">Parts</h2>
        <div className="divide-hairline">
          {LAYERS.map((layer) => (
            <div key={layer.label} className="py-2.5">
              <p className="text-sm text-nomos-muted">{layer.label}</p>
              <p className="mt-0.5 text-[15px] text-nomos-text">{layer.items.join(' · ')}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-4" aria-labelledby="architecture-flow-title">
        <h2 id="architecture-flow-title" className="mb-2 text-[15px] font-semibold text-nomos-text">How a payment works</h2>
        <ol className="space-y-1.5 text-sm text-nomos-muted-bright">
          {STEPS.map((step, i) => <li key={step}>{i + 1}. {step}</li>)}
        </ol>
      </section>

      <section className="card p-4" aria-labelledby="architecture-contracts-title">
        <h2 id="architecture-contracts-title" className="mb-1 text-[15px] font-semibold text-nomos-text">Contracts</h2>
        <ul className="divide-hairline">
          {CONTRACTS.map((contract) => (
            <li key={contract.name} className="py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <h3 className="text-[15px] font-medium text-nomos-text">{contract.name}</h3>
                <span className="text-sm text-nomos-muted">{contract.status}</span>
              </div>
              <p className="mt-0.5 text-sm text-nomos-muted-bright">{contract.purpose}</p>
              <p className="mt-0.5 break-all font-mono text-xs text-nomos-muted">{contract.file}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-4" aria-labelledby="architecture-security-title">
        <h2 id="architecture-security-title" className="mb-2 text-[15px] font-semibold text-nomos-text">Trust</h2>
        <ul className="space-y-1.5 text-sm text-nomos-muted-bright">
          {BOUNDARIES.map((line) => <li key={line}>{line}</li>)}
        </ul>
      </section>

      <section className="card p-4" aria-labelledby="architecture-validation-title">
        <h2 id="architecture-validation-title" className="mb-2 text-[15px] font-semibold text-nomos-text">Run the tests</h2>
        <pre className="overflow-x-auto rounded-lg bg-nomos-surface-raised p-3 font-mono text-xs leading-relaxed text-nomos-muted-bright"><code>{`cd contracts/solidcash && npm test
cd xo && npm test
cd frontend && npm run build`}</code></pre>
      </section>

      <nav aria-label="More" className="flex flex-wrap justify-center gap-x-6 gap-y-2 pt-1 text-sm">
        <a href={REPO} target="_blank" rel="noreferrer" className="text-nomos-muted hover:text-nomos-text">Source code</a>
        <Link to="/simulate" className="text-nomos-muted hover:text-nomos-text">Simulator</Link>
        <Link to="/proof" className="text-nomos-muted hover:text-nomos-text">Proof checker</Link>
      </nav>
    </div>
  )
}
