import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useWallet } from '../context/WalletContext'
import { useToast } from '../components/Toast'
import { Panel, KV, shortAddr } from '../components/ui'
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
  action?: { label: string; run: () => Promise<void>; disabled?: boolean }
}
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
  const [counterparty, setCounterparty] = useState('')
  const [openText, setOpenText] = useState('')
  const [balances, setBalances] = useState<{ pusd?: bigint; usdc?: bigint }>({})

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
          { label: `Lock ${pusdText(offer.pusdUnits)} on Bitcoin Cash`, detail: `Refundable to you after ${when(bch.refundAfter)}.`, done: pusdLocked, action: lockPusdStep(offer.initiator.bchPk) },
          { label: 'Send the offer link to the counterparty', detail: 'They check your PUSD lock, then lock the USDC.', done: Boolean(baseLock) },
          { label: `Counterparty locks ${usdcText(offer.usdcUnits)} on Base`, detail: baseLock ? (baseLockOk ? 'Lock found and matches the offer.' : 'A lock exists but does not match the offer. Do not claim; wait for your refund.') : 'Not locked yet.', done: baseLockOk },
          {
            label: 'Claim the USDC on Base', detail: `This reveals the secret on Base. Claim before ${when(base.refundAfter)}.`, done: baseDone,
            action: { label: 'Claim', disabled: !baseLockOk || baseDone, run: () => run('Claiming USDC', async () => { needBase(); updateProgress({ baseClaimHash: await claimUsdc(`0x${secret}`, activeContract) }) }) },
          },
        )
      } else {
        steps.push(
          { label: `Check the ${pusdText(offer.pusdUnits)} lock on Bitcoin Cash`, detail: pusdLocked ? `Locked at ${shortAddr(bchLockAddress(offer), 10, 6)}.` : 'Not locked yet.', done: pusdLocked },
          { label: `Lock ${usdcText(offer.usdcUnits)} on Base`, detail: `For ${shortAddr(base.recipient, 6, 4)}. Refundable to you after ${when(base.refundAfter)}.`, done: Boolean(baseLock), action: pusdLocked ? lockUsdcStep() : undefined },
          {
            label: 'Claim the PUSD on Bitcoin Cash', detail: 'Uses the secret the other side revealed when claiming the USDC.', done: Boolean(progress.bchClaimTxid),
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
        { label: `Lock ${usdcText(offer.usdcUnits)} on Base`, detail: `For ${shortAddr(base.recipient, 6, 4)}. Refundable to you after ${when(base.refundAfter)}.`, done: Boolean(baseLock), action: lockUsdcStep() },
        { label: 'Send the offer link to the counterparty', detail: 'They check your USDC lock, then lock the PUSD.', done: pusdLocked },
        { label: `Counterparty locks ${pusdText(offer.pusdUnits)} on Bitcoin Cash`, detail: pusdLocked ? 'Lock found at the address this offer defines.' : 'Not locked yet.', done: pusdLocked },
        {
          label: 'Claim the PUSD on Bitcoin Cash', detail: `This reveals the secret on Bitcoin Cash. Claim before ${when(bch.refundAfter - BCH_TIME_LAG_S)}, then send the counterparty the updated offer link.`, done: Boolean(progress.bchClaimTxid),
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
        { label: `Check the ${usdcText(offer.usdcUnits)} lock on Base`, detail: baseLock ? (baseLockOk ? 'Lock found and matches the offer.' : 'A lock exists but does not match the offer. Do not lock PUSD.') : 'Not locked yet.', done: baseLockOk },
        { label: `Lock ${pusdText(offer.pusdUnits)} on Bitcoin Cash`, detail: `Refundable to you after ${when(bch.refundAfter)}.`, done: pusdLocked, action: baseLockOk ? lockPusdStep(offer.responder.bchPk) : undefined },
        {
          label: 'Claim the USDC on Base', detail: 'Paste the transaction in which the other side claimed the PUSD; it contains the secret.', done: baseDone,
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
  return (
    <div className="page-enter space-y-4">
      <h1 className="page-title">Swap PUSD and USDC</h1>
      <p className="text-sm text-nomos-muted">
        Trade PUSD on Bitcoin Cash for USDC on Base with another person. Both sides lock to the same secret, and each lock refunds if the other side never pays.
      </p>
      <Panel title="Wallets">
        <KV label="Bitcoin Cash">{wallet?.connected ? shortAddr(wallet.address, 10, 6) : 'Not connected'}</KV>
        <KV label="PUSD balance">{balances.pusd === undefined ? '—' : pusdText(balances.pusd)}</KV>
        <KV label="Base">{baseAddr ? shortAddr(baseAddr, 6, 4) : 'Not connected'}</KV>
        <KV label="USDC balance">{balances.usdc === undefined ? '—' : usdcText(balances.usdc)}</KV>
        {!baseAddr && (
          <div className={`mt-3 grid gap-2 ${WALLETCONNECT_ENABLED ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <button type="button" className="btn-ghost text-sm" disabled={!hasInjectedWallet() || Boolean(busy)} onClick={() => { void connectBase('injected') }}>Browser wallet</button>
            {WALLETCONNECT_ENABLED && (
              <button type="button" className="btn-ghost text-sm" disabled={Boolean(busy)} onClick={() => { void connectBase('walletconnect') }}>WalletConnect</button>
            )}
          </div>
        )}
        {!baseAddr && !hasInjectedWallet() && (
          <p className="mt-2 text-sm text-nomos-muted">
            For the Base side, open this page in a browser with a Base wallet such as MetaMask, Rabby or Coinbase Wallet{WALLETCONNECT_ENABLED ? ', or pair one with WalletConnect' : ''}.
          </p>
        )}
        {wcUri && (
          <div className="mt-3 flex flex-col items-center gap-2">
            <canvas ref={qrRef} />
            <button type="button" className="text-sm font-medium text-nomos-text hover:underline" onClick={() => { void copy(wcUri, 'Pairing link') }}>Copy pairing link</button>
          </div>
        )}
        {myDetails && (
          <button type="button" className="mt-3 text-sm font-medium text-nomos-text hover:underline" onClick={() => { void copy(myDetails, 'Swap details') }}>
            Copy my swap details
          </button>
        )}
      </Panel>

      {!activeContract && (
        <Panel title="Swap contract not on Base yet">
          <p className="text-sm text-nomos-muted">It has to be deployed once. That costs a few cents of ETH on Base.</p>
          <button type="button" className="btn-ghost mt-3 w-full text-sm" disabled={!baseAddr || Boolean(busy)} onClick={() => { void deploy() }}>Deploy SwapLock on Base</button>
        </Panel>
      )}
      {activeContract && (
        <p className="text-xs text-nomos-muted">
          Base contract <a className="underline" href={`${BASE_EXPLORER_ADDRESS}${activeContract}`} target="_blank" rel="noreferrer">{shortAddr(activeContract, 6, 4)}</a>
          {contractOk === true && ' · code matches contracts/evm/SwapLock.sol'}
          {contractOk === null && ' · checking its code…'}
        </p>
      )}
      {activeContract && contractOk === false && (
        <Panel title="Not the Nomos swap contract">
          <p className="text-sm text-nomos-refuse">
            The Base contract {offer ? 'this offer names' : 'saved in this browser'} does not run the audited SwapLock code. Do not lock or claim anything with it.
          </p>
        </Panel>
      )}
      {!offer ? (
        <>
          <Panel title="Create an offer">
            <div className="space-y-2">
              <select className="input" value={direction} onChange={(e) => setDirection(e.target.value as SwapDirection)}>
                <option value="pusd-to-usdc">I give PUSD, I get USDC</option>
                <option value="usdc-to-pusd">I give USDC, I get PUSD</option>
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input className="input" inputMode="decimal" placeholder="PUSD amount" value={pusdAmount} onChange={(e) => setPusdAmount(e.target.value)} />
                <input className="input" inputMode="decimal" placeholder="USDC amount" value={usdcAmount} onChange={(e) => setUsdcAmount(e.target.value)} />
              </div>
              <textarea className="input min-h-[64px] font-mono text-sm" placeholder="Counterparty swap details (they copy them from this page)" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} />
              <button type="button" className="btn-primary w-full" disabled={!contractAddr || contractOk === false || Boolean(busy)} onClick={() => { void createOffer() }}>Create offer</button>
              <p className="text-sm text-nomos-muted">Your lock lasts 24 hours and theirs 12, so you always claim first.</p>
            </div>
          </Panel>
          <Panel title="Open an offer">
            <div className="flex gap-2">
              <input className="input" placeholder="Paste an offer link" value={openText} onChange={(e) => setOpenText(e.target.value)} />
              <button type="button" className="btn-ghost shrink-0 text-sm" onClick={openOffer} disabled={!openText.trim()}>Open</button>
            </div>
          </Panel>
        </>
      ) : (
        <>
          <Panel title="Offer" right={<button type="button" className="text-sm font-medium text-nomos-text hover:underline" onClick={() => { void copy(shareLink, 'Offer link') }}>Copy link</button>}>
            <KV label="Trade">{offer.direction === 'pusd-to-usdc' ? `${pusdText(offer.pusdUnits)} for ${usdcText(offer.usdcUnits)}` : `${usdcText(offer.usdcUnits)} for ${pusdText(offer.pusdUnits)}`}</KV>
            <KV label="Secret hash">{offer.secretHash.slice(0, 16)}…</KV>
            <KV label="PUSD lock address">{shortAddr(bchLockAddress(offer), 10, 6)}</KV>
            <KV label="Your role">{role === 'initiator' ? 'Offer creator' : 'Counterparty'}</KV>
            {secret && (
              <button type="button" className="mt-2 text-sm text-nomos-muted hover:text-nomos-text" onClick={() => setRole(role === 'initiator' ? 'responder' : 'initiator')}>
                Show the {role === 'initiator' ? 'counterparty' : 'offer creator'} steps
              </button>
            )}
          </Panel>

          <Panel title="Steps" right={<button type="button" className="text-sm font-medium text-nomos-text hover:underline" onClick={() => { void refresh() }}>Refresh</button>}>
            <ol className="space-y-3">
              {steps.map((step, i) => (
                <li key={step.label} className="rounded-lg border hairline p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`text-[15px] font-medium ${step.done ? 'text-nomos-muted' : 'text-nomos-text'}`}>{i + 1}. {step.label}{step.done ? ' · done' : ''}</p>
                      <p className="mt-1 text-sm leading-relaxed text-nomos-muted">{step.detail}</p>
                    </div>
                    {step.action && !step.done && (
                      <button type="button" className="btn-ghost shrink-0 py-1.5 text-sm" disabled={step.action.disabled || Boolean(busy)} onClick={() => { void step.action!.run() }}>
                        {step.action.label}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ol>
            {offer.direction === 'usdc-to-pusd' && role === 'responder' && (
              <input className="input mt-3 font-mono text-sm" placeholder="PUSD claim transaction ID from the other side" value={claimTxid} onChange={(e) => setClaimTxid(e.target.value)} />
            )}
            {busy && <p className="mt-3 text-sm text-nomos-muted-bright"><span className="spinner mr-2" />{busy}…</p>}
            {error && <p className="mt-3 text-xs text-nomos-refuse">{error}</p>}
          </Panel>

          {refunds.length > 0 && (
            <Panel title="Refunds">
              {refunds.map((r) => (
                <div key={r.label} className="flex items-center justify-between gap-3 py-1">
                  <span className="text-sm text-nomos-text">{r.label}</span>
                  <button type="button" className="btn-ghost py-1.5 text-sm" disabled={Boolean(busy)} onClick={() => { void r.action!.run() }}>{r.action!.label}</button>
                </div>
              ))}
            </Panel>
          )}

          {txLinks.length > 0 && (
            <Panel title="Transactions">
              {txLinks.map((t) => (
                <KV key={t.label} label={t.label}><a className="underline" href={t.href} target="_blank" rel="noreferrer">view</a></KV>
              ))}
            </Panel>
          )}

          <button type="button" className="btn-ghost w-full text-sm" onClick={() => setParams({})}>New offer</button>
        </>
      )}
    </div>
  )
}
