// ── Site-wide top banner ────────────────────────────────────

const WIDGET_FACTORY_URL = '#' // TODO: fill after submission
const GITHUB_URL = 'https://github.com/thereal-awetoby/nomos'
const EMBER_ADDRESS = 'bitcoincash:TODO_EMBER2026_ADDRESS'

export default function Banner() {
  return (
    <div className="relative w-full px-5 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div className="mx-auto flex max-w-lg items-center justify-between text-[10px] text-nomos-muted/60">
        <div className="flex items-center gap-3">
          <a
            href={WIDGET_FACTORY_URL}
            target="_blank"
            rel="noreferrer"
            className="hover:text-nomos-accent transition-colors duration-200"
          >
            Widget Factory
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="hover:text-nomos-accent transition-colors duration-200"
          >
            GitHub
          </a>
        </div>
        <span className="font-mono truncate max-w-[180px] sm:max-w-none opacity-40">
          {EMBER_ADDRESS}
        </span>
      </div>
    </div>
  )
}
