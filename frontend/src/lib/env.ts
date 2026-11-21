// Build-time settings read from Vite env variables (see docs/DEPLOY.md).

/** WalletConnect v2 project ID. Without one, WalletConnect buttons are hidden. */
export const WC_PROJECT_ID: string = (import.meta.env.VITE_WC_PROJECT_ID as string | undefined)?.trim() ?? ''

export const WALLETCONNECT_ENABLED = WC_PROJECT_ID.length > 0

/** Icon shown by wallets when they pair with Nomos. */
export function appIconUrl(): string {
  return `${window.location.origin}/icon-192.png`
}
