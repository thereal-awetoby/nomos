// Backup and restore of what Nomos keeps in the browser, run in Node with a
// stand-in localStorage.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BACKUP_FORMAT, makeBackup, parseBackup, restoreBackup } from '../src/lib/backup'
import type { Receipt, VaultConfig } from '../src/lib/types'

const store = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)) },
  removeItem: (k: string) => { store.delete(k) },
}

const owner = '02' + 'ab'.repeat(32)
const other = '03' + 'cd'.repeat(32)
const vault = (ownerPk: string, dailyLimitSats = 10_000): VaultConfig => ({
  ownerPk, agentPk: '', rescuePk: '', dailyLimitSats, allowlistEnabled: false, allowedAddrs: [],
})
const receipt = (id: string, timestamp: string) => ({ id, status: 'paid', amount: 1000, destination: 'x', timestamp } as unknown as Receipt)

test('a backup holds the vaults and receipts stored here', () => {
  store.clear()
  store.set('nomos:vaultConfigs', JSON.stringify([vault(owner)]))
  store.set('nomos:receipts', JSON.stringify([receipt('r1', '2026-11-21T10:00:00Z')]))
  const b = makeBackup()
  assert.equal(b.format, BACKUP_FORMAT)
  assert.equal(b.network, 'mainnet')
  assert.equal(b.vaults.length, 1)
  assert.equal(b.receipts.length, 1)
})

test('restore adds what is missing and keeps what is here', () => {
  store.clear()
  store.set('nomos:vaultConfigs', JSON.stringify([vault(owner, 2_000)]))
  store.set('nomos:receipts', JSON.stringify([receipt('r1', '2026-11-21T10:00:00Z')]))
  const b = { ...makeBackup(), vaults: [vault(owner, 10_000), vault(other)], receipts: [receipt('r1', '2026-11-21T10:00:00Z'), receipt('r2', '2026-11-22T09:00:00Z')] }
  const added = restoreBackup(parseBackup(JSON.stringify(b)))
  assert.deepEqual(added, { vaults: 1, receipts: 1 })
  const vaults = JSON.parse(store.get('nomos:vaultConfigs')!) as VaultConfig[]
  assert.equal(vaults.find((v) => v.ownerPk === owner)!.dailyLimitSats, 2_000, 'the vault already here wins')
  assert.ok(vaults.some((v) => v.ownerPk === other))
  const receipts = JSON.parse(store.get('nomos:receipts')!) as Receipt[]
  assert.deepEqual(receipts.map((r) => r.id), ['r2', 'r1'], 'newest first')
})

test('a cleared browser gets everything back', () => {
  store.clear()
  store.set('nomos:vaultConfigs', JSON.stringify([vault(owner)]))
  store.set('nomos:receipts', JSON.stringify([receipt('r1', '2026-11-21T10:00:00Z')]))
  const text = JSON.stringify(makeBackup())
  store.clear()
  assert.deepEqual(restoreBackup(parseBackup(text)), { vaults: 1, receipts: 1 })
})

test('files that are not a Nomos backup are refused', () => {
  assert.throws(() => parseBackup('not json'), /not a Nomos backup/)
  assert.throws(() => parseBackup(JSON.stringify({ format: 'nomos-activity-export', receipts: [] })), /not a Nomos backup/)
  const good = makeBackup()
  assert.throws(() => parseBackup(JSON.stringify({ ...good, network: 'chipnet' })), /from chipnet/)
  assert.throws(() => parseBackup(JSON.stringify({ ...good, vaults: [{ ownerPk: 'nope' }] })), /vault Nomos cannot read/)
  assert.throws(() => parseBackup(JSON.stringify({ ...good, receipts: [{ amount: 1 }] })), /receipt Nomos cannot read/)
})
