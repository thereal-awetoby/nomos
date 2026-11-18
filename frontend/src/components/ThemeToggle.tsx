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
      className="rounded-pill border border-nomos-border/20 bg-nomos-surface/70 px-2.5 py-1 font-mono text-[10px] text-nomos-muted-bright transition-colors hover:text-nomos-accent"
      aria-label={`Switch to ${nextTheme} theme`}
      title={`Switch to ${nextTheme} theme`}
      aria-pressed={theme === 'light'}
    >
      {theme === 'dark' ? '☼ Light' : '☾ Dark'}
    </button>
  )
}
