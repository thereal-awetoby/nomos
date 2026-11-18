import { Link } from 'react-router-dom'
import ThemeToggle from './ThemeToggle'

// ── Site-wide top banner ────────────────────────────────────

const WIDGET_FACTORY_URL = '#' // TODO: fill after submission
const GITHUB_URL = 'https://github.com/thereal-awetoby/nomos'
// CashTokens address for EMBER2026 community-choice votes
const EMBER_ADDRESS = 'bitcoincash:zqz0cjlclvk6909mctktqsk77d7z6gev0cqejwlp4h'

const NETWORK = ((import.meta.env.VITE_BCH_NETWORK as string) || 'mainnet')
const isChipnet = NETWORK === 'chipnet'

export default function Banner() {
  return (
    <div className="site-banner relative w-full border-b border-nomos-border/10 px-5 py-2.5">
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
          <span className="hidden max-w-[100px] truncate font-mono opacity-40 lg:block">
            {EMBER_ADDRESS}
          </span>
          <ThemeToggle />
        </div>
      </div>
    </div>
  )
}
