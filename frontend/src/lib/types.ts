// ── Nomos types ─────────────────────────────────────────────

export type WalletProvider = 'wizardconnect' | 'wc2'

export interface Mandate {
  dailyLimitSats: number
  spentTodaySats: number
  dayMarker: number
  allowlistEnabled: boolean
  allowlist: string[] // up to 5 BCH addresses
  agentPk: string | null
  rescuePk: string | null
}

export interface VaultState {
  address: string
  tokenAddress: string // CashTokens-aware address for NFT UTXO
  balanceSats: number
  mandate: Mandate
}

export type TxStatus = 'paid' | 'refused'

export interface Receipt {
  id: string
  status: TxStatus
  amount: number
  destination: string
  reason?: string
  txHash?: string
  mandate: Mandate
  timestamp: number
}

export interface WalletConnection {
  provider: WalletProvider
  address: string
  pubkey: string
  connected: boolean
}

// ── Contract constructor config (immutable on-chain params) ─
export interface VaultConfig {
  ownerPk: string      // hex-encoded 33-byte compressed pubkey
  agentPk: string      // hex, or all-zeros if none
  dailyLimitSats: number
  allowlistEnabled: boolean
  allowedAddrs: string[] // exactly 5 bytes20 hashes (pad with zeros)
  rescuePk: string     // hex, or all-zeros if none
}
