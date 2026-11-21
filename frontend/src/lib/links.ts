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
export const EMBER_ADDRESS = 'bitcoincash:zqz0cjlclvk6909mctktqsk77d7z6gev0cqejwlp4h'

export const MAINNET_EXPLORER_TX = 'https://blockchair.com/bitcoin-cash/transaction/'

/** Mainnet transactions shown on the landing page. Rows with an empty txid are hidden. */
export const MAINNET_PROOFS: { edition: string; step: string; txid: string }[] = [
  { edition: 'CashScript vault', step: 'Vault created, 1,000-sat daily limit', txid: '35355e91cc2361dabcd7fc7517c8522f498ce78bd181c819a1ddeaa47cb83abb' },
  { edition: 'CashScript vault', step: "Paid 1,000 sats, the whole day's limit", txid: '5c8aaa0479398235d27395e65baaededb404b2296fdf17dc71b9bd61daab7520' },
  { edition: 'CashScript vault', step: 'Rules changed by the owner', txid: '' },
  { edition: 'SolidCash vault', step: 'Vault created, 2,000-sat daily limit', txid: 'bee48c5f73f16a9ad83669b4a1350d01e07ebf104d155e2b557837e9fd04113d' },
  { edition: 'SolidCash vault', step: 'Paid 1,000 sats under the limit', txid: '93e9fdadaf3ebc5b5182a5b3dcd527b8ab9c6d8480160276a573b9d7b616aae6' },
  { edition: 'SolidCash vault', step: 'Rest of the vault rescued with two keys', txid: '305c7a47a2721ba1b290782df991b5a99bc1da7553b734d764f53e5f81ff913f' },
  { edition: 'Nostr identity', step: 'BCH address linked to a Nostr key', txid: '8cd9f453ae7f6ce506805136700a17f7cd87341f29d1857c7f4ce7c4729359ae' },
]
