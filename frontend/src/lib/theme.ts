export const THEME_CHANGE_EVENT = 'nomos:theme-change'
export const OPEN_SHORTCUTS_EVENT = 'nomos:shortcuts:open'

/** QR modules should contrast with the app background in either theme. */
export function qrColors(): { dark: string; light: string } {
  // Dark modules on white in both themes: inverted codes fail in some scanners.
  return { dark: '#111111', light: '#ffffff' }
}
