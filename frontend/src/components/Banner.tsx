// ── Site-wide top banner ────────────────────────────────────

const WIDGET_FACTORY_URL = '#' // TODO: fill after submission
const GITHUB_URL = 'https://github.com/thereal-awetoby/nomos'
const EMBER_ADDRESS = 'bitcoincash:TODO_EMBER2026_ADDRESS'

export default function Banner() {
  return (
    <div className="w-full border-b border-nomos-border bg-nomos-surface/60 px-4 py-2">
      <div className="mx-auto flex max-w-4xl items-center justify-between text-xs text-nomos-muted">
        <div className="flex items-center gap-3">
          <a
            href={WIDGET_FACTORY_URL}
            target="_blank"
            rel="noreferrer"
            className="hover:text-nomos-accent transition-colors"
          >
            Widget Factory
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="hover:text-nomos-accent transition-colors"
          >
            GitHub
          </a>
        </div>
        <span className="font-mono text-[10px] truncate max-w-[200px] sm:max-w-none">
          EMBER: {EMBER_ADDRESS}
        </span>
      </div>
    </div>
  )
}
