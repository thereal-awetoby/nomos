// ── Which Bitcoin Cash network the app runs on ──────────────
// Mainnet unless this browser chose chipnet, the test network, with the switch
// in the header (or the site was built with VITE_BCH_NETWORK=chipnet).
// Switching reloads the app. Chipnet keeps its own wallet, vault, history and
// saved checks under separate storage keys; the mainnet ones keep their
// original names and are never touched.

export type BchNetwork = 'mainnet' | 'chipnet'

const NETWORK_KEY = 'nomos:network'

function readNetwork(): BchNetwork {
  try {
    const saved = localStorage.getItem(NETWORK_KEY)
    if (saved === 'mainnet' || saved === 'chipnet') return saved
  } catch {
    // Storage blocked: fall back to how the site was built.
  }
  return ((import.meta.env.VITE_BCH_NETWORK as string) || 'mainnet') === 'chipnet' ? 'chipnet' : 'mainnet'
}

export const BCH_NETWORK: BchNetwork = readNetwork()
export const IS_CHIPNET = BCH_NETWORK === 'chipnet'

/** Cashaddr prefix on this network. */
export const ADDRESS_PREFIX: 'bitcoincash' | 'bchtest' = IS_CHIPNET ? 'bchtest' : 'bitcoincash'

/** BCH WalletConnect chain id on this network. */
export const WC2_CHAIN = IS_CHIPNET ? 'bch:bchtest' : 'bch:bitcoincash'

/** Free test coins for chipnet. */
export const CHIPNET_FAUCET_URL = 'https://tbch.googol.cash/'

/** The storage key for this network: mainnet keeps the original name. */
export function networkKey(key: string): string {
  return IS_CHIPNET ? key.replace(/^nomos:/, 'nomos:chipnet:') : key
}

export function switchNetwork(next: BchNetwork): void {
  if (next === BCH_NETWORK) return
  try {
    localStorage.setItem(NETWORK_KEY, next)
  } catch {
    return
  }
  window.location.reload()
}
