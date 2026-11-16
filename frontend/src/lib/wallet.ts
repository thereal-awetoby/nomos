// ── Wallet connection layer ─────────────────────────────────
// Stubs for WizardConnect + XO. Replace with real SDK calls.

import type { WalletConnection, WalletProvider } from './types'

export async function connectWallet(
  provider: WalletProvider,
): Promise<WalletConnection> {
  // TODO: integrate WizardConnect SDK
  // TODO: integrate XO SDK
  console.log(`[nomos] connecting via ${provider}...`)

  // Placeholder — replace with real wallet connection
  throw new Error(`${provider} integration not yet wired. Implement in wallet.ts`)
}

export async function signTransaction(
  _provider: WalletProvider,
  _txHex: string,
): Promise<string> {
  throw new Error('signTransaction not yet implemented')
}

export async function getBalance(
  _provider: WalletProvider,
  _address: string,
): Promise<number> {
  throw new Error('getBalance not yet implemented')
}
