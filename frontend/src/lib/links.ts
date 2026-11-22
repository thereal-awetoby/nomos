// Public links shown on the landing page and in the app banner.
// An empty string hides that link until it exists.

export const LIVE_URL = 'https://nomos.asgaya.org'
export const GITHUB_URL = 'https://github.com/thereal-awetoby/nomos'
export const CONTRACT_URL = 'https://github.com/thereal-awetoby/nomos/blob/main/contracts/NomosVault.cash'
/** The presentation (Google Slides). */
export const DECK_URL: string = 'https://docs.google.com/presentation/d/1ruPJk74ME0xVz1BZ3AAijFfSmS5pkSdsXZm5N2HRkRI/edit?usp=sharing'
export const DEMO_VIDEO_URL: string = 'https://youtu.be/eR8DS4LNMvA'
export const MERCAR_URL = 'https://mercar.asgaya.org/'
export const ASGAYA_URL = 'https://asgaya.org/'

// CashTokens address for EMBER2026 community-choice votes
export const EMBER_ADDRESS = 'bitcoincash:zpqpr0xhygfa7vpcl8lkugccdzx77hfweu5djd5y0a'

export const MAINNET_EXPLORER_TX = 'https://blockchair.com/bitcoin-cash/transaction/'

/** Mainnet transactions shown on the landing page. Rows with an empty txid are hidden; `explorer` overrides the BCH one. */
export const MAINNET_PROOFS: { edition: string; step: string; txid: string; explorer?: string }[] = [
  { edition: 'CashScript vault', step: 'Vault created, 1,000-sat daily limit', txid: '35355e91cc2361dabcd7fc7517c8522f498ce78bd181c819a1ddeaa47cb83abb' },
  { edition: 'CashScript vault', step: "Paid 1,000 sats, the whole day's limit", txid: '5c8aaa0479398235d27395e65baaededb404b2296fdf17dc71b9bd61daab7520' },
  { edition: 'CashScript vault', step: 'Vault closed, every coin back to the owner', txid: '17db1d6d6bd7fccde2b4b5be401935f681a32c7ca9a4a47188c6aa7f85c6ab34' },
  { edition: 'CashScript vault', step: 'Rules changed by the owner: 2,000-sat daily limit', txid: 'fe184c1f3d20276ec11be996d2294ace83639af77f4a61447852f5b4e11c6eb8' },
  { edition: 'SolidCash vault', step: 'Vault created, 2,000-sat daily limit', txid: 'bee48c5f73f16a9ad83669b4a1350d01e07ebf104d155e2b557837e9fd04113d' },
  { edition: 'SolidCash vault', step: 'Paid 1,000 sats under the limit', txid: '93e9fdadaf3ebc5b5182a5b3dcd527b8ab9c6d8480160276a573b9d7b616aae6' },
  { edition: 'SolidCash vault', step: 'Rest of the vault rescued with two keys', txid: '305c7a47a2721ba1b290782df991b5a99bc1da7553b734d764f53e5f81ff913f' },
  { edition: 'Nostr identity', step: 'BCH address linked to a Nostr key', txid: '1e46c9d3159429c1cdf3c995011cf2e999fe5441c0889a2d8e0cd689dcd404f4' },
  { edition: 'Nostr identity', step: 'Paid the npub at its linked address', txid: '02c712c842800fa4f736ad593fe2b147be62f4a278d607ee4bfd941323e110d6' },
  { edition: 'PUSD and USDC swap', step: 'SwapLock deployed on Base', txid: '0x82b1e50182fd6383bff76df08258a31fbd08fe9478558c17581adef43569e74f', explorer: 'https://basescan.org/tx/' },
  { edition: 'PUSD and USDC swap', step: 'USDC to PUSD: 1.2 PUSD claimed on Bitcoin Cash, revealing the secret', txid: 'a7c4c4c62188b26654b89b56d2263a20644cf54f27be388f4d19bddd803999d7' },
  { edition: 'PUSD and USDC swap', step: 'USDC to PUSD: 1.2 USDC claimed on Base with the same secret', txid: '0x70f53f8f99b13ad70e18c268959b9b9df1609fdca6b4f6fd95fbab7b20eeb410', explorer: 'https://basescan.org/tx/' },
  { edition: 'PUSD and USDC swap', step: 'PUSD to USDC: 1.2 USDC claimed on Base, revealing the secret', txid: '0xd55f947c38296c90b46a6e341089dfa188d3a1055e7614d359762f8f85696bb5', explorer: 'https://basescan.org/tx/' },
  { edition: 'PUSD and USDC swap', step: 'PUSD to USDC: 1.2 PUSD claimed on Bitcoin Cash with the same secret', txid: '2591dbc4bf561138b2b44c16ce455d4f86349ef2525950a658ad85a1c858836a' },
  { edition: 'SolidCash hash-time-lock', step: 'Claimed with the secret before the deadline', txid: '37f3163aa53a1b1e032d2592c61afd3653d08002aebfd719b43c29d605aca5cc' },
  { edition: 'SolidCash hash-time-lock', step: 'Refunded to the sender after the deadline', txid: '7d8231c3b8b43ecd8663ded47df841475eef13d812882d7bbaa6b73d56ebd18f' },
  { edition: 'SolidCash StableSwap', step: 'Swapped 1,000 sats for a test token', txid: 'b9bb8a81ef2748fc3b54047691c533d2325cfec3c62db5eb28ed77be56d1bb75' },
  { edition: 'SolidCash StableSwap', step: 'Swapped the tokens back for BCH', txid: '8191f08ec59bd0f0239973f0fa647274fa675f31b1208fe20a31276bf9699c74' },
]
