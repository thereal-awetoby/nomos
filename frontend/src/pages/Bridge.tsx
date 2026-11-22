import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useWallet } from '../context/WalletContext'
import { useToast } from '../components/Toast'
import { shortAddr } from '../components/ui'
import { EXPLORER_TX_URL } from '../lib/contract'
import { qrColors } from '../lib/theme'
import {
  PUSD_DECIMALS,
  newSecret,
  hashSecret,
  encodeOffer,
  decodeOffer,
  bchLockAddress,
  baseLockParams,
  bchLockParams,
  readBchLock,
  lockPusd,
  claimPusd,
  refundPusd,
  findBchSecret,
  pusdBalance,
} from '../lib/swap'
import type { SwapDirection, SwapOffer } from '../lib/swap'
import {
  USDC_DECIMALS,
  USDC_BASE,
  BASE_EXPLORER_TX,
  BASE_EXPLORER_ADDRESS,
  parseUnits,
  formatUnits,
  isEvmAddress,
  isSwapLock,
  swapLockAddress,
  hasInjectedWallet,
  connectInjected,
  connectWalletConnect,
  baseAccount,
  deploySwapLock,
  readBaseLock,
  findBaseSecret,
  lockUsdc,
  claimUsdc,
  refundUsdc,
  latestBlock,
  usdcBalance,
} from '../lib/evm'
import type { BaseLock } from '../lib/evm'
import { WALLETCONNECT_ENABLED } from '../lib/env'
import { IS_CHIPNET, switchNetwork } from '../lib/network'
const HOUR = 3600
const INITIATOR_LOCK_S = 24 * HOUR
const RESPONDER_LOCK_S = 12 * HOUR
/** BCH timelocks follow median time past, which trails the clock by about an hour. */
const BCH_TIME_LAG_S = HOUR
type Role = 'initiator' | 'responder'

interface Progress {
  bchLockTxid?: string
  bchClaimTxid?: string
  bchRefundTxid?: string
  baseLockHash?: string
  baseClaimHash?: string
  baseRefundHash?: string
}

const secretKey = (hash: string) => `nomos:swapSecret:${hash}`
const progressKey = (hash: string) => `nomos:swapProgress:${hash}`

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch { /* progress also lives on-chain */ }
}

const pusdText = (units: string | bigint) => `${formatUnits(BigInt(units), PUSD_DECIMALS)} PUSD`
const usdcText = (units: string | bigint) => `${formatUnits(BigInt(units), USDC_DECIMALS)} USDC`
const when = (t: number) => new Date(t * 1000).toLocaleString()
const now = () => Math.floor(Date.now() / 1000)

interface Step {
  label: string
  detail: string
  done: boolean
  /** A lock exists but does not match the offer. */
  warn?: boolean
  tx?: { label: string; href: string }
  action?: { label: string; run: () => Promise<void>; disabled?: boolean }
}

const bchTx = (txid?: string) => (txid ? { label: 'View on Bitcoin Cash', href: `${EXPLORER_TX_URL}${txid}` } : undefined)
const baseTx = (hash?: string) => (hash ? { label: 'View on Base', href: `${BASE_EXPLORER_TX}${hash}` } : undefined)
export default function Bridge() {
  const { wallet } = useWallet()
  const { toast } = useToast()
  const [params, setParams] = useSearchParams()

  const [baseAddr, setBaseAddr] = useState<string | null>(baseAccount())
  const [wcUri, setWcUri] = useState<string | null>(null)
  const qrRef = useRef<HTMLCanvasElement>(null)
  const [contractAddr, setContractAddr] = useState(swapLockAddress())

  const offerParam = params.get('offer')
  const offer = useMemo<SwapOffer | null>(() => {
    if (!offerParam) return null
    try {
      return decodeOffer(offerParam)
    } catch {
      return null
    }
  }, [offerParam])

  // The offer names its Base contract; older offers fall back to this browser's.
  const activeContract = offer?.baseContract || contractAddr
  // null while unknown: nothing on Base is read as trustworthy until this is true.
  const [contractOk, setContractOk] = useState<boolean | null>(null)

  const [secret, setSecret] = useState<string | null>(null)
  const [role, setRole] = useState<Role>('responder')
  const [progress, setProgress] = useState<Progress>({})
  const [bchLock, setBchLock] = useState<{ pusd: bigint } | null>(null)
  const [baseLock, setBaseLock] = useState<BaseLock | null | undefined>(undefined)
  const [claimTxid, setClaimTxid] = useState(params.get('claim') ?? '')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Create-offer form
  const [direction, setDirection] = useState<SwapDirection>('pusd-to-usdc')
  const [pusdAmount, setPusdAmount] = useState('')
  const [usdcAmount, setUsdcAmount] = useState('')
  // Both tokens track the US dollar, so the amount received follows the amount
  // sent one for one until the person types their own.
  const [receiveTyped, setReceiveTyped] = useState(false)
  const [counterparty, setCounterparty] = useState('')
  const [openText, setOpenText] = useState('')
  const [balances, setBalances] = useState<{ pusd?: bigint; usdc?: bigint }>({})
  const wide = useWide()
  // Refund countdowns tick while the page is open.
  const [clock, setClock] = useState(now)
  useEffect(() => {
    const id = setInterval(() => setClock(now()), 30_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!offer) return
    const stored = load<string | null>(secretKey(offer.secretHash), null)
    setSecret(stored)
    setRole(stored ? 'initiator' : 'responder')
    setProgress(load<Progress>(progressKey(offer.secretHash), {}))
  }, [offer])

  useEffect(() => {
    let cancelled = false
    setContractOk(null)
    if (!activeContract) return
    isSwapLock(activeContract)
      .then((ok) => { if (!cancelled) setContractOk(ok) })
      .catch(() => { /* RPC trouble: stay unknown, actions stay off */ })
    return () => { cancelled = true }
  }, [activeContract])

  useEffect(() => {
    const canvas = qrRef.current
    if (!wcUri || !canvas) return
    import('qrcode').then((QRCode) => QRCode.toCanvas(canvas, wcUri, { width: 200, margin: 2, color: qrColors() })).catch(() => {})
  }, [wcUri])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const next: { pusd?: bigint; usdc?: bigint } = {}
      try { if (wallet?.connected) next.pusd = await pusdBalance(wallet.address) } catch { /* shown as unknown */ }
      try { if (baseAddr) next.usdc = await usdcBalance(baseAddr) } catch { /* shown as unknown */ }
      if (!cancelled) setBalances(next)
    }
    void run()
    return () => { cancelled = true }
  }, [wallet?.connected, wallet?.address, baseAddr])

  const updateProgress = useCallback((patch: Progress) => {
    if (!offer) return
    setProgress((prev) => {
      const next = { ...prev, ...patch }
      save(progressKey(offer.secretHash), next)
      return next
    })
  }, [offer])

  const refresh = useCallback(async () => {
    if (!offer) return
    try {
      const lock = await readBchLock(offer)
      setBchLock({ pusd: lock.pusd })
    } catch {
      setBchLock(null)
    }
    try {
      setBaseLock(activeContract ? await readBaseLock(offer.secretHash, activeContract) : null)
    } catch {
      setBaseLock(undefined)
    }
  }, [offer, activeContract])

  useEffect(() => { void refresh() }, [refresh])

  const run = async (label: string, task: () => Promise<void>) => {
    setBusy(label)
    setError(null)
    try {
      await task()
      await refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : `${label} failed`
      setError(message)
      toast(message, 'error')
    } finally {
      setBusy(null)
    }
  }

  // ── Wallets ──────────────────────────────────────────────

  const connectBase = (mode: 'injected' | 'walletconnect') => run('Connecting Base wallet', async () => {
    const address = mode === 'injected' ? await connectInjected() : await connectWalletConnect(setWcUri)
    setWcUri(null)
    setBaseAddr(address)
  })

  const myDetails = wallet?.connected && baseAddr ? JSON.stringify({ bchPk: wallet.pubkey, baseAddress: baseAddr }) : null

  const deploy = () => run('Deploying SwapLock on Base', async () => {
    const { address } = await deploySwapLock()
    setContractAddr(address)
    toast(`SwapLock deployed at ${address}`, 'success')
  })

  // ── Offers ───────────────────────────────────────────────

  const createOffer = () => run('Creating offer', async () => {
    if (!wallet?.connected || !baseAddr) throw new Error('Connect both wallets first')
    let other: { bchPk: string; baseAddress: string }
    try {
      other = JSON.parse(counterparty)
    } catch {
      throw new Error("Paste the counterparty's swap details exactly as they copied them")
    }
    if (!/^0[23][0-9a-f]{64}$/i.test(other?.bchPk ?? '') || !isEvmAddress(other?.baseAddress ?? '')) {
      throw new Error('The counterparty details need a BCH public key and a Base address')
    }
    const pusdUnits = parseUnits(pusdAmount, PUSD_DECIMALS)
    const usdcUnits = parseUnits(usdcAmount, USDC_DECIMALS)
    if (pusdUnits <= 0n || usdcUnits <= 0n) throw new Error('Both amounts must be above zero')
    if (!contractAddr || !(await isSwapLock(contractAddr))) {
      throw new Error('The Base contract saved in this browser is not the Nomos SwapLock')
    }

    const s = newSecret()
    const start = now()
    const next: SwapOffer = {
      v: 1,
      direction,
      secretHash: hashSecret(s),
      pusdUnits: pusdUnits.toString(),
      usdcUnits: usdcUnits.toString(),
      initiator: { bchPk: wallet.pubkey, baseAddress: baseAddr },
      responder: { bchPk: other.bchPk.toLowerCase(), baseAddress: other.baseAddress },
      initiatorRefundAfter: start + INITIATOR_LOCK_S,
      responderRefundAfter: start + RESPONDER_LOCK_S,
      baseFromBlock: Math.max(0, (await latestBlock()) - 10),
      createdAt: start,
      baseContract: contractAddr,
    }
    save(secretKey(next.secretHash), s)
    setParams({ offer: encodeOffer(next) })
  })

  const openOffer = () => {
    const text = openText.trim()
    const code = text.includes('offer=') ? new URL(text).searchParams.get('offer') ?? '' : text
    try {
      decodeOffer(code)
      setParams({ offer: code })
      setOpenText('')
    } catch {
      toast('That is not a Nomos swap offer', 'error')
    }
  }

  const shareLink = offer
    ? `${window.location.origin}/bridge?offer=${encodeOffer(offer)}${progress.bchClaimTxid ? `&claim=${progress.bchClaimTxid}` : ''}`
    : ''

  // ── Steps ────────────────────────────────────────────────

  const steps: Step[] = []
  if (offer) {
    const bch = bchLockParams(offer)
    const base = baseLockParams(offer)
    const pusdLocked = Boolean(bchLock && bchLock.pusd >= BigInt(offer.pusdUnits))
    // A lock read from an unverified contract proves nothing, so require the code check.
    const baseLockOk = Boolean(contractOk === true
      && baseLock
      && baseLock.token.toLowerCase() === USDC_BASE.toLowerCase()
      && baseLock.recipient.toLowerCase() === base.recipient.toLowerCase()
      && baseLock.amount >= BigInt(offer.usdcUnits)
      && baseLock.refundAfter === base.refundAfter)
    const baseDone = Boolean(baseLock?.done)
    const myPk = wallet?.connected ? wallet.pubkey.toLowerCase() : ''
    const needBch = (pk: string) => {
      if (!wallet?.connected) throw new Error('Connect your BCH wallet')
      if (myPk !== pk.toLowerCase()) throw new Error('The connected BCH wallet is not the one named in this offer')
      return wallet
    }
    const needBase = () => {
      if (!baseAddr) throw new Error('Connect your Base wallet')
    }
    const lockPusdStep = (pk: string): Step['action'] => ({
      label: 'Lock in Paytaca',
      disabled: pusdLocked,
      run: () => run('Locking PUSD', async () => {
        const w = needBch(pk)
        updateProgress({ bchLockTxid: await lockPusd(offer, w.address, w.provider, w.wcIndex ?? 0) })
      }),
    })
    const lockUsdcStep = (): Step['action'] => ({
      label: 'Approve and lock',
      disabled: Boolean(baseLock) || contractOk !== true,
      run: () => run('Locking USDC', async () => {
        needBase()
        if (now() > base.refundAfter - 2 * HOUR) throw new Error("Too close to this lock's refund time; start a new offer")
        const { hash } = await lockUsdc(offer.secretHash, base.recipient, BigInt(offer.usdcUnits), base.refundAfter, activeContract)
        updateProgress({ baseLockHash: hash })
      }),
    })

    if (offer.direction === 'pusd-to-usdc') {
      if (role === 'initiator') {
        steps.push(
          { label: `Lock ${pusdText(offer.pusdUnits)} on Bitcoin Cash`, detail: `Refundable to you after ${when(bch.refundAfter)}.`, done: pusdLocked, tx: bchTx(progress.bchLockTxid), action: lockPusdStep(offer.initiator.bchPk) },
          { label: 'Send the offer link to the counterparty', detail: 'They check your PUSD lock, then lock the USDC.', done: Boolean(baseLock) },
          { label: `Counterparty locks ${usdcText(offer.usdcUnits)} on Base`, detail: baseLock ? (baseLockOk ? 'Lock found and matches the offer.' : 'A lock exists but does not match the offer. Do not claim; wait for your refund.') : 'Not locked yet.', done: baseLockOk, warn: Boolean(baseLock) && !baseLockOk },
          {
            label: 'Claim the USDC on Base', detail: `This reveals the secret on Base. Claim before ${when(base.refundAfter)}.`, done: baseDone, tx: baseTx(progress.baseClaimHash),
            action: { label: 'Claim', disabled: !baseLockOk || baseDone, run: () => run('Claiming USDC', async () => { needBase(); updateProgress({ baseClaimHash: await claimUsdc(`0x${secret}`, activeContract) }) }) },
          },
        )
      } else {
        steps.push(
          { label: `Check the ${pusdText(offer.pusdUnits)} lock on Bitcoin Cash`, detail: pusdLocked ? `Locked at ${shortAddr(bchLockAddress(offer), 10, 6)}.` : 'Not locked yet.', done: pusdLocked },
          { label: `Lock ${usdcText(offer.usdcUnits)} on Base`, detail: `For ${shortAddr(base.recipient, 6, 4)}. Refundable to you after ${when(base.refundAfter)}.`, done: Boolean(baseLock), tx: baseTx(progress.baseLockHash), action: pusdLocked ? lockUsdcStep() : undefined },
          {
            label: 'Claim the PUSD on Bitcoin Cash', detail: 'Uses the secret the other side revealed when claiming the USDC.', done: Boolean(progress.bchClaimTxid), tx: bchTx(progress.bchClaimTxid),
            action: {
              label: 'Find secret and claim', disabled: !baseDone || Boolean(progress.bchClaimTxid),
              run: () => run('Claiming PUSD', async () => {
                const found = await findBaseSecret(offer.secretHash, offer.baseFromBlock, activeContract)
                if (!found) throw new Error('No claim on Base yet')
                const w = needBch(offer.responder.bchPk)
                updateProgress({ bchClaimTxid: await claimPusd(offer, found.slice(2), w.address, w.provider, w.wcIndex ?? 0) })
              }),
            },
          },
        )
      }
    } else if (role === 'initiator') {
      steps.push(
        { label: `Lock ${usdcText(offer.usdcUnits)} on Base`, detail: `For ${shortAddr(base.recipient, 6, 4)}. Refundable to you after ${when(base.refundAfter)}.`, done: Boolean(baseLock), tx: baseTx(progress.baseLockHash), action: lockUsdcStep() },
        { label: 'Send the offer link to the counterparty', detail: 'They check your USDC lock, then lock the PUSD.', done: pusdLocked },
        { label: `Counterparty locks ${pusdText(offer.pusdUnits)} on Bitcoin Cash`, detail: pusdLocked ? 'Lock found at the address this offer defines.' : 'Not locked yet.', done: pusdLocked },
        {
          label: 'Claim the PUSD on Bitcoin Cash', detail: `This reveals the secret on Bitcoin Cash. Claim before ${when(bch.refundAfter - BCH_TIME_LAG_S)}, then send the counterparty the updated offer link.`, done: Boolean(progress.bchClaimTxid), tx: bchTx(progress.bchClaimTxid),
          action: {
            label: 'Claim in Paytaca', disabled: !pusdLocked || Boolean(progress.bchClaimTxid),
            run: () => run('Claiming PUSD', async () => {
              const w = needBch(offer.initiator.bchPk)
              updateProgress({ bchClaimTxid: await claimPusd(offer, secret!, w.address, w.provider, w.wcIndex ?? 0) })
            }),
          },
        },
      )
    } else {
      steps.push(
        { label: `Check the ${usdcText(offer.usdcUnits)} lock on Base`, detail: baseLock ? (baseLockOk ? 'Lock found and matches the offer.' : 'A lock exists but does not match the offer. Do not lock PUSD.') : 'Not locked yet.', done: baseLockOk, warn: Boolean(baseLock) && !baseLockOk },
        { label: `Lock ${pusdText(offer.pusdUnits)} on Bitcoin Cash`, detail: `Refundable to you after ${when(bch.refundAfter)}.`, done: pusdLocked, tx: bchTx(progress.bchLockTxid), action: baseLockOk ? lockPusdStep(offer.responder.bchPk) : undefined },
        {
          label: 'Claim the USDC on Base', detail: 'Paste the transaction in which the other side claimed the PUSD; it contains the secret.', done: baseDone, tx: baseTx(progress.baseClaimHash),
          action: {
            label: 'Find secret and claim', disabled: baseDone || !claimTxid.trim(),
            run: () => run('Claiming USDC', async () => {
              needBase()
              const found = await findBchSecret(offer, claimTxid)
              if (!found) throw new Error("That transaction does not reveal this swap's secret")
              updateProgress({ baseClaimHash: await claimUsdc(`0x${found}`, activeContract) })
            }),
          },
        },
      )
    }
  }

  // Refunds open once a timeout has passed and the funds are still locked.
  const refunds: Step[] = []
  if (offer) {
    const bch = bchLockParams(offer)
    const base = baseLockParams(offer)
    const myBchRefund = wallet?.connected && wallet.pubkey.toLowerCase() === bch.refundPk.toLowerCase()
    if (myBchRefund && bchLock && bchLock.pusd > 0n && now() >= bch.refundAfter + BCH_TIME_LAG_S) {
      refunds.push({
        label: 'Refund the PUSD', detail: 'The other side did not complete in time.', done: false,
        action: { label: 'Refund in Paytaca', run: () => run('Refunding PUSD', async () => { updateProgress({ bchRefundTxid: await refundPusd(offer, wallet!.address, wallet!.provider, wallet!.wcIndex ?? 0) }) }) },
      })
    }
    if (baseLock && !baseLock.done && baseAddr && baseLock.sender.toLowerCase() === baseAddr.toLowerCase() && now() >= base.refundAfter) {
      refunds.push({
        label: 'Refund the USDC', detail: 'The other side did not complete in time.', done: false,
        action: { label: 'Refund', run: () => run('Refunding USDC', async () => { updateProgress({ baseRefundHash: await refundUsdc(offer.secretHash, activeContract) }) }) },
      })
    }
  }

  const txLinks: { label: string; href: string }[] = []
  if (progress.bchLockTxid) txLinks.push({ label: 'PUSD lock', href: `${EXPLORER_TX_URL}${progress.bchLockTxid}` })
  if (progress.baseLockHash) txLinks.push({ label: 'USDC lock', href: `${BASE_EXPLORER_TX}${progress.baseLockHash}` })
  if (progress.baseClaimHash) txLinks.push({ label: 'USDC claim', href: `${BASE_EXPLORER_TX}${progress.baseClaimHash}` })
  if (progress.bchClaimTxid) txLinks.push({ label: 'PUSD claim', href: `${EXPLORER_TX_URL}${progress.bchClaimTxid}` })
  if (progress.bchRefundTxid) txLinks.push({ label: 'PUSD refund', href: `${EXPLORER_TX_URL}${progress.bchRefundTxid}` })
  if (progress.baseRefundHash) txLinks.push({ label: 'USDC refund', href: `${BASE_EXPLORER_TX}${progress.baseRefundHash}` })

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast(`${what} copied`, 'success')
    } catch {
      toast(`Could not copy ${what.toLowerCase()}`, 'error')
    }
  }

  // PUSD and USDC live on mainnet and Base only.
  if (IS_CHIPNET) return <MainnetOnly />

  const left = (t: number) => {
    const s = t - clock
    if (s <= 0) return 'Open now'
    const h = Math.floor(s / HOUR)
    const m = Math.floor((s % HOUR) / 60)
    return h > 0 ? `in ${h} h ${m} min` : `in ${m} min`
  }

  // ── Create an offer ──────────────────────────────────────
  const giving: Token = direction === 'pusd-to-usdc' ? 'PUSD' : 'USDC'
  const getting: Token = giving === 'PUSD' ? 'USDC' : 'PUSD'
  const amountOf = (t: Token) => (t === 'PUSD' ? pusdAmount : usdcAmount)
  const setAmountOf = (t: Token) => (t === 'PUSD' ? setPusdAmount : setUsdcAmount)
  /** The same number of dollars in `t`, cut to its decimals ('' when not a number). */
  const sameDollars = (value: string, t: Token): string => {
    const text = value.trim()
    if (!/^\d*\.?\d*$/.test(text) || text === '' || text === '.') return ''
    const [whole, fraction = ''] = text.split('.')
    const cut = fraction.slice(0, t === 'PUSD' ? PUSD_DECIMALS : USDC_DECIMALS)
    return cut ? `${whole || '0'}.${cut}` : whole || '0'
  }
  const balanceOf = (t: Token): string | null => {
    if (t === 'PUSD' && !wallet?.connected) return null
    if (t === 'USDC' && !baseAddr) return null
    const units = t === 'PUSD' ? balances.pusd : balances.usdc
    if (units === undefined) return '…'
    return t === 'PUSD' ? pusdText(units) : usdcText(units)
  }
  const rate = (() => {
    const g = Number(amountOf(giving))
    const r = Number(amountOf(getting))
    return g > 0 && r > 0 ? `1 ${giving} = ${(r / g).toLocaleString('en-US', { maximumFractionDigits: 4 })} ${getting}` : null
  })()
  const blocker = !wallet?.connected
    ? 'Connect your Bitcoin Cash wallet first.'
    : !baseAddr
      ? 'Connect a Base wallet first.'
      : !contractAddr
        ? 'Deploy the swap contract on Base first.'
        : contractOk === false
          ? 'The Base contract saved in this browser is not the Nomos SwapLock.'
          : null

  const cta: { label: string; to: string } | { label: string; run: () => void } | null = !wallet?.connected
    ? { label: 'Connect Bitcoin Cash wallet', to: '/connect' }
    : !baseAddr
      ? hasInjectedWallet()
        ? { label: 'Connect Base wallet', run: () => { void connectBase('injected') } }
        : WALLETCONNECT_ENABLED
          ? { label: 'Connect Base wallet', run: () => { void connectBase('walletconnect') } }
          : null
      : !contractAddr
        ? { label: 'Deploy SwapLock on Base', run: () => { void deploy() } }
        : contractOk === false
          ? null
          : { label: 'Create offer', run: () => { void createOffer() } }

  // ── Offer progress ───────────────────────────────────────
  const current = steps.findIndex((st) => !st.done)
  const complete = steps.length > 0 && current === -1
  const fromToken: Token = offer?.direction === 'usdc-to-pusd' ? 'USDC' : 'PUSD'
  const toToken: Token = fromToken === 'PUSD' ? 'USDC' : 'PUSD'
  const unitsOf = (t: Token) => (offer ? (t === 'PUSD' ? pusdText(offer.pusdUnits) : usdcText(offer.usdcUnits)) : '')

  const walletsPanel = (
    <section className="rounded-2xl border hairline bg-nomos-surface p-5" aria-label="Your wallets">
      <h2 className="text-[15px] font-semibold text-nomos-text">Your wallets</h2>
      <ul className="mt-3 space-y-3">
        <li className="flex items-center gap-3">
          <ChainDot chain="bch" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-nomos-text">Bitcoin Cash</p>
            <p className="truncate font-mono text-xs text-nomos-muted">{wallet?.connected ? shortAddr(wallet.address, 10, 6) : 'Not connected'}</p>
          </div>
          {wallet?.connected && <p className="shrink-0 text-sm tabular-nums text-nomos-text">{balanceOf('PUSD')}</p>}
        </li>
        <li className="flex items-center gap-3">
          <ChainDot chain="base" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-nomos-text">Base</p>
            <p className="truncate font-mono text-xs text-nomos-muted">{baseAddr ? shortAddr(baseAddr, 6, 4) : 'Not connected'}</p>
          </div>
          {baseAddr && <p className="shrink-0 text-sm tabular-nums text-nomos-text">{balanceOf('USDC')}</p>}
        </li>
      </ul>

      {!wallet?.connected && <Link to="/connect" className="btn-secondary mt-4 w-full text-sm">Connect Bitcoin Cash wallet</Link>}
      {!baseAddr && (
        <div className={`mt-3 grid gap-2 ${WALLETCONNECT_ENABLED ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <button type="button" className="btn-secondary text-sm" disabled={!hasInjectedWallet() || Boolean(busy)} onClick={() => { void connectBase('injected') }}>Browser wallet</button>
          {WALLETCONNECT_ENABLED && (
            <button type="button" className="btn-secondary text-sm" disabled={Boolean(busy)} onClick={() => { void connectBase('walletconnect') }}>WalletConnect</button>
          )}
        </div>
      )}
      {!baseAddr && !hasInjectedWallet() && (
        <p className="mt-2 text-xs leading-relaxed text-nomos-muted">
          For the Base side, open this page in a browser with MetaMask, Rabby or Coinbase Wallet{WALLETCONNECT_ENABLED ? ', or pair a phone wallet with WalletConnect' : ''}.
        </p>
      )}
      {wcUri && (
        <div className="mt-3 flex flex-col items-center gap-2 rounded-xl bg-white p-3">
          <canvas ref={qrRef} />
          <button type="button" className="text-sm font-semibold text-[#0b1d17] underline underline-offset-4" onClick={() => { void copy(wcUri, 'Pairing link') }}>Copy pairing link</button>
        </div>
      )}

      <button type="button" className="btn-primary mt-4 w-full" disabled={!myDetails} onClick={() => { if (myDetails) void copy(myDetails, 'Swap details') }}>
        Copy my swap details
      </button>
      <p className="mt-2 text-xs leading-relaxed text-nomos-muted">
        {myDetails
          ? 'Send these to the other person so they can make you an offer. They hold your public key and Base address, nothing secret.'
          : 'Connect both wallets to get the details another person needs to make you an offer.'}
      </p>
    </section>
  )

  const contractPanel = !activeContract ? (
    <section className="rounded-2xl border-2 border-nomos-accent/70 bg-nomos-surface p-5">
      <h2 className="text-[15px] font-semibold text-nomos-text">Swap contract not on Base yet</h2>
      <p className="mt-1 text-sm text-nomos-muted">It has to be deployed once. That costs a few cents of ETH on Base.</p>
      <button type="button" className="btn-primary mt-3 w-full text-sm" disabled={!baseAddr || Boolean(busy)} onClick={() => { void deploy() }}>Deploy SwapLock on Base</button>
    </section>
  ) : (
    <section className={`rounded-2xl border p-4 text-sm ${contractOk === false ? 'border-nomos-refuse/50 bg-nomos-refuse/10' : 'hairline bg-nomos-surface'}`}>
      <p className="flex items-center gap-2 text-nomos-text">
        <span className={`h-2 w-2 shrink-0 rounded-full ${contractOk === true ? 'bg-nomos-ok' : contractOk === false ? 'bg-nomos-refuse' : 'bg-nomos-pending'}`} aria-hidden="true" />
        Base contract{' '}
        <a className="font-mono underline underline-offset-2" href={`${BASE_EXPLORER_ADDRESS}${activeContract}`} target="_blank" rel="noreferrer">{shortAddr(activeContract, 6, 4)}</a>
      </p>
      <p className={`mt-1 ${contractOk === false ? 'text-nomos-refuse' : 'text-nomos-muted'}`}>
        {contractOk === true
          ? 'Its code matches contracts/evm/SwapLock.sol.'
          : contractOk === null
            ? 'Checking its code…'
            : `The contract ${offer ? 'this offer names' : 'saved in this browser'} does not run the SwapLock code. Do not lock or claim anything with it.`}
      </p>
    </section>
  )

  const howItWorks = (
    <section className="rounded-2xl border hairline bg-nomos-surface p-5" aria-label="How the swap works">
      <h2 className="text-[15px] font-semibold text-nomos-text">How it works</h2>
      <ol className="mt-3 grid gap-4 sm:grid-cols-3">
        {[
          { title: 'You lock', body: 'Your coins go into a lock tied to a secret only you hold. Yours refunds after 24 hours.' },
          { title: 'They lock', body: 'The other side checks your lock, then locks theirs to the same secret. Theirs refunds after 12.' },
          { title: 'Both claim', body: 'Claiming reveals the secret, which lets the other side claim. You always claim first.' },
        ].map((item, i) => (
          <li key={item.title}>
            <p className="flex items-center gap-2 text-sm font-semibold text-nomos-text">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-nomos-surface-raised text-xs font-bold" aria-hidden="true">{i + 1}</span>
              {item.title}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-nomos-muted">{item.body}</p>
          </li>
        ))}
      </ol>
    </section>
  )

  const offerForm = (
    <>
      <section className="rounded-3xl border hairline bg-nomos-surface p-3 sm:p-4" aria-label="Create an offer">
        <AmountField
          label="You send"
          token={giving}
          value={amountOf(giving)}
          onChange={(value) => {
            setAmountOf(giving)(value)
            if (!receiveTyped) setAmountOf(getting)(sameDollars(value, getting))
          }}
          balance={balanceOf(giving)}
        />
        <div className="relative z-10 -my-3 flex justify-center">
          <button
            type="button"
            onClick={() => {
              setDirection((d) => (d === 'pusd-to-usdc' ? 'usdc-to-pusd' : 'pusd-to-usdc'))
              // The token received now is the one sent before: follow the new amount sent.
              setReceiveTyped(false)
              setAmountOf(giving)(sameDollars(amountOf(getting), giving))
            }}
            aria-label={`Switch to sending ${getting}`}
            className="flex h-11 w-11 items-center justify-center rounded-full border-4 border-nomos-surface bg-nomos-surface-raised text-nomos-text transition-transform duration-300 hover:text-nomos-accent motion-reduce:transition-none"
            style={{ transform: direction === 'usdc-to-pusd' ? 'rotate(180deg)' : 'none' }}
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M6 3v13M6 16l-3-3M6 16l3-3M14 17V4M14 4l-3 3M14 4l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <AmountField
          label="You receive"
          token={getting}
          value={amountOf(getting)}
          onChange={(value) => {
            setReceiveTyped(value.trim() !== '')
            setAmountOf(getting)(value)
          }}
          balance={null}
        />
        <p className="mt-3 min-h-[1.25rem] px-2 text-sm tabular-nums text-nomos-muted">
          {rate && receiveTyped
            ? rate
            : rate
              ? `${rate}. Both track the US dollar; change the amount you receive if you agreed another price.`
              : 'Both track the US dollar, so the amount you receive follows one for one. The other person accepts by locking.'}
        </p>

        <div className="px-2 pb-1">
          <label className="mt-3 block text-sm font-semibold text-nomos-text" htmlFor="swap-counterparty">Their swap details</label>
          <textarea
            id="swap-counterparty"
            className="input mt-2 min-h-[72px] font-mono text-sm"
            placeholder='{"bchPk":"02…","baseAddress":"0x…"}'
            value={counterparty}
            onChange={(e) => setCounterparty(e.target.value)}
            spellCheck={false}
          />
          <p className="mt-1.5 text-xs leading-relaxed text-nomos-muted">The other person opens this page, connects both wallets and taps Copy my swap details.</p>

          {cta && 'to' in cta ? (
            <Link to={cta.to} className="btn-primary mt-4 min-h-[52px] w-full text-base">{cta.label}</Link>
          ) : (
            <button type="button" className="btn-primary mt-4 min-h-[52px] w-full text-base" disabled={!cta || Boolean(busy)} onClick={() => cta?.run()}>
              {busy ? <><span className="spinner mr-2" aria-hidden="true" />{busy}…</> : cta?.label ?? 'Create offer'}
            </button>
          )}
          {!cta && blocker && <p className="mt-2 text-center text-sm text-nomos-muted">{blocker}</p>}
          {error && <p className="mt-2 text-sm text-nomos-refuse" role="alert">{error}</p>}
        </div>
      </section>

      {!wide && walletsPanel}
      {!wide && contractPanel}

      <section className="rounded-2xl border hairline bg-nomos-surface p-5" aria-label="Open an offer">
        <label htmlFor="swap-open" className="text-[15px] font-semibold text-nomos-text">Got an offer link?</label>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input id="swap-open" className="input" placeholder="Paste the offer link" value={openText} onChange={(e) => setOpenText(e.target.value)} />
          <button type="button" className="btn-secondary shrink-0 sm:w-32" onClick={openOffer} disabled={!openText.trim()}>Open offer</button>
        </div>
      </section>

      {howItWorks}
    </>
  )

  const timers = offer && (() => {
    const bch = bchLockParams(offer)
    const base = baseLockParams(offer)
    const rows = [
      { label: 'PUSD refund opens', at: bch.refundAfter + BCH_TIME_LAG_S },
      { label: 'USDC refund opens', at: base.refundAfter },
    ]
    return (
      <section className="rounded-2xl border hairline bg-nomos-surface p-5" aria-label="Time limits">
        <h2 className="text-[15px] font-semibold text-nomos-text">Time limits</h2>
        <p className="mt-1 text-xs leading-relaxed text-nomos-muted">Each lock can only be claimed before its refund opens.</p>
        <ul className="mt-3 space-y-3 text-sm">
          {rows.map((r) => (
            <li key={r.label}>
              <p className="flex justify-between gap-3">
                <span className="text-nomos-muted">{r.label}</span>
                <span className="tabular-nums font-semibold text-nomos-text">{left(r.at)}</span>
              </p>
              <p className="text-xs text-nomos-muted">{when(r.at)}</p>
            </li>
          ))}
        </ul>
      </section>
    )
  })()

  const transactions = txLinks.length > 0 && (
    <section className="rounded-2xl border hairline bg-nomos-surface p-5" aria-label="Transactions">
      <h2 className="text-[15px] font-semibold text-nomos-text">Transactions</h2>
      <ul className="mt-3 space-y-2 text-sm">
        {txLinks.map((t) => (
          <li key={t.label} className="flex justify-between gap-3">
            <span className="text-nomos-muted">{t.label}</span>
            <a className="font-semibold text-nomos-text underline underline-offset-4" href={t.href} target="_blank" rel="noreferrer">View</a>
          </li>
        ))}
      </ul>
    </section>
  )

  const tracker = offer && (
    <>
      <section className="rounded-3xl border hairline bg-nomos-surface p-5 sm:p-6" aria-label="Offer">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <TradeSide token={fromToken} amount={unitsOf(fromToken)} />
          <svg width="22" height="22" viewBox="0 0 20 20" fill="none" className="text-nomos-muted" aria-hidden="true">
            <path d="M3 10h13M16 10l-4-4M16 10l-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <TradeSide token={toToken} amount={unitsOf(toToken)} />
        </div>
        <p className="mt-4 text-sm text-nomos-muted">
          {role === 'initiator' ? 'You made this offer.' : 'You are the counterparty in this offer.'}
          {secret && (
            <button type="button" className="ml-2 font-semibold text-nomos-text underline underline-offset-4" onClick={() => setRole(role === 'initiator' ? 'responder' : 'initiator')}>
              Show the {role === 'initiator' ? 'counterparty' : 'offer creator'} steps
            </button>
          )}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn-primary min-h-[40px] px-4 text-sm" onClick={() => { void copy(shareLink, 'Offer link') }}>Copy offer link</button>
          <button type="button" className="btn-ghost min-h-[40px] px-4 text-sm" onClick={() => { void refresh() }}>Refresh</button>
        </div>
        <details className="mt-4 text-sm text-nomos-muted">
          <summary className="cursor-pointer">Offer details</summary>
          <dl className="mt-2 space-y-1.5">
            <div className="flex justify-between gap-3"><dt>Secret hash</dt><dd className="font-mono text-nomos-text">{offer.secretHash.slice(0, 16)}…</dd></div>
            <div className="flex justify-between gap-3"><dt>PUSD lock address</dt><dd className="font-mono text-nomos-text">{shortAddr(bchLockAddress(offer), 10, 6)}</dd></div>
            <div className="flex justify-between gap-3"><dt>Created</dt><dd className="text-nomos-text">{when(offer.createdAt)}</dd></div>
          </dl>
        </details>
      </section>

      {complete && (
        <section className="rounded-3xl border-2 border-nomos-ok/60 bg-nomos-ok/10 p-6" aria-live="polite">
          <h2 className="font-display text-[1.6rem] font-extrabold leading-tight text-nomos-text" style={{ fontStretch: '112%' }}>Swap complete</h2>
          <p className="mt-1.5 text-sm text-nomos-muted">Your side of the trade has been claimed. The links below show every transaction.</p>
        </section>
      )}

      <section className="rounded-3xl border hairline bg-nomos-surface p-5 sm:p-6" aria-label="Steps">
        <h2 className="text-[15px] font-semibold text-nomos-text">Progress</h2>
        <ol className="mt-4">
          {steps.map((st, i) => {
            const isCurrent = i === current
            return (
              <li key={st.label} className="relative flex gap-4 pb-6 last:pb-0">
                {i < steps.length - 1 && <span className={`absolute left-[15px] top-9 h-[calc(100%-2.25rem)] w-0.5 ${st.done ? 'bg-nomos-ok' : 'bg-nomos-surface-raised'}`} aria-hidden="true" />}
                <span
                  className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    st.done
                      ? 'bg-nomos-ok text-nomos-on-ok'
                      : st.warn
                        ? 'bg-nomos-refuse text-white'
                        : isCurrent
                          ? 'bg-nomos-accent text-nomos-on-accent ring-4 ring-nomos-accent/25'
                          : 'bg-nomos-surface-raised text-nomos-muted'
                  }`}
                  aria-hidden="true"
                >
                  {st.done ? (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  ) : st.warn ? '!' : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-[15px] font-semibold ${st.done || isCurrent ? 'text-nomos-text' : 'text-nomos-muted'}`}>
                    {st.label}
                    <span className="sr-only">{st.done ? ' (done)' : isCurrent ? ' (current step)' : ''}</span>
                  </p>
                  <p className={`mt-1 text-sm leading-relaxed ${st.warn ? 'text-nomos-refuse' : 'text-nomos-muted'}`}>{st.detail}</p>
                  {st.tx && (
                    <a href={st.tx.href} target="_blank" rel="noreferrer" className="mt-1.5 inline-block text-sm font-semibold text-nomos-text underline underline-offset-4">{st.tx.label}</a>
                  )}
                  {st.action && !st.done && (
                    <div className="mt-3">
                      <button
                        type="button"
                        className={`${isCurrent ? 'btn-primary' : 'btn-secondary'} min-h-[40px] px-4 text-sm`}
                        disabled={st.action.disabled || Boolean(busy)}
                        onClick={() => { void st.action!.run() }}
                      >
                        {st.action.label}
                      </button>
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
        {offer.direction === 'usdc-to-pusd' && role === 'responder' && (
          <div className="mt-5">
            <label htmlFor="swap-claim-txid" className="text-sm font-semibold text-nomos-text">PUSD claim transaction from the other side</label>
            <input id="swap-claim-txid" className="input mt-2 font-mono text-sm" placeholder="Transaction ID" value={claimTxid} onChange={(e) => setClaimTxid(e.target.value)} spellCheck={false} />
          </div>
        )}
        {busy && <p className="mt-4 text-sm text-nomos-muted-bright"><span className="spinner mr-2" />{busy}…</p>}
        {error && <p className="mt-4 text-sm text-nomos-refuse" role="alert">{error}</p>}
      </section>

      {refunds.length > 0 && (
        <section className="rounded-2xl border-2 border-nomos-accent/70 bg-nomos-surface p-5" aria-label="Refunds">
          <h2 className="text-[15px] font-semibold text-nomos-text">Refund available</h2>
          {refunds.map((r) => (
            <div key={r.label} className="mt-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-nomos-text">{r.label}</p>
                <p className="text-sm text-nomos-muted">{r.detail}</p>
              </div>
              <button type="button" className="btn-primary min-h-[40px] shrink-0 px-4 text-sm" disabled={Boolean(busy)} onClick={() => { void r.action!.run() }}>{r.action!.label}</button>
            </div>
          ))}
        </section>
      )}

      {!wide && <>{walletsPanel}{contractPanel}{timers}{transactions}</>}

      <button type="button" className="btn-ghost w-full text-sm" onClick={() => setParams({})}>Start a new offer</button>
    </>
  )

  return (
    <div className="page-enter space-y-6">
      <header>
        <h1 className="page-title">Swap PUSD and USDC</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-nomos-muted">
          Trade PUSD on Bitcoin Cash for USDC on Base with one other person. Both sides lock to the same secret, and each lock refunds if the other side never pays.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)] lg:items-start lg:gap-8">
        <div className="min-w-0 space-y-5">
          {offer ? tracker : offerForm}
        </div>
        {wide && (
          <aside className="min-w-0 space-y-4">
            {walletsPanel}
            {contractPanel}
            {timers}
            {transactions}
          </aside>
        )}
      </div>
    </div>
  )
}

// ── Pieces ─────────────────────────────────────────────────

/** True at the two-column breakpoint (Tailwind lg). */
function useWide(): boolean {
  const query = '(min-width: 1024px)'
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const m = window.matchMedia(query)
    const on = () => setWide(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return wide
}

type Token = 'PUSD' | 'USDC'

/** Chain marks are plain coloured discs: Bitcoin Cash green, Base blue. */
function ChainDot({ chain }: { chain: 'bch' | 'base' }) {
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${chain === 'bch' ? 'bg-[#0AC18E] text-[#04261b]' : 'bg-[#2f6bff] text-white'}`}
      aria-hidden="true"
    >
      {chain === 'bch' ? 'BCH' : 'B'}
    </span>
  )
}

function TokenBadge({ token }: { token: Token }) {
  const pusd = token === 'PUSD'
  return (
    <span className="inline-flex shrink-0 items-center gap-2 rounded-full border hairline-strong bg-nomos-surface py-1.5 pl-1.5 pr-3">
      <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-extrabold ${pusd ? 'bg-[#0AC18E] text-[#04261b]' : 'bg-[#2f6bff] text-white'}`} aria-hidden="true">
        {pusd ? 'P' : 'U'}
      </span>
      <span className="text-left leading-tight">
        <span className="block text-sm font-bold text-nomos-text">{token}</span>
        <span className="block text-[11px] text-nomos-muted">on {pusd ? 'Bitcoin Cash' : 'Base'}</span>
      </span>
    </span>
  )
}

function AmountField({
  label, token, value, onChange, balance,
}: {
  label: string
  token: Token
  value: string
  onChange: (value: string) => void
  balance: string | null
}) {
  const id = `swap-amount-${label.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <div className="rounded-2xl bg-nomos-surface-raised p-4 focus-within:ring-2 focus-within:ring-nomos-accent">
      <div className="flex items-center justify-between gap-3 text-sm text-nomos-muted">
        <label htmlFor={id}>{label}</label>
        {balance && <span className="tabular-nums">Balance {balance}</span>}
      </div>
      <div className="mt-2 flex items-center gap-3">
        <input
          id={id}
          className="min-w-0 flex-1 bg-transparent font-display text-[2rem] font-extrabold tabular-nums text-nomos-text outline-none placeholder:text-nomos-muted/50"
          style={{ fontStretch: '112%' }}
          inputMode="decimal"
          placeholder="0.00"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
        />
        <TokenBadge token={token} />
      </div>
    </div>
  )
}

function TradeSide({ token, amount }: { token: Token; amount: string }) {
  return (
    <div className="flex items-center gap-3">
      <ChainDot chain={token === 'PUSD' ? 'bch' : 'base'} />
      <div>
        <p className="font-display text-[1.5rem] font-extrabold leading-none tabular-nums text-nomos-text" style={{ fontStretch: '112%' }}>{amount}</p>
        <p className="mt-1 text-xs text-nomos-muted">on {token === 'PUSD' ? 'Bitcoin Cash' : 'Base'}</p>
      </div>
    </div>
  )
}

function MainnetOnly() {
  return (
    <div className="page-enter mx-auto max-w-xl space-y-4">
      <h1 className="page-title">Swap PUSD and USDC</h1>
      <section className="rounded-2xl border-2 border-nomos-accent/70 bg-nomos-surface p-6">
        <h2 className="font-display text-[1.35rem] font-extrabold leading-tight text-nomos-text" style={{ fontStretch: '112%' }}>The swap runs on mainnet</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-nomos-muted">
          PUSD lives on Bitcoin Cash mainnet and USDC on Base, so there is nothing to swap on chipnet. Your chipnet vault stays here for when you switch back.
        </p>
        <button type="button" onClick={() => switchNetwork('mainnet')} className="btn-primary mt-4">Switch to mainnet</button>
      </section>
    </div>
  )
}
