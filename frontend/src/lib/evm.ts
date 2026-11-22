// ── Base (EVM) side of the PUSD ↔ USDC swap ─────────────────
// USDC on Base is locked in contracts/evm/SwapLock.sol behind the same
// sha256 secret hash as the PUSD lock on Bitcoin Cash. Calls are ABI-encoded
// here by hand (fixed-size arguments only), so no EVM library is needed.
// Function and event IDs were computed with keccak256 and checked against
// `solc --hashes`.

import artifact from './SwapLockEvm.json'
import { WC_PROJECT_ID, appIconUrl } from './env'

export const BASE_CHAIN_ID = 8453
const BASE_CHAIN_HEX = '0x2105'
const BASE_CAIP = `eip155:${BASE_CHAIN_ID}`
/** Circle's native USDC on Base. */
export const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
export const USDC_DECIMALS = 6
export const BASE_EXPLORER_TX = 'https://basescan.org/tx/'
export const BASE_EXPLORER_ADDRESS = 'https://basescan.org/address/'

/**
 * SwapLock on Base for this site, deployed from the Swap page on 22 Nov 2026
 * (tx 0x82b1e50182fd6383bff76df08258a31fbd08fe9478558c17581adef43569e74f).
 * Every offer still names the contract it uses, and any address is checked
 * against the audited bytecode before it is trusted.
 */
export const SWAPLOCK_BASE = '0xe366dae0ccd2cfab7fc311652d9d4b48c82c1446'
const SWAPLOCK_KEY = 'nomos:baseSwapLock'
/** Runtime code of contracts/evm/SwapLock.sol, from the same compile as `bytecode`. */
const SWAPLOCK_RUNTIME = ((artifact as { deployedBytecode?: string }).deployedBytecode ?? '').toLowerCase()

const RPCS = ['https://mainnet.base.org', 'https://base.llamarpc.com', 'https://base-rpc.publicnode.com']

const SEL = {
  approve: '095ea7b3',
  allowance: 'dd62ed3e',
  balanceOf: '70a08231',
  lock: '557a5fa0',
  claim: 'bd66528a',
  refund: '7249fbb6',
  locks: 'ed5e8437',
}
const TOPIC_CLAIMED = '0x38d6042dbdae8e73a7f6afbabd3fbe0873f9f5ed3cd71294591c3908c2e65fee'

export function swapLockAddress(): string {
  if (SWAPLOCK_BASE) return SWAPLOCK_BASE
  try {
    return localStorage.getItem(SWAPLOCK_KEY) ?? ''
  } catch {
    return ''
  }
}

function rememberSwapLock(address: string) {
  try {
    localStorage.setItem(SWAPLOCK_KEY, address)
  } catch { /* the address is still shown on screen */ }
}

// ── ABI encoding (fixed-size types only) ───────────────────

function strip0x(hex: string): string {
  return hex.startsWith('0x') ? hex.slice(2) : hex
}

function word(hex: string): string {
  const h = strip0x(hex).toLowerCase()
  if (h.length > 64) throw new Error('Value does not fit in 32 bytes')
  return h.padStart(64, '0')
}

function addressWord(address: string): string {
  if (!isEvmAddress(address)) throw new Error(`Not an EVM address: ${address}`)
  return word(address)
}

function uintWord(value: bigint): string {
  if (value < 0n) throw new Error('Negative amount')
  return word(value.toString(16))
}

function call(selector: string, ...words: string[]): string {
  return `0x${selector}${words.join('')}`
}

export function isEvmAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value.trim())
}

/** "12.5" with 6 decimals → 12500000n. */
export function parseUnits(value: string, decimals: number): bigint {
  const v = value.trim()
  if (!/^\d+(\.\d+)?$/.test(v)) throw new Error('Enter a positive number')
  const [whole, frac = ''] = v.split('.')
  if (frac.length > decimals) throw new Error(`At most ${decimals} decimal places`)
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, '0') || '0')
}

export function formatUnits(value: bigint, decimals: number): string {
  const s = value.toString().padStart(decimals + 1, '0')
  const whole = s.slice(0, s.length - decimals)
  const frac = s.slice(s.length - decimals).replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : whole
}

// ── JSON-RPC reads (public Base endpoints) ─────────────────

async function rpc<T = any>(method: string, params: unknown[]): Promise<T> {
  let lastError: unknown
  for (const url of RPCS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      })
      const body = await res.json()
      if (body.error) throw new Error(body.error.message ?? 'RPC error')
      return body.result as T
    } catch (err) {
      lastError = err
    }
  }
  throw new Error(`Base RPC failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

async function ethCall(to: string, data: string): Promise<string> {
  return rpc<string>('eth_call', [{ to, data }, 'latest'])
}

const verifiedContracts = new Set<string>()

/**
 * True when `address` on Base runs exactly the audited SwapLock bytecode.
 * An offer names its contract, so this check is what makes a counterparty's
 * contract safe to read from and to approve USDC to. Only successes are
 * cached: a fresh deployment can read as empty for a moment.
 */
export async function isSwapLock(address: string): Promise<boolean> {
  if (!isEvmAddress(address) || SWAPLOCK_RUNTIME.length <= 2) return false
  const key = address.trim().toLowerCase()
  if (verifiedContracts.has(key)) return true
  const code = String(await rpc<string>('eth_getCode', [key, 'latest'])).toLowerCase()
  if (code !== SWAPLOCK_RUNTIME) return false
  verifiedContracts.add(key)
  return true
}

function contractFor(contract?: string): string {
  const address = (contract || swapLockAddress()).trim()
  if (!address) throw new Error('SwapLock is not deployed on Base yet')
  return address
}

async function verifiedContract(contract?: string): Promise<string> {
  const address = contractFor(contract)
  if (!(await isSwapLock(address))) throw new Error('That Base contract is not the Nomos SwapLock; nothing was sent')
  return address
}

export async function usdcBalance(owner: string): Promise<bigint> {
  return BigInt(await ethCall(USDC_BASE, call(SEL.balanceOf, addressWord(owner))))
}

async function usdcAllowance(owner: string, spender: string): Promise<bigint> {
  return BigInt(await ethCall(USDC_BASE, call(SEL.allowance, addressWord(owner), addressWord(spender))))
}

export interface BaseLock {
  token: string
  sender: string
  recipient: string
  amount: bigint
  refundAfter: number
  done: boolean
}

/** Read a lock by its secret hash; null when none exists. Check the contract with isSwapLock before trusting this. */
export async function readBaseLock(secretHash: string, contract?: string): Promise<BaseLock | null> {
  const out = strip0x(await ethCall(contractFor(contract), call(SEL.locks, word(secretHash))))
  const w = (i: number) => out.slice(i * 64, (i + 1) * 64)
  const sender = `0x${w(1).slice(24)}`
  if (/^0x0{40}$/.test(sender)) return null
  return {
    token: `0x${w(0).slice(24)}`,
    sender,
    recipient: `0x${w(2).slice(24)}`,
    amount: BigInt(`0x${w(3)}`),
    refundAfter: Number(BigInt(`0x${w(4)}`)),
    done: BigInt(`0x${w(5)}`) !== 0n,
  }
}

/** Find the secret published by a claim on Base, searching from `fromBlock`. */
export async function findBaseSecret(secretHash: string, fromBlock: number, contract?: string): Promise<string | null> {
  const address = (contract || swapLockAddress()).trim()
  if (!address) return null
  const logs = await rpc<any[]>('eth_getLogs', [{
    address,
    topics: [TOPIC_CLAIMED, `0x${word(secretHash)}`],
    fromBlock: `0x${Math.max(0, fromBlock).toString(16)}`,
    toBlock: 'latest',
  }])
  const data = logs[0]?.data
  return typeof data === 'string' ? `0x${strip0x(data).slice(0, 64)}` : null
}

export async function latestBlock(): Promise<number> {
  return Number(BigInt(await rpc<string>('eth_blockNumber', [])))
}

async function waitForReceipt(hash: string): Promise<any> {
  for (let i = 0; i < 90; i++) {
    const receipt = await rpc<any>('eth_getTransactionReceipt', [hash])
    if (receipt) {
      if (receipt.status !== '0x1') throw new Error(`Base transaction failed: ${hash}`)
      return receipt
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  throw new Error(`No receipt yet for ${hash}; check it on Basescan`)
}

// ── Wallet connection: injected (EIP-1193) or WalletConnect ─

interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<any>
}

let wallet: Eip1193 | null = null
let account: string | null = null
let wcClient: any = null
let wcTopic: string | null = null

export function baseAccount(): string | null {
  return account
}

export function hasInjectedWallet(): boolean {
  return Boolean((window as unknown as { ethereum?: Eip1193 }).ethereum)
}

/** Use the wallet built into the browser (MetaMask, Coinbase Wallet, Brave). */
export async function connectInjected(): Promise<string> {
  const injected = (window as unknown as { ethereum?: Eip1193 }).ethereum
  if (!injected) throw new Error('No browser wallet found')
  const accounts: string[] = await injected.request({ method: 'eth_requestAccounts' })
  if (!accounts[0]) throw new Error('The wallet shared no account')
  try {
    await injected.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BASE_CHAIN_HEX }] })
  } catch (err: any) {
    if (err?.code !== 4902) throw err
    await injected.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: BASE_CHAIN_HEX,
        chainName: 'Base',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: [RPCS[0]],
        blockExplorerUrls: ['https://basescan.org'],
      }],
    })
  }
  wallet = injected
  account = accounts[0]
  return account
}

/** Pair a mobile or desktop wallet over WalletConnect; `onUri` receives the pairing link. */
export async function connectWalletConnect(onUri: (uri: string) => void): Promise<string> {
  if (!WC_PROJECT_ID) throw new Error('WalletConnect is not set up on this site; use a browser wallet')
  const { SignClient } = await import('@walletconnect/sign-client')
  wcClient ??= await SignClient.init({
    projectId: WC_PROJECT_ID,
    customStoragePrefix: 'nomos-base',
    metadata: {
      name: 'Nomos',
      description: 'PUSD and USDC atomic swap',
      url: window.location.origin,
      icons: [appIconUrl()],
    },
  })
  const { uri, approval } = await wcClient.connect({
    optionalNamespaces: {
      eip155: {
        chains: [BASE_CAIP],
        methods: ['eth_sendTransaction'],
        events: ['accountsChanged', 'chainChanged'],
      },
    },
  })
  if (uri) onUri(uri)
  const session = await approval()
  const accounts: string[] = session.namespaces?.eip155?.accounts ?? []
  const onBase = accounts.find((a) => a.startsWith(`${BASE_CAIP}:`))
  if (!onBase) throw new Error('The wallet did not share a Base account')
  wcTopic = session.topic
  account = onBase.split(':')[2]
  wallet = {
    request: ({ method, params }) => wcClient.request({ topic: wcTopic, chainId: BASE_CAIP, request: { method, params } }),
  }
  return account
}

async function send(to: string | null, data: string): Promise<{ hash: string; receipt: any }> {
  if (!wallet || !account) throw new Error('Connect a Base wallet first')
  const tx: Record<string, string> = { from: account, data, value: '0x0' }
  if (to) tx.to = to
  const hash: string = await wallet.request({ method: 'eth_sendTransaction', params: [tx] })
  return { hash, receipt: await waitForReceipt(hash) }
}

// ── SwapLock actions ───────────────────────────────────────

/** Deploy SwapLock on Base from the connected wallet (one time). */
export async function deploySwapLock(): Promise<{ address: string; hash: string }> {
  const { hash, receipt } = await send(null, (artifact as { bytecode: string }).bytecode)
  const address: string | undefined = receipt.contractAddress
  if (!address) throw new Error('The deployment receipt has no contract address')
  rememberSwapLock(address)
  return { address, hash }
}

/** Approve (if needed) and lock USDC for `recipient`. Returns the lock tx hash and its block. */
export async function lockUsdc(secretHash: string, recipient: string, amount: bigint, refundAfter: number, swapLock?: string): Promise<{ hash: string; block: number }> {
  if (!account) throw new Error('Connect a Base wallet first')
  // Never approve USDC to a contract that is not the audited SwapLock.
  const contract = await verifiedContract(swapLock)
  if (await usdcAllowance(account, contract) < amount) {
    await send(USDC_BASE, call(SEL.approve, addressWord(contract), uintWord(amount)))
  }
  const { hash, receipt } = await send(contract, call(
    SEL.lock, word(secretHash), addressWord(USDC_BASE), addressWord(recipient), uintWord(amount), uintWord(BigInt(refundAfter)),
  ))
  return { hash, block: Number(BigInt(receipt.blockNumber)) }
}

/** Claim a Base lock with the secret; the USDC always goes to the lock's recipient. */
export async function claimUsdc(secret: string, swapLock?: string): Promise<string> {
  // Claiming publishes the secret, so only ever do it on the audited contract.
  const contract = await verifiedContract(swapLock)
  return (await send(contract, call(SEL.claim, word(secret)))).hash
}

export async function refundUsdc(secretHash: string, swapLock?: string): Promise<string> {
  const contract = await verifiedContract(swapLock)
  return (await send(contract, call(SEL.refund, word(secretHash)))).hash
}
