import { Link } from 'react-router-dom'
import { useWallet } from '../context/WalletContext'
import { useToast } from '../components/Toast'
import ThemeToggle from '../components/ThemeToggle'
import BlazeStrip from '../components/BlazeStrip'
import LimitDemo from '../components/LimitDemo'
import NomosMark from '../components/NomosMark'
import { shortAddr } from '../components/ui'
import {
  CONTRACT_URL,
  DECK_URL,
  DEMO_VIDEO_URL,
  EMBER_ADDRESS,
  GITHUB_URL,
  MAINNET_EXPLORER_TX,
  MAINNET_PROOFS,
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
    a: 'Paytaca over WizardConnect, and Bitcoin Cash wallets that support WalletConnect. Over WizardConnect, Nomos sees every address in your wallet, shows your whole balance, and gathers coins from those addresses when you create a vault. A WalletConnect wallet shares one address, so Nomos uses the BCH there.',
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

// What each step's marker says about the payment: neutral, paid, the rule, refused.
const STEP_TONE = [
  'border-land-ink/30 text-land-ink',
  'border-land-pass bg-land-pass text-land-on-pass',
  'border-land-rule bg-land-rule text-[#0b1d17]',
  'border-land-refuse bg-land-refuse text-white',
]

const XO_RESULTS_URL = `${GITHUB_URL}/blob/main/xo/REPRODUCE.md#results`

function Wordmark() {
  return (
    <span className="flex items-center gap-2.5 text-land-ink">
      <NomosMark size={20} />
      <span className="l-heading text-[21px]">Nomos</span>
    </span>
  )
}

export default function Landing() {
  const { wallet } = useWallet()
  const { toast } = useToast()
  const appTo = wallet?.connected ? '/vault' : '/connect'
  const proofs = MAINNET_PROOFS.filter((p) => p.txid)
  // Say only what the listed transactions show.
  const cashScriptOnMainnet = proofs.some((p) => p.edition === 'CashScript vault')
  const prototypesOnMainnet = proofs.some((p) => p.edition === 'SolidCash hash-time-lock' || p.edition === 'SolidCash StableSwap')

  const copyEmber = async () => {
    try {
      await navigator.clipboard.writeText(EMBER_ADDRESS)
      toast('EMBER2026 address copied', 'success')
    } catch {
      toast('Could not copy the address', 'error')
    }
  }

  return (
    <div className="landing min-h-screen">
      <BlazeStrip />

      <header className="sticky top-0 z-40 border-b l-hair bg-land-ground/90 backdrop-blur">
        <nav aria-label="Main" className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-4">
          <Link to="/" aria-label="Nomos home"><Wordmark /></Link>
          <div className="hidden items-center gap-7 text-[15px] text-land-muted md:flex">
            <a href="#how" className="transition-colors hover:text-land-ink">How it works</a>
            <a href="#proof" className="transition-colors hover:text-land-ink">On mainnet</a>
            <a href="#faq" className="transition-colors hover:text-land-ink">FAQ</a>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Link to={appTo} className="l-btn-ink">Open app</Link>
          </div>
        </nav>
      </header>

      <main id="main-content">
        {/* Hero: the headline, then the limit track playing out the rule. */}
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-12 md:pb-24 md:pt-20">
          <div className="grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] lg:items-end">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border l-hair px-3 py-1 text-[13px] font-medium text-land-muted">
                <span className="h-2 w-2 rounded-full bg-land-pass" aria-hidden="true" />
                Live on Bitcoin Cash mainnet
              </p>
              <h1 className="l-display mt-6 text-[2.6rem] text-land-ink sm:text-[3.6rem] lg:text-[4.6rem]">
                Spending rules for Bitcoin Cash that every node enforces.
              </h1>
            </div>
            <div className="lg:pb-2">
              <p className="max-w-md text-[17px] leading-relaxed text-land-muted">
                Keep BCH in a vault with a daily limit, an allowlist and an agent key. A payment that breaks the rules is rejected by the network, not just by an app.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link to={appTo} className="l-btn-rule">Open the app</Link>
                {DEMO_VIDEO_URL && (
                  <a href={DEMO_VIDEO_URL} target="_blank" rel="noreferrer" className="l-btn-line">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" /></svg>
                    Watch the demo
                  </a>
                )}
              </div>
              <p className="mt-5 text-sm text-land-muted">Works with Paytaca. No account, no sign-up, no Nomos fees.</p>
            </div>
          </div>
          <div className="mt-12 md:mt-16">
            <LimitDemo />
          </div>
        </section>

        {/* How it works: a real sequence, so the steps are numbered. */}
        <section id="how" className="scroll-mt-20 border-t l-hair">
          <div className="mx-auto max-w-6xl px-4 py-16 md:py-24">
            <h2 className="l-heading max-w-2xl text-[2rem] text-land-ink sm:text-[2.6rem]">The rules are in the coins, not in an app.</h2>
            <ol className="relative mt-12 grid gap-9 md:grid-cols-4 md:gap-8">
              <span className="absolute left-4 right-[calc((100%_-_6rem)/4_-_18px)] top-[17px] hidden h-[2px] bg-land-ink/15 md:block" aria-hidden="true" />
              {STEPS.map((step, i) => (
                <li key={step.title} className="relative pl-14 md:pl-0">
                  {/* On a phone the steps stack: a connector runs down to the next marker. */}
                  {i < STEPS.length - 1 && <span className="absolute -bottom-9 left-[17px] top-9 w-[2px] bg-land-ink/15 md:hidden" aria-hidden="true" />}
                  <span className={`absolute left-0 top-0 flex h-9 w-9 items-center justify-center rounded-full border-2 bg-land-ground text-sm font-bold tabular-nums md:static ${STEP_TONE[i]}`}>
                    {i + 1}
                  </span>
                  <h3 className="text-[18px] font-semibold text-land-ink md:mt-6">{step.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-land-muted">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* On mainnet */}
        <section id="proof" className="scroll-mt-20 border-t l-hair">
          <div className="mx-auto max-w-6xl px-4 py-16 md:py-24">
            <h2 className="l-heading max-w-2xl text-[2rem] text-land-ink sm:text-[2.6rem]">Check it on the chain.</h2>
            <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-land-muted">
              {cashScriptOnMainnet
                ? 'Both editions of the vault have run on Bitcoin Cash mainnet: paid under the limit and refused over it. The SolidCash vault was also rescued with two keys, and a CashScript vault was closed by its owner, made again, moved to new rules, and used to pay an npub.'
                : 'The vault has run on Bitcoin Cash mainnet: paid under the limit, refused over it, and rescued with two keys.'}
              {prototypesOnMainnet && ' A SolidCash hash-time-lock and StableSwap pool have run there too, with test amounts.'}
            </p>
            <div className="mt-10 grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <ul className="divide-y overflow-hidden rounded-[18px] border l-hair bg-land-raised [&>li]:border-[color:var(--l-hair)]">
                {proofs.map((p) => (
                  <li key={p.txid}>
                    <a
                      href={`${MAINNET_EXPLORER_TX}${p.txid}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-land-ink/[0.04]"
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-land-pass" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-medium text-land-ink">{p.step}</span>
                        <span className="block text-sm text-land-muted">{p.edition}</span>
                      </span>
                      <span className="shrink-0 rounded-md bg-land-ink/[0.06] px-2 py-1 font-mono text-xs text-land-ink">{p.txid.slice(0, 8)}…</span>
                    </a>
                  </li>
                ))}
              </ul>
              <div className="rounded-[18px] border-2 border-land-refuse/60 p-6">
                <p className="flex items-center gap-2 text-[17px] font-semibold text-land-refuse">
                  <span className="h-2.5 w-2.5 rounded-full bg-land-refuse" aria-hidden="true" />
                  Refused over the limit
                </p>
                <p className="mt-3 text-[15px] leading-relaxed text-land-muted">
                  A signed CashScript vault payment over the daily limit was sent to a mainnet node. The node rejected it:
                </p>
                <p className="mt-3 rounded-lg bg-land-ink/[0.06] p-3 font-mono text-xs leading-relaxed text-land-ink">
                  mandatory-script-verify-flag-failed (Script failed an OP_VERIFY operation)
                </p>
                <p className="mt-3 text-[15px] leading-relaxed text-land-muted">
                  The SolidCash vault refused a second payment the same day at the contract's daily-limit check.
                </p>
              </div>
            </div>
            <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-land-muted">
              The XO template ran the same vault on chipnet: payments up to the daily limit, an over-limit payment the node refused, and a rescue signed by two keys in two separate engines.{' '}
              <a href={XO_RESULTS_URL} target="_blank" rel="noreferrer" className="font-medium text-land-ink underline decoration-land-ink/30 underline-offset-4 hover:decoration-land-ink">See the transactions</a>
            </p>
          </div>
        </section>

        {/* Features */}
        <section className="border-t l-hair">
          <div className="mx-auto max-w-6xl px-4 py-16 md:py-24">
            <h2 className="l-heading max-w-2xl text-[2rem] text-land-ink sm:text-[2.6rem]">One vault, a few clear rules.</h2>
            <div className="mt-12 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((f) => (
                <div key={f.title} className="border-t-2 border-land-ink/15 pt-4">
                  <h3 className="text-[17px] font-semibold text-land-ink">{f.title}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-land-muted">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Trust */}
        <section className="border-t l-hair">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:py-24 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <h2 className="l-heading text-[2rem] text-land-ink sm:text-[2.6rem]">Nomos never holds your keys or your coins.</h2>
            <ul className="grid sm:grid-cols-2">
              {TRUST.map((t, i) => (
                <li
                  key={t.title}
                  className={`border-t l-hair py-5 sm:px-6 ${i % 2 === 0 ? 'sm:pl-0' : 'sm:border-l'} ${i < 2 ? 'sm:pt-0 sm:border-t-0' : ''}`}
                >
                  <h3 className="text-[17px] font-semibold text-land-ink">{t.title}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-land-muted">{t.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Built on */}
        <section className="border-t l-hair">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-4 px-4 py-12">
            <h2 className="text-[15px] font-semibold text-land-ink">Built on</h2>
            <ul className="flex flex-wrap gap-2">
              {BUILT_ON.map((name) => (
                <li key={name} className="rounded-full border l-hair-strong px-3.5 py-1.5 text-sm text-land-ink">{name}</li>
              ))}
            </ul>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20 border-t l-hair">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:py-24 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <h2 className="l-heading text-[2rem] text-land-ink sm:text-[2.6rem]">Questions, answered plainly.</h2>
            <div className="divide-y border-y l-hair [&>*]:border-[color:var(--l-hair)]">
              {FAQ.map((item) => (
                <details key={item.q} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-medium text-land-ink [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border l-hair-strong text-lg leading-none text-land-muted transition-transform group-open:rotate-45" aria-hidden="true">+</span>
                  </summary>
                  <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-land-muted">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Closing */}
        <section className="border-t l-hair">
          <div className="mx-auto max-w-6xl px-4 py-20 md:py-28">
            <h2 className="l-display max-w-3xl text-[2.4rem] text-land-ink sm:text-[3.4rem]">Set up a vault in a few minutes.</h2>
            <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-land-muted">Connect Paytaca, choose a daily limit and make a payment.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to={appTo} className="l-btn-rule">Open the app</Link>
              <Link to="/simulate" className="l-btn-line">Try without a wallet</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t l-hair">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Wordmark />
            <p className="mt-3 text-sm text-land-muted">Built for BCH BLAZE 2026.</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-land-ink">App</p>
            <ul className="mt-3 space-y-2 text-sm text-land-muted">
              <li><Link to={appTo} className="hover:text-land-ink">Open the app</Link></li>
              <li><Link to="/simulate" className="hover:text-land-ink">Simulator</Link></li>
              <li><Link to="/proof" className="hover:text-land-ink">Proof checker</Link></li>
              <li><Link to="/identity" className="hover:text-land-ink">Nostr identity</Link></li>
              <li><Link to="/bridge" className="hover:text-land-ink">Swap PUSD and USDC</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold text-land-ink">Project</p>
            <ul className="mt-3 space-y-2 text-sm text-land-muted">
              <li><a href={GITHUB_URL} target="_blank" rel="noreferrer" className="hover:text-land-ink">Source code</a></li>
              <li><a href={CONTRACT_URL} target="_blank" rel="noreferrer" className="hover:text-land-ink">The contract</a></li>
              <li><Link to="/architecture" className="hover:text-land-ink">How it's built</Link></li>
              {DECK_URL && <li><a href={DECK_URL} target="_blank" rel="noreferrer" className="hover:text-land-ink">Presentation</a></li>}
              {DEMO_VIDEO_URL && <li><a href={DEMO_VIDEO_URL} target="_blank" rel="noreferrer" className="hover:text-land-ink">Demo video</a></li>}
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold text-land-ink">Vote with EMBER2026</p>
            <p className="mt-3 break-all font-mono text-xs text-land-muted" title={EMBER_ADDRESS}>{shortAddr(EMBER_ADDRESS, 10, 8)}</p>
            <button type="button" onClick={() => { void copyEmber() }} className="mt-2 text-sm font-medium text-land-ink underline-offset-4 hover:underline">Copy address</button>
          </div>
        </div>
      </footer>
    </div>
  )
}
