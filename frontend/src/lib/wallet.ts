// ── Wallet connection + signing layer ───────────────────────
// WizardConnect (QR relay via useWizardConnect hook in React)
// + BCH WalletConnect v2 (Cashonize / Paytaca / XO)

import type { WalletConnection, WalletProviderType } from './types'
import { WC_PROJECT_ID, appIconUrl } from './env'
import { binToHex } from '@wizardconnect/core'
import type { DappConnectionManager } from '@wizardconnect/dapp'
import {
  base64ToBin,
  cashAddressToLockingBytecode,
  decodeCashAddress,
  hash160,
  hash256,
  encodeCashAddress,
  encodeTransaction,
  binToHex as libBinToHex,
  secp256k1,
  sha256,
  stringify,
} from '@bitauth/libauth'
import { ADDRESS_PREFIX, WC2_CHAIN } from './network'
import type { RecoveryId } from '@bitauth/libauth'
import { scanHdWallet } from './hdwallet'
import type { HdWallet } from './hdwallet'

// ── Active references (set by React layer) ────────────────
let wcManager: DappConnectionManager | null = null

/** Called by WalletContext when the hook's manager becomes available */
export function setWcManager(mgr: DappConnectionManager | null): void {
  wcManager = mgr
}

export function getWcManager(): DappConnectionManager | null {
  return wcManager
}

// ── Derive BCH cashaddr from a compressed public key ──────
export function pubkeyToAddress(
  pubkeyBytes: Uint8Array,
  prefix: 'bitcoincash' | 'bchtest' = 'bitcoincash',
): string {
  const h = hash160(pubkeyBytes)
  const result = encodeCashAddress({ prefix, type: 'p2pkh', payload: h })
  if (typeof result === 'string') return result
  return (result as { address: string }).address
}

/** Get the hex pubkey from WizardConnect manager (child 0, selected receive index) */
export function getWcPubkeyHex(index: number | bigint = 0): string {
  if (!wcManager) return ''
  const raw = wcManager.getPubkey(0, BigInt(index))
  if (!raw) return ''
  return binToHex(raw)
}

/** Get the BCH address from WizardConnect pubkey at a given receive index */
export function getWcAddress(
  network: 'mainnet' | 'chipnet' = 'mainnet',
  index: number | bigint = 0,
): string {
  if (!wcManager) return ''
  const raw = wcManager.getPubkey(0, BigInt(index))
  if (!raw) return ''
  return pubkeyToAddress(raw, network === 'mainnet' ? 'bitcoincash' : 'bchtest')
}

/**
 * Scan WizardConnect receive indices 0..maxIndex and return the first
 * address that holds UTXOs on-chain. Falls back to index 0.
 */
export async function findFundedWcAddress(
  network: 'mainnet' | 'chipnet' = 'mainnet',
  maxIndex = 20,
): Promise<{ address: string; index: number }> {
  // Lazy-import to avoid circular deps
  const { ElectrumNetworkProvider } = await import('cashscript')
  const provider = new ElectrumNetworkProvider(network === 'chipnet' ? 'chipnet' : 'mainnet')

  for (let i = 0; i < maxIndex; i++) {
    const addr = getWcAddress(network, i)
    if (!addr) continue
    try {
      const utxos = await provider.getUtxos(addr)
      const bal = utxos.filter((u: any) => !u.token).reduce((s: bigint, u: any) => s + u.satoshis, 0n)
      if (bal > 0n) return { address: addr, index: i }
    } catch (e) {
      console.warn(`[nomos] scan index ${i} failed:`, e)
    }
  }
  // Fallback to index 0
  return { address: getWcAddress(network, 0), index: 0 }
}

// ── The whole wallet (WizardConnect) ───────────────────────
// WizardConnect shares the wallet's receive, change and DeFi keys, so Nomos
// can see every address the wallet uses, not only the one it works with.

/** An address's script hash, as Electrum servers index it. */
function electrumScripthash(address: string): string {
  const lock = cashAddressToLockingBytecode(address)
  if (typeof lock === 'string') throw new Error(lock)
  return libBinToHex(sha256.hash(lock.bytecode).reverse())
}

const WALLET_SCAN_TTL_MS = 20_000
let walletScan: { key: string; at: number; result: Promise<HdWallet | null> } | null = null

/** Forget the last scan, after coins moved. */
export function forgetWalletScan(): void {
  walletScan = null
}

/**
 * Every plain BCH coin in the wallet connected with WizardConnect, found the
 * way the wallet finds its own. A scan is reused for 20 seconds unless
 * `force` is set. Null when no WizardConnect wallet is connected.
 */
export function scanWcWallet(network: 'mainnet' | 'chipnet' = 'mainnet', force = false): Promise<HdWallet | null> {
  const manager = wcManager
  if (!manager) return Promise.resolve(null)
  const key = `${network}:${getWcAddress(network, 0)}`
  if (!force && walletScan && walletScan.key === key && Date.now() - walletScan.at < WALLET_SCAN_TTL_MS) {
    return walletScan.result
  }
  const prefix = network === 'mainnet' ? 'bitcoincash' : 'bchtest'
  const result = (async () => {
    const { ElectrumNetworkProvider } = await import('cashscript')
    const provider = new ElectrumNetworkProvider(network, { manualConnectionManagement: true })
    await provider.connect()
    try {
      return await scanHdWallet({
        addressAt: (_path, child, index) => {
          if (!manager.hasPath(child)) return null
          const raw = manager.getPubkey(child, BigInt(index))
          return raw ? pubkeyToAddress(raw, prefix) : null
        },
        used: async (address) => {
          const history = await provider.performRequest('blockchain.scripthash.get_history', electrumScripthash(address))
          return Array.isArray(history) && history.length > 0
        },
        coins: (address) => provider.getUtxos(address),
      })
    } finally {
      provider.disconnect().catch(() => {})
    }
  })()
  walletScan = { key, at: Date.now(), result }
  // A failed scan is not kept, so the next call tries again.
  result.catch(() => { if (walletScan?.result === result) walletScan = null })
  return result
}

// ── BCH WalletConnect v2 ───────────────────────────────────

let wc2SignClient: any = null
let wc2Session: any = null

export async function connectWc2(): Promise<WalletConnection> {
  if (!WC_PROJECT_ID) throw new Error('WalletConnect is not set up on this site; use WizardConnect')
  const { SignClient } = await import('@walletconnect/sign-client')

  wc2SignClient = await SignClient.init({
    projectId: WC_PROJECT_ID,
    metadata: {
      name: 'Nomos',
      description: 'On-chain spend mandates for BCH',
      url: window.location.origin,
      icons: [appIconUrl()],
    },
  })

  const { uri, approval } = await wc2SignClient.connect({
    requiredNamespaces: {
      bch: {
        // bch_signMessage lets Nomos read the public key (see requestWc2Pubkey).
        methods: ['bch_getAddresses', 'bch_signTransaction', 'bch_signMessage'],
        chains: [WC2_CHAIN],
        events: ['accountsChanged'],
      },
    },
  })

  // Emit URI so Connect.tsx can render QR code
  if (uri) {
    window.dispatchEvent(new CustomEvent('nomos:wc2:uri', { detail: uri }))
  }

  wc2Session = await approval()

  // Parse address from WC v2 session accounts
  const accounts: string[] = wc2Session.namespaces?.bch?.accounts ?? []
  const rawAccount = accounts[0] ?? ''
  const parts = rawAccount.split(':')
  const address =
    parts.length >= 3 ? `${ADDRESS_PREFIX}:${parts.slice(2).join(':')}` : rawAccount

  if (!address) throw new Error('WalletConnect: no address received')

  // Fetch pubkey via bch_getAddresses
  let pubkey = ''
  try {
    const addrResult = await wc2SignClient.request({
      topic: wc2Session.topic,
      chainId: WC2_CHAIN,
      request: { method: 'bch_getAddresses', params: {} },
    })
    if (Array.isArray(addrResult)) {
      const entry = addrResult.find((a: any) => a.pubkey || a.publicKey)
      pubkey = entry?.pubkey ?? entry?.publicKey ?? ''
    } else if (addrResult?.pubkey) {
      pubkey = addrResult.pubkey
    } else if (addrResult?.publicKey) {
      pubkey = addrResult.publicKey
    }
  } catch {
    console.warn('[nomos] bch_getAddresses not supported by this wallet')
  }

  // Wallets share addresses, not public keys; ask for a signed message.
  if (!pubkey) {
    try {
      pubkey = await requestWc2Pubkey(address)
    } catch (err) {
      console.warn('[nomos] the wallet did not share a public key:', err)
    }
  }

  return { provider: 'wc2', address, pubkey, connected: true }
}

// ── Public key from a signed message ──────────────────────
// The vault contract needs the owner's public key. A BCH WalletConnect
// wallet shares only addresses, but a recoverable message signature
// ("Bitcoin Signed Message", the format BCH wallets use) carries the key:
// recover it, and keep it only if it hashes to the connected address.

const MESSAGE_MAGIC = '\x18Bitcoin Signed Message:\n'

function signedMessageHash(message: string): Uint8Array {
  const enc = new TextEncoder()
  const magic = enc.encode(MESSAGE_MAGIC)
  const body = enc.encode(message)
  const length = body.length < 0xfd
    ? Uint8Array.of(body.length)
    : Uint8Array.of(0xfd, body.length & 0xff, body.length >> 8)
  const all = new Uint8Array(magic.length + length.length + body.length)
  all.set(magic, 0)
  all.set(length, magic.length)
  all.set(body, magic.length + length.length)
  return hash256(all)
}

/** Recover the compressed public key behind a message signature for `address`. */
/** True when the address pays to this public key (same hash160, whatever the prefix or token flag). */
export function addressMatchesPubkey(address: string, pubkeyHex: string): boolean {
  if (!address || !/^[0-9a-f]{66}$/i.test(pubkeyHex || '')) return false
  const decoded = decodeCashAddress(address)
  if (typeof decoded === 'string') return false
  const pk = new Uint8Array(pubkeyHex.match(/../g)!.map((h) => parseInt(h, 16)))
  return libBinToHex(decoded.payload) === libBinToHex(hash160(pk) as Uint8Array)
}

export function recoverMessageSigner(message: string, signatureBase64: string, address: string): string {
  const signature = base64ToBin(signatureBase64.trim())
  if (signature.length !== 65) throw new Error('The wallet returned a signature in an unknown format')
  const decoded = decodeCashAddress(address)
  if (typeof decoded === 'string') throw new Error(decoded)
  const expected = libBinToHex(decoded.payload)
  const hash = signedMessageHash(message)
  const compact = signature.slice(1)
  const header = signature[0]
  // The header names the recovery id (27-34); try it first, then the rest.
  const first = header >= 27 && header <= 34 ? (header - 27) & 3 : 0
  for (const id of [first, 0, 1, 2, 3]) {
    const key = secp256k1.recoverPublicKeyCompressed(compact, id as RecoveryId, hash)
    if (typeof key !== 'string' && libBinToHex(hash160(key)) === expected) return libBinToHex(key)
  }
  throw new Error('The signature does not match your address')
}

/** Ask the connected WalletConnect wallet to sign a message, and return its public key. */
export async function requestWc2Pubkey(address: string): Promise<string> {
  if (!wc2SignClient || !wc2Session) throw new Error('No active WalletConnect session')
  const message = `Nomos: share the public key of ${address} to set up your vault. This moves no funds. ${new Date().toISOString()}`
  const result = await wc2SignClient.request({
    topic: wc2Session.topic,
    chainId: WC2_CHAIN,
    request: {
      method: 'bch_signMessage',
      params: { message, userPrompt: 'Share your public key with Nomos (no funds move)' },
    },
  })
  const signature = typeof result === 'string' ? result : result?.signature
  if (!signature) throw new Error('The wallet did not return a signature')
  return recoverMessageSigner(message, signature, address)
}

/**
 * Reopen the WalletConnect session saved by an earlier visit, so a reload
 * keeps signing working. Returns false when there is none for this address.
 */
export async function restoreWc2Session(address: string): Promise<boolean> {
  if (!WC_PROJECT_ID) return false
  if (wc2SignClient && wc2Session) return true
  const { SignClient } = await import('@walletconnect/sign-client')
  const client = await SignClient.init({
    projectId: WC_PROJECT_ID,
    metadata: {
      name: 'Nomos',
      description: 'On-chain spend mandates for BCH',
      url: window.location.origin,
      icons: [appIconUrl()],
    },
  })
  const body = address.split(':').pop()
  const sessions = client.session.getAll()
    .filter((s: any) => (s.namespaces?.bch?.accounts ?? []).some((a: string) => a.split(':').pop() === body))
    .filter((s: any) => !s.expiry || s.expiry * 1000 > Date.now())
  const session = sessions[sessions.length - 1]
  if (!session) return false
  wc2SignClient = client
  wc2Session = session
  return true
}

// ── Signing ───────────────────────────────────────────────

/**
 * WizardConnect relays requests with plain JSON.stringify, and wallets decode
 * `transaction` with hexToBin. So the transaction goes as raw hex, byte arrays
 * as plain hex, and bigints in libauth's `<bigint: Xn>` form.
 */
function toRelayValue(value: unknown): unknown {
  if (typeof value === 'bigint') return `<bigint: ${value.toString()}n>`
  if (value instanceof Uint8Array) return libBinToHex(value)
  if (Array.isArray(value)) return value.map(toRelayValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toRelayValue(v)]))
  }
  return value
}

function toWizardRequest(wcTxObj: any): { transaction: string; sourceOutputs: any[]; broadcast?: boolean; userPrompt?: string } {
  const { transaction, sourceOutputs, ...options } = wcTxObj ?? {}
  const txHex = typeof transaction === 'string' ? transaction : libBinToHex(encodeTransaction(transaction))
  return {
    ...(toRelayValue(options) as object),
    transaction: txHex,
    sourceOutputs: (toRelayValue(sourceOutputs ?? []) as any[]),
  }
}

/**
 * Sign a WC transaction object via the active wallet session.
 * Returns { signedTransaction, signedTransactionHash? }
 */
export async function signWcTransaction(
  provider: WalletProviderType,
  wcTxObj: any,
  // Set when inputs come from several addresses of the wallet: each input's path and index.
  inputPaths?: [number, string, number][],
  wcIndex: number = 0,
): Promise<{ txid: string; signedTransaction: string }> {
  if (provider === 'wizardconnect') {
    if (!wcManager) throw new Error('No active WizardConnect session')
    const request = toWizardRequest(wcTxObj)
    // WizardConnect (hdwalletv1) identifies keys by path NAME ('receive',
    // 'change', 'defi') plus address index, not by a derivation string. Nomos
    // uses the receive key at the index where we found funds for every input,
    // so sign them all with it unless told otherwise.
    const inputCount: number = request.sourceOutputs.length || 1
    const paths = inputPaths ?? Array.from({ length: inputCount }, (_, i) => [i, 'receive', wcIndex] as [number, string, number])
    const result: any = await wcManager.signTransaction({
      transaction: request as any,
      inputPaths: paths as any,
    })
    // hdwalletv1 wallets return only the signed hex and never broadcast;
    // the caller broadcasts.
    return {
      txid: '',
      signedTransaction: result?.signedTransaction ?? result?.signedTransactionHex ?? '',
    }
  }

  if (provider === 'wc2') {
    if (!wc2SignClient || !wc2Session)
      throw new Error('No active WalletConnect session')
    const result = await wc2SignClient.request({
      topic: wc2Session.topic,
      chainId: WC2_CHAIN,
      // WC2 wallets parse libauth's extended JSON (bigint and Uint8Array
      // markers), as in the CashScript WalletConnect guide.
      request: { method: 'bch_signTransaction', params: JSON.parse(stringify(wcTxObj)) },
    })
    return {
      txid: result?.signedTransactionHash ?? '',
      signedTransaction: result?.signedTransaction ?? '',
    }
  }

  throw new Error(`Cannot sign: unknown provider ${provider}`)
}

// ── Disconnect ────────────────────────────────────────────

/** Disconnect WC2 session (WizardConnect disconnect is handled by the hook) */
export async function disconnectWc2(): Promise<void> {
  if (wc2SignClient && wc2Session) {
    try {
      await wc2SignClient.disconnect({
        topic: wc2Session.topic,
        reason: { code: 6000, message: 'User disconnected' },
      })
    } catch { /* best-effort */ }
  }
  wc2SignClient = null
  wc2Session = null
}
