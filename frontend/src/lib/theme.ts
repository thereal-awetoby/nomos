export const THEME_CHANGE_EVENT = 'nomos:theme-change'

/** QR modules should contrast with the app background in either theme. */
export function qrColors(): { dark: string; light: string } {
  const isLight = document.documentElement.dataset.theme === 'light'
  return {
    dark: isLight ? '#1a1a2e' : '#e8e8f0',
    light: '#00000000',
  }
}
