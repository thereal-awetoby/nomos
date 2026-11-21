import { Link } from 'react-router-dom'
import { useWallet } from '../context/WalletContext'
import { useToast } from '../components/Toast'
import ThemeToggle from '../components/ThemeToggle'
import { shortAddr } from '../components/ui'
import {
  CONTRACT_URL,
  DEMO_VIDEO_URL,
  EMBER_ADDRESS,
  GITHUB_URL,
  MAINNET_EXPLORER_TX,
  MAINNET_PROOFS,
  WIDGET_FACTORY_URL,
} from '../lib/links'

const STEPS = [
  {
    title: 'Create a vault',
    body: 'Pick a daily limit. Optionally add allowed addresses, an agent key and a rescue key. Your wallet funds the vault.',
  },
  {
    title: 'Pay as usual',
    body: 'Nomos checks the payment against your rules before your wallet is asked to sign.',
  },
  {
    title: 'Every node checks it',
    body: 'The vault is a CashScript contract. A CashTokens NFT holds what was spent today, and every payment must update it.',
  },
  {
    title: 'Break a rule, get refused',
    body: 'A payment over the limit fails the contract. No node relays it and no miner can include it.',
  },
]

const FEATURES = [
  { title: 'Daily limit', body: 'Caps what can leave the vault each day.' },
  { title: 'Allowlist', body: 'Optionally pay only up to five chosen addresses.' },
  { title: 'Agent key', body: 'A second key that can pay within the rules, and nothing more.' },
  { title: 'Rescue key', body: 'Together with the owner, moves everything in an emergency.' },
  { title: 'Pay by Nostr name', body: 'Pay an npub or name@domain. Addresses linked by both keys are marked.' },
  { title: 'Proof checker', body: 'Send a rule-breaking spend to a node and keep its answer.' },
  { title: 'Receipts', body: 'Every payment and refusal, saved on your device.' },
  { title: 'Swap PUSD and USDC', body: 'Trade with someone on Base. Both sides lock to one secret.' },
]

const TRUST = [
  { title: 'Your keys stay in your wallet', body: 'Paytaca signs every transaction. Nomos never sees a key.' },
  { title: 'No Nomos server', body: 'The app runs in your browser and reads the chain directly.' },
  { title: 'Rules live in the contract', body: 'Not even the Nomos app can get around them.' },
  { title: 'Open source', body: 'Every contract and page is on GitHub under the MIT license.' },
]

const BUILT_ON = ['CashScript', 'CashTokens', 'SolidCash', 'XO', 'WizardConnect', 'Paytaca', 'Nostr', 'Base']

const FAQ = [
  {
    q: 'What is Nomos?',
    a: 'A vault for Bitcoin Cash with spending rules: a daily limit, an optional list of allowed addresses, an agent key and a rescue key. The rules are part of a CashScript contract, so every node checks them.',
  },
  {
    q: 'What happens if a payment breaks the rules?',
    a: 'The app stops it before your wallet signs. If a rule-breaking payment is signed and sent anyway, nodes reject it, so it can never be mined.',
  },
  {
    q: 'Can Nomos move my money?',
    a: 'No. There is no Nomos server and the app never sees your keys. Your wallet signs every transaction, and the contract only allows payments within your rules.',
  },
  {
    q: 'What is the agent key for?',
    a: 'Give an AI agent or a teammate its own key. It can pay up to your daily limit, only to your allowed addresses if you set them, and nothing more.',
  },
  {
    q: 'What if I need to move everything at once?',
    a: 'If you set a rescue key, the owner key and the rescue key together can move the whole vault in one transaction. The owner can also change the rules at any time; the vault then moves to a new address.',
  },
  {
    q: 'Which wallets work?',
    a: 'Paytaca over WizardConnect, and Bitcoin Cash wallets that support WalletConnect.',
  },
  {
    q: 'Can I pay someone by name?',
    a: 'Yes. Type their npub or name@domain. If they linked their BCH address to their Nostr key with both keys, Nomos pays that address and shows that it is linked.',
  },
  {
    q: 'What does it cost?',
    a: 'Only Bitcoin Cash network fees. Nomos charges nothing.',
  },
]

function Eyebrow({ children }: { children: string }) {
  return <p className="text-sm font-medium text-nomos-muted">/ {children}</p>
}

/** Illustration of the app's rules card and a refusal, with example numbers. */
function RulesIllustration() {
  return (
    <div className="mx-auto w-full max-w-sm" aria-hidden="true">
      <div className="card p-5 shadow-xl">
        <div className="flex items-baseline justify-between">
          <p className="text-[15px] font-semibold text-nomos-text">Rules</p>
          <p className="text-xs text-nomos-muted">Example</p>
        </div>
        <div className="mt-3 flex items-baseline justify-between text-sm">
          <span className="text-nomos-muted">Spent today</span>
          <span className="tabular-nums text-nomos-text">2,000 / 5,000 sats</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-nomos-surface-raised">
          <div className="h-2 w-2/5 rounded-full bg-nomos-text" />
        </div>
        <div className="mt-3 divide-hairline border-t hairline">
          <div className="kv"><span>Daily limit</span><span>5,000 sats</span></div>
          <div className="kv"><span>Allowlist</span><span>On · 2 of 5</span></div>
          <div className="kv"><span>Agent key</span><span>Set</span></div>
        </div>
      </div>
      <div className="card mt-3 p-5 shadow-xl" style={{ borderColor: 'rgb(var(--nomos-refuse) / 0.45)' }}>
        <p className="text-lg font-semibold text-nomos-refuse">Refused</p>
        <p className="mt-0.5 text-sm text-nomos-text">Pay 5,500 sats: over today's limit by 2,500</p>
        <p className="mt-1 font-mono text-xs text-nomos-muted">Script failed an OP_VERIFY operation</p>
      </div>
    </div>
  )
}

export default function Landing() {
  const { wallet } = useWallet()
  const { toast } = useToast()
  const appTo = wallet?.connected ? '/vault' : '/connect'
  const proofs = MAINNET_PROOFS.filter((p) => p.txid)
  // Say only what the listed transactions show.
  const cashScriptOnMainnet = proofs.some((p) => p.edition === 'CashScript vault')

  const copyEmber = async () => {
    try {
      await navigator.clipboard.writeText(EMBER_ADDRESS)
      toast('EMBER2026 address copied', 'success')
    } catch {
      toast('Could not copy the address', 'error')
    }
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b hairline bg-nomos-bg/95 backdrop-blur">
        <nav aria-label="Main" className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Link to="/" className="text-lg font-semibold tracking-tight text-nomos-text">Nomos</Link>
          <div className="hidden items-center gap-6 text-sm text-nomos-muted md:flex">
            <a href="#how" className="hover:text-nomos-text">How it works</a>
            <a href="#proof" className="hover:text-nomos-text">On mainnet</a>
            <a href="#faq" className="hover:text-nomos-text">FAQ</a>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="hover:text-nomos-text">Source</a>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Link to={appTo} className="btn-primary min-h-[36px] px-4 py-1.5 text-sm">Open app</Link>
          </div>
        </nav>
      </header>

      <main id="main-content">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-14 pt-10 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:pb-20 md:pt-24">
          <div>
            <p className="flex items-center gap-2 text-sm text-nomos-muted">
              <span className="h-2 w-2 rounded-full" style={{ background: 'rgb(var(--nomos-ok))' }} aria-hidden="true" />
              Live on Bitcoin Cash mainnet
            </p>
            <h1 className="mt-4 text-4xl font-semibold leading-[1.08] tracking-tight text-nomos-text sm:text-5xl lg:text-[3.5rem]">
              Spending rules for Bitcoin Cash that every node enforces.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-nomos-muted">
              Keep BCH in a vault with a daily limit, an allowlist and an agent key. A payment that breaks the rules is rejected by the network, not just by an app.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to={appTo} className="btn-primary px-6">Open the app</Link>
              <a href="#how" className="btn-ghost min-h-[44px] px-6">How it works</a>
              {DEMO_VIDEO_URL && (
                <a href={DEMO_VIDEO_URL} target="_blank" rel="noreferrer" className="btn-ghost min-h-[44px] px-6">Watch the demo</a>
              )}
            </div>
            <p className="mt-6 text-sm text-nomos-muted">
              Works with Paytaca. No account, no sign-up, no Nomos fees.
            </p>
          </div>
          <RulesIllustration />
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-16 border-t hairline">
          <div className="mx-auto max-w-6xl px-4 py-14 md:py-20">
            <Eyebrow>How it works</Eyebrow>
            <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight text-nomos-text">The rules are in the coins, not in an app.</h2>
            <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, i) => (
                <li key={step.title} className="card p-5">
                  <p className="text-sm tabular-nums text-nomos-muted">{String(i + 1).padStart(2, '0')}</p>
                  <h3 className="mt-3 text-[17px] font-semibold text-nomos-text">{step.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-nomos-muted">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Mainnet proof */}
        <section id="proof" className="scroll-mt-16 border-t hairline">
          <div className="mx-auto max-w-6xl px-4 py-14 md:py-20">
            <Eyebrow>On mainnet</Eyebrow>
            <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight text-nomos-text">Check it on the chain.</h2>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-nomos-muted">
              {cashScriptOnMainnet
                ? 'Both editions of the vault have run on Bitcoin Cash mainnet: paid under the limit and refused over it. The SolidCash vault was also rescued with two keys.'
                : 'The vault has run on Bitcoin Cash mainnet: paid under the limit, refused over it, and rescued with two keys.'}
            </p>
            <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <div className="card divide-hairline overflow-hidden">
                {proofs.map((p) => (
                  <a
                    key={p.txid}
                    href={`${MAINNET_EXPLORER_TX}${p.txid}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-4 px-5 py-4 hover:bg-nomos-surface-raised/50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] text-nomos-text">{p.step}</span>
                      <span className="block text-sm text-nomos-muted">{p.edition}</span>
                    </span>
                    <span className="shrink-0 font-mono text-xs text-nomos-muted-bright">{p.txid.slice(0, 8)}…</span>
                  </a>
                ))}
              </div>
              <div className="card p-5">
                <p className="text-[15px] font-semibold text-nomos-text">Refused over the limit</p>
                <p className="mt-2 text-[15px] leading-relaxed text-nomos-muted">
                  A signed CashScript vault payment over the daily limit was sent to a mainnet node. The node rejected it:
                </p>
                <p className="mt-3 rounded-lg bg-nomos-surface-raised p-3 font-mono text-xs leading-relaxed text-nomos-text">
                  mandatory-script-verify-flag-failed (Script failed an OP_VERIFY operation)
                </p>
                <p className="mt-3 text-[15px] leading-relaxed text-nomos-muted">
                  The SolidCash vault refused a second payment the same day at the contract's daily-limit check.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="border-t hairline">
          <div className="mx-auto max-w-6xl px-4 py-14 md:py-20">
            <Eyebrow>What you get</Eyebrow>
            <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight text-nomos-text">One vault, a few clear rules.</h2>
            <div className="mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((f) => (
                <div key={f.title}>
                  <h3 className="text-[17px] font-semibold text-nomos-text">{f.title}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-nomos-muted">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Trust */}
        <section className="border-t hairline">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:py-20 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <div>
              <Eyebrow>Trust</Eyebrow>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-nomos-text">Nomos never holds your keys or your coins.</h2>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2">
              {TRUST.map((t) => (
                <li key={t.title} className="card p-5">
                  <h3 className="text-[17px] font-semibold text-nomos-text">{t.title}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-nomos-muted">{t.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Built on */}
        <section className="border-t hairline">
          <div className="mx-auto max-w-6xl px-4 py-12 md:py-14">
            <Eyebrow>Built on</Eyebrow>
            <ul className="mt-4 flex flex-wrap gap-2">
              {BUILT_ON.map((name) => (
                <li key={name} className="rounded-lg border hairline-strong px-3 py-1.5 text-sm text-nomos-text">{name}</li>
              ))}
            </ul>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-16 border-t hairline">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:py-20 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <div>
              <Eyebrow>FAQ</Eyebrow>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-nomos-text">Questions, answered plainly.</h2>
            </div>
            <div className="divide-hairline border-y hairline">
              {FAQ.map((item) => (
                <details key={item.q} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-medium text-nomos-text [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <span className="shrink-0 text-2xl font-light leading-none text-nomos-muted transition-transform group-open:rotate-45" aria-hidden="true">+</span>
                  </summary>
                  <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-nomos-muted">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Closing */}
        <section className="border-t hairline">
          <div className="mx-auto max-w-6xl px-4 py-16 text-center md:py-24">
            <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-nomos-text sm:text-4xl">Set up a vault in a few minutes.</h2>
            <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-nomos-muted">Connect Paytaca, choose a daily limit and make a payment.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link to={appTo} className="btn-primary px-6">Open the app</Link>
              <Link to="/simulate" className="btn-ghost min-h-[44px] px-6">Try without a wallet</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t hairline">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-lg font-semibold tracking-tight text-nomos-text">Nomos</p>
            <p className="mt-2 text-sm text-nomos-muted">Built for BCH BLAZE 2026.</p>
          </div>
          <div>
            <p className="text-sm font-medium text-nomos-text">App</p>
            <ul className="mt-3 space-y-2 text-sm text-nomos-muted">
              <li><Link to={appTo} className="hover:text-nomos-text">Open the app</Link></li>
              <li><Link to="/simulate" className="hover:text-nomos-text">Simulator</Link></li>
              <li><Link to="/proof" className="hover:text-nomos-text">Proof checker</Link></li>
              <li><Link to="/identity" className="hover:text-nomos-text">Nostr identity</Link></li>
              <li><Link to="/bridge" className="hover:text-nomos-text">Swap PUSD and USDC</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-medium text-nomos-text">Project</p>
            <ul className="mt-3 space-y-2 text-sm text-nomos-muted">
              <li><a href={GITHUB_URL} target="_blank" rel="noreferrer" className="hover:text-nomos-text">Source code</a></li>
              <li><a href={CONTRACT_URL} target="_blank" rel="noreferrer" className="hover:text-nomos-text">The contract</a></li>
              <li><Link to="/architecture" className="hover:text-nomos-text">How it's built</Link></li>
              {WIDGET_FACTORY_URL && <li><a href={WIDGET_FACTORY_URL} target="_blank" rel="noreferrer" className="hover:text-nomos-text">Presentation</a></li>}
              {DEMO_VIDEO_URL && <li><a href={DEMO_VIDEO_URL} target="_blank" rel="noreferrer" className="hover:text-nomos-text">Demo video</a></li>}
            </ul>
          </div>
          <div>
            <p className="text-sm font-medium text-nomos-text">Vote with EMBER2026</p>
            <p className="mt-3 break-all font-mono text-xs text-nomos-muted" title={EMBER_ADDRESS}>{shortAddr(EMBER_ADDRESS, 10, 8)}</p>
            <button type="button" onClick={() => { void copyEmber() }} className="link-action mt-2">Copy address</button>
          </div>
        </div>
      </footer>
    </div>
  )
}
