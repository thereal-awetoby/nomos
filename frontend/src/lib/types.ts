// ── Nomos types ─────────────────────────────────────────────

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
  balanceSats: number
  mandate: Mandate
}

export type TxStatus = 'paid' | 'refused'

export interface Receipt {
  id: string
  status: TxStatus
  amount: number
  destination: string
  reason?: string // "exceeds daily limit" | "not allowlisted" | etc.
  txHash?: string
  mandate: Mandate
  timestamp: number
}

export type WalletProvider = 'wizardconnect' | 'xo'

export interface WalletConnection {
  provider: WalletProvider
  address: string
  pubkey: string
  connected: boolean
}
