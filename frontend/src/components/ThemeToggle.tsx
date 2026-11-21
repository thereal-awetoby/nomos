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
      className="flex h-9 w-9 items-center justify-center rounded-lg text-nomos-muted-bright transition-colors hover:bg-nomos-surface-raised hover:text-nomos-text"
      aria-label={`Switch to ${nextTheme} theme`}
      title={`Switch to ${nextTheme} theme`}
      aria-pressed={theme === 'light'}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
        <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none" />
      </svg>
    </button>
  )
}
