import { Link } from 'react-router-dom'
import ThemeToggle from './ThemeToggle'
import { useToast } from './Toast'

// ── Site-wide top banner ────────────────────────────────────

const WIDGET_FACTORY_URL = '#' // TODO: fill after submission
const GITHUB_URL = 'https://github.com/thereal-awetoby/nomos'
// CashTokens address for EMBER2026 community-choice votes
const EMBER_ADDRESS = 'bitcoincash:zqz0cjlclvk6909mctktqsk77d7z6gev0cqejwlp4h'

const NETWORK = ((import.meta.env.VITE_BCH_NETWORK as string) || 'mainnet')
const isChipnet = NETWORK === 'chipnet'

export default function Banner() {
  const { toast } = useToast()

  const copyEmberAddress = async () => {
    try {
      await navigator.clipboard.writeText(EMBER_ADDRESS)
      toast('EMBER2026 address copied', 'success')
    } catch {
      toast('Could not copy the EMBER2026 address', 'error')
    }
  }

  return (
    <nav
      aria-label="Site navigation"
      className="site-banner relative w-full border-b border-nomos-border/10 px-5 py-2.5"
    >
      <div className="mx-auto flex max-w-lg items-center justify-between gap-2 text-[10px] text-nomos-muted/70 sm:gap-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {/* Network badge */}
          <span className={`rounded-pill px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider ${
            isChipnet
              ? 'bg-amber-500/15 text-amber-400'
              : 'bg-nomos-accent/15 text-nomos-accent'
          }`}>
            {isChipnet ? 'chipnet' : 'mainnet'}
          </span>
          <Link
            to="/bridge"
            className="hover:text-nomos-accent transition-colors duration-200"
          >
            Bridge
          </Link>
          <Link
            to="/identity"
            className="hover:text-nomos-accent transition-colors duration-200"
          >
            Identity
          </Link>
          <Link
            to="/architecture"
            title="Architecture"
            className="hidden transition-colors duration-200 hover:text-nomos-accent sm:inline"
          >
            Arch
          </Link>
          <a
            href={WIDGET_FACTORY_URL}
            target="_blank"
            rel="noreferrer"
            className="hidden hover:text-nomos-accent transition-colors duration-200 sm:inline"
          >
            Widget Factory
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="hidden hover:text-nomos-accent transition-colors duration-200 sm:inline"
          >
            GitHub
          </a>
          <a
            href="https://www.mercar.app/"
            target="_blank"
            rel="noreferrer"
            title="Mercar"
            className="hover:text-nomos-accent transition-colors duration-200"
          >
            Mercar
          </a>
          <a
            href="https://asgaya.org/"
            target="_blank"
            rel="noreferrer"
            title="Asgaya"
            className="hover:text-nomos-accent transition-colors duration-200"
          >
            Asgaya
          </a>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => { void copyEmberAddress() }}
            title={`Copy EMBER2026 CashTokens address: ${EMBER_ADDRESS}`}
            aria-label="Copy EMBER2026 community address"
            className="rounded-pill border border-nomos-accent/20 bg-nomos-accent/5 px-2.5 py-1 text-[9px] font-semibold tracking-wide text-nomos-accent transition-colors hover:bg-nomos-accent/10"
          >
            EMBER2026 · COPY
          </button>
          <ThemeToggle />
        </div>
      </div>
    </nav>
  )
}
