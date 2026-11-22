// Back up and restore what Nomos keeps in this browser: the vaults it knows and
// their receipts. The vaults and their rules live on chain; this file only
// stops the app forgetting which vault is yours when browsing data is cleared.

import { BCH_NETWORK, networkKey } from './network'
import type { Receipt, VaultConfig } from './types'

export const BACKUP_FORMAT = 'nomos-backup'

export interface NomosBackup {
  format: typeof BACKUP_FORMAT
  version: 1
  network: string
  savedAt: string
  note: string
  vaults: VaultConfig[]
  receipts: Receipt[]
}

const configsKey = () => networkKey('nomos:vaultConfigs')
const legacyConfigKey = () => networkKey('nomos:vaultConfig')
const receiptsKey = () => networkKey('nomos:receipts')

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function storedVaults(): VaultConfig[] {
  const list = read<VaultConfig[] | null>(configsKey(), null)
  if (Array.isArray(list)) return list
  const legacy = read<VaultConfig | null>(legacyConfigKey(), null)
  return legacy ? [legacy] : []
}

export function makeBackup(): NomosBackup {
  return {
    format: BACKUP_FORMAT,
    version: 1,
    network: BCH_NETWORK,
    savedAt: new Date().toISOString(),
    note: 'The vaults Nomos knows in this browser and their receipts. Holds public keys and rules only, never a private key. Receipts may include signed raw transactions.',
    vaults: storedVaults(),
    receipts: read<Receipt[]>(receiptsKey(), []),
  }
}

export function downloadBackup(): void {
  const backup = makeBackup()
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `nomos-backup-${backup.network}-${backup.savedAt.slice(0, 10)}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const PUBKEY = /^0[23][0-9a-f]{64}$/i
const optionalKey = (v: unknown) => v === '' || (typeof v === 'string' && PUBKEY.test(v))

function isVaultConfig(v: unknown): v is VaultConfig {
  if (!v || typeof v !== 'object') return false
  const c = v as Record<string, unknown>
  return typeof c.ownerPk === 'string' && PUBKEY.test(c.ownerPk)
    && optionalKey(c.agentPk) && optionalKey(c.rescuePk)
    && Number.isSafeInteger(c.dailyLimitSats) && (c.dailyLimitSats as number) > 0
    && typeof c.allowlistEnabled === 'boolean'
    && Array.isArray(c.allowedAddrs) && c.allowedAddrs.length <= 5
    && c.allowedAddrs.every((a) => typeof a === 'string')
}

function isReceipt(v: unknown): v is Receipt {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  return typeof r.id === 'string' && r.id.length > 0 && typeof r.status === 'string'
}

/** Check a backup file's text. Throws a message the person can act on. */
export function parseBackup(text: string): NomosBackup {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('That file is not a Nomos backup.')
  }
  const b = data as Partial<NomosBackup> | null
  if (!b || b.format !== BACKUP_FORMAT || b.version !== 1) {
    throw new Error('That file is not a Nomos backup. Choose the file Download backup saved.')
  }
  if (b.network !== BCH_NETWORK) {
    throw new Error(`That backup is from ${b.network}. Switch Nomos to ${b.network} first, then restore it.`)
  }
  if (!Array.isArray(b.vaults) || !b.vaults.every(isVaultConfig)) {
    throw new Error('That backup has a vault Nomos cannot read, so nothing was restored.')
  }
  if (!Array.isArray(b.receipts) || !b.receipts.every(isReceipt)) {
    throw new Error('That backup has a receipt Nomos cannot read, so nothing was restored.')
  }
  return b as NomosBackup
}

/**
 * Add the backup's vaults and receipts to this browser. What is already here
 * stays as it is: a vault is matched by its owner key, a receipt by its id.
 */
export function restoreBackup(backup: NomosBackup): { vaults: number; receipts: number } {
  const vaults = storedVaults()
  const newVaults = backup.vaults.filter((v) => !vaults.some((c) => c.ownerPk === v.ownerPk))
  const receipts = read<Receipt[]>(receiptsKey(), [])
  const ids = new Set(receipts.map((r) => r.id))
  const newReceipts = backup.receipts.filter((r) => !ids.has(r.id))
  const merged = [...receipts, ...newReceipts]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  localStorage.setItem(configsKey(), JSON.stringify([...vaults, ...newVaults]))
  localStorage.setItem(receiptsKey(), JSON.stringify(merged))
  return { vaults: newVaults.length, receipts: newReceipts.length }
}
