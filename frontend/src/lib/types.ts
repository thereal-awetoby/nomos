// ── Nomos types ─────────────────────────────────────────────

export type WalletProviderType = 'wizardconnect' | 'wc2'

export interface Mandate {
  dailyLimitSats: number
  spentTodaySats: number
  dayMarker: number
  allowlistEnabled: boolean
  allowlist: string[]
  agentPk: string | null
  rescuePk: string | null
}

export interface VaultState {
  address: string
  tokenAddress: string
  balanceSats: number
  /** true once the vault's state NFT exists on-chain */
  deployed: boolean
  mandate: Mandate
}

export type TxStatus = 'paid' | 'refused'

export interface Receipt {
  id: string
  status: TxStatus
  amount: number
  destination: string
  /** who the destination is, when paid by Nostr name */
  destinationLabel?: string
  reason?: string
  txHash?: string
  mandate: Mandate
  timestamp: number
}

export interface WalletConnection {
  provider: WalletProviderType
  address: string
  pubkey: string
  connected: boolean
  /** WizardConnect receive index where funds were found (default 0) */
  wcIndex?: number
}

/** Immutable on-chain constructor params for the NomosVault covenant */
export interface VaultConfig {
  ownerPk: string       // hex 33-byte compressed pubkey
  agentPk: string       // hex, or '' if none
  dailyLimitSats: number
  allowlistEnabled: boolean
  allowedAddrs: string[] // up to 5 — cashaddresses (converted to bytes20 at contract instantiation)
  rescuePk: string      // hex, or '' if none
}
