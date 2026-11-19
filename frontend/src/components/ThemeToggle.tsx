import { useEffect, useState } from 'react'
import { THEME_CHANGE_EVENT } from '../lib/theme'

type Theme = 'dark' | 'light'

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
  )

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      window.localStorage.setItem('nomos-theme', theme)
    } catch { /* theme still applies when storage is unavailable */ }
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT))
  }, [theme])

  const nextTheme = theme === 'dark' ? 'light' : 'dark'

  return (
    <button
      type="button"
      onClick={() => setTheme(nextTheme)}
      className="flex h-8 items-center gap-1.5 border hairline-strong bg-nomos-surface px-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-nomos-muted-bright transition-colors hover:text-nomos-text"
      aria-label={`Switch to ${nextTheme} theme`}
      title={`Switch to ${nextTheme} theme`}
      aria-pressed={theme === 'light'}
    >
      <span
        aria-hidden="true"
        className="inline-block h-2.5 w-2.5 border border-current"
        style={{ background: theme === 'dark' ? 'transparent' : 'currentColor' }}
      />
      {theme === 'dark' ? 'Dark' : 'Light'}
    </button>
  )
}
