// ── Contract interaction layer ──────────────────────────────
// Wraps CashScript SDK calls for NomosVault covenant.

import type { Mandate, Receipt } from './types'

// Contract artifact will be imported from compiled CashScript output
// import artifact from '../../../contracts/artifacts/NomosVault.json'

const DUST_LIMIT = 546
const MINER_FEE = 1000

/** Get current UTC day number */
export function currentDayMarker(): number {
  return Math.floor(Date.now() / 1000 / 86400)
}

/** Calculate remaining daily budget */
export function remainingToday(mandate: Mandate): number {
  const today = currentDayMarker()
  if (today !== mandate.dayMarker) return mandate.dailyLimitSats
  return Math.max(0, mandate.dailyLimitSats - mandate.spentTodaySats)
}

/** Check if a spend would be refused (client-side pre-check) */
export function wouldRefuse(
  mandate: Mandate,
  amountSats: number,
  destination: string,
): { refused: boolean; reason?: string } {
  const remaining = remainingToday(mandate)

  if (amountSats <= 0) {
    return { refused: true, reason: 'Amount must be positive' }
  }

  if (amountSats > remaining) {
    return {
      refused: true,
      reason: `Refused: exceeds daily limit (${remaining} sats remaining)`,
    }
  }

  if (mandate.allowlistEnabled) {
    if (!mandate.allowlist.includes(destination)) {
      return { refused: true, reason: 'Refused: destination not allowlisted' }
    }
  }

  return { refused: false }
}

/** Build + broadcast a spend transaction via the covenant */
export async function executeSpend(
  _mandate: Mandate,
  _amountSats: number,
  _destination: string,
  _signerPk: string,
): Promise<Receipt> {
  // TODO: wire CashScript SDK
  // 1. Load contract with current state params
  // 2. Build spend() function call
  // 3. Set locktime to current unix time
  // 4. Sign via wallet provider
  // 5. Broadcast
  // 6. Return receipt
  throw new Error('executeSpend not yet wired to CashScript SDK')
}

/** Build + broadcast a setMandate transaction */
export async function executeSetMandate(
  _currentMandate: Mandate,
  _newMandate: Partial<Mandate>,
  _ownerPk: string,
): Promise<string> {
  // TODO: wire CashScript SDK
  throw new Error('executeSetMandate not yet wired to CashScript SDK')
}

/** Build + broadcast a rescue transaction */
export async function executeRescue(
  _mandate: Mandate,
  _destination: string,
  _ownerPk: string,
  _rescuePk: string,
): Promise<string> {
  // TODO: wire CashScript SDK
  throw new Error('executeRescue not yet wired to CashScript SDK')
}

export { DUST_LIMIT, MINER_FEE }
