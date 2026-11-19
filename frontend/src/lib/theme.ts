export const THEME_CHANGE_EVENT = 'nomos:theme-change'
export const OPEN_SHORTCUTS_EVENT = 'nomos:shortcuts:open'

/** QR modules should contrast with the app background in either theme. */
export function qrColors(): { dark: string; light: string } {
  const isLight = document.documentElement.dataset.theme === 'light'
  return {
    dark: isLight ? '#111317' : '#e7eaee',
    light: '#00000000',
  }
}
