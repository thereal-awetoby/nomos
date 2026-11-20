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
      setBaseLock(contractAddr ? await readBaseLock(offer.secretHash) : null)
    } catch {
      setBaseLock(undefined)
    }
  }, [offer, contractAddr])

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
    const baseLockOk = Boolean(baseLock
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
      disabled: Boolean(baseLock),
      run: () => run('Locking USDC', async () => {
        needBase()
        if (now() > base.refundAfter - 2 * HOUR) throw new Error("Too close to this lock's refund time; start a new offer")
        const { hash } = await lockUsdc(offer.secretHash, base.recipient, BigInt(offer.usdcUnits), base.refundAfter)
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
            action: { label: 'Claim', disabled: !baseLockOk || baseDone, run: () => run('Claiming USDC', async () => { needBase(); updateProgress({ baseClaimHash: await claimUsdc(`0x${secret}`) }) }) },
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
                const found = await findBaseSecret(offer.secretHash, offer.baseFromBlock)
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
              updateProgress({ baseClaimHash: await claimUsdc(`0x${found}`) })
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
        action: { label: 'Refund', run: () => run('Refunding USDC', async () => { updateProgress({ baseRefundHash: await refundUsdc(offer.secretHash) }) }) },
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
      <header>
        <p className="eyebrow">ATOMIC SWAP · BITCOIN CASH AND BASE</p>
        <h1 className="page-title">Swap PUSD and USDC</h1>
        <p className="mt-1.5 max-w-prose text-xs leading-relaxed text-nomos-muted">
          Trade PUSD on Bitcoin Cash for USDC on Base with another person. Both sides lock funds behind the same secret; claiming one side reveals the secret that unlocks the other, and each lock refunds its sender after a timeout. Nothing is held by Nomos.
        </p>
      </header>
      <Panel title="Wallets">
        <KV label="Bitcoin Cash">{wallet?.connected ? shortAddr(wallet.address, 10, 6) : 'Not connected'}</KV>
        <KV label="PUSD balance">{balances.pusd === undefined ? '—' : pusdText(balances.pusd)}</KV>
        <KV label="Base">{baseAddr ? shortAddr(baseAddr, 6, 4) : 'Not connected'}</KV>
        <KV label="USDC balance">{balances.usdc === undefined ? '—' : usdcText(balances.usdc)}</KV>
        {!baseAddr && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" className="btn-ghost py-2 text-[10px]" disabled={!hasInjectedWallet() || Boolean(busy)} onClick={() => { void connectBase('injected') }}>Browser wallet</button>
            <button type="button" className="btn-ghost py-2 text-[10px]" disabled={Boolean(busy)} onClick={() => { void connectBase('walletconnect') }}>WalletConnect</button>
          </div>
        )}
        {wcUri && (
          <div className="mt-3 flex flex-col items-center gap-2">
            <canvas ref={qrRef} />
            <button type="button" className="text-[10px] text-nomos-accent hover:underline" onClick={() => { void copy(wcUri, 'Pairing link') }}>Copy pairing link</button>
          </div>
        )}
        {myDetails && (
          <button type="button" className="mt-3 text-[10px] text-nomos-accent hover:underline" onClick={() => { void copy(myDetails, 'Swap details') }}>
            Copy my swap details (BCH public key and Base address) to send to a counterparty
          </button>
        )}
      </Panel>

      {!contractAddr && (
        <Panel title="Base contract not deployed" tone="pending">
          <p className="text-[11px] leading-relaxed text-nomos-muted">SwapLock (contracts/evm/SwapLock.sol) must exist on Base once. Deploying costs a few cents of ETH on Base.</p>
          <button type="button" className="btn-ghost mt-3 w-full py-2 text-[10px]" disabled={!baseAddr || Boolean(busy)} onClick={() => { void deploy() }}>Deploy SwapLock on Base</button>
        </Panel>
      )}
      {contractAddr && (
        <p className="font-mono text-[9px] text-nomos-muted">
          Base contract <a className="underline" href={`${BASE_EXPLORER_ADDRESS}${contractAddr}`} target="_blank" rel="noreferrer">{shortAddr(contractAddr, 6, 4)}</a>
        </p>
      )}
      {!offer ? (
        <>
          <Panel title="Create an offer">
            <div className="space-y-2">
              <select className="input text-xs" value={direction} onChange={(e) => setDirection(e.target.value as SwapDirection)}>
                <option value="pusd-to-usdc">I give PUSD, I get USDC</option>
                <option value="usdc-to-pusd">I give USDC, I get PUSD</option>
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input className="input text-xs" inputMode="decimal" placeholder="PUSD amount" value={pusdAmount} onChange={(e) => setPusdAmount(e.target.value)} />
                <input className="input text-xs" inputMode="decimal" placeholder="USDC amount" value={usdcAmount} onChange={(e) => setUsdcAmount(e.target.value)} />
              </div>
              <textarea className="input min-h-[64px] font-mono text-[10px]" placeholder="Counterparty swap details (they copy them from this page)" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} />
              <button type="button" className="btn-primary w-full py-2" disabled={!contractAddr || Boolean(busy)} onClick={() => { void createOffer() }}>Create offer</button>
              <p className="text-[10px] text-nomos-muted">Your lock lasts 24 hours and the counterparty's 12, so you claim first and reveal the secret while they still have time to claim.</p>
            </div>
          </Panel>
          <Panel title="Open an offer">
            <div className="flex gap-2">
              <input className="input text-xs" placeholder="Paste an offer link" value={openText} onChange={(e) => setOpenText(e.target.value)} />
              <button type="button" className="btn-ghost shrink-0 px-3 text-[10px]" onClick={openOffer} disabled={!openText.trim()}>Open</button>
            </div>
          </Panel>
        </>
      ) : (
        <>
          <Panel title="Offer" right={<button type="button" className="text-[10px] text-nomos-accent hover:underline" onClick={() => { void copy(shareLink, 'Offer link') }}>Copy link</button>}>
            <KV label="Trade">{offer.direction === 'pusd-to-usdc' ? `${pusdText(offer.pusdUnits)} for ${usdcText(offer.usdcUnits)}` : `${usdcText(offer.usdcUnits)} for ${pusdText(offer.pusdUnits)}`}</KV>
            <KV label="Secret hash">{offer.secretHash.slice(0, 16)}…</KV>
            <KV label="PUSD lock address">{shortAddr(bchLockAddress(offer), 10, 6)}</KV>
            <KV label="Your role">{role === 'initiator' ? 'Offer creator' : 'Counterparty'}</KV>
            {secret && (
              <button type="button" className="mt-2 text-[10px] text-nomos-muted hover:text-nomos-text" onClick={() => setRole(role === 'initiator' ? 'responder' : 'initiator')}>
                Show the {role === 'initiator' ? 'counterparty' : 'offer creator'} steps (when you are both sides)
              </button>
            )}
          </Panel>

          <Panel title="Steps" right={<button type="button" className="text-[10px] text-nomos-accent hover:underline" onClick={() => { void refresh() }}>Refresh</button>}>
            <ol className="space-y-3">
              {steps.map((step, i) => (
                <li key={step.label} className="border hairline p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`font-mono text-[11px] font-semibold ${step.done ? 'text-nomos-accent' : 'text-nomos-text'}`}>{i + 1}. {step.label}</p>
                      <p className="mt-1 text-[10px] leading-relaxed text-nomos-muted">{step.detail}</p>
                    </div>
                    {step.action && !step.done && (
                      <button type="button" className="btn-ghost shrink-0 px-3 py-1.5 text-[10px]" disabled={step.action.disabled || Boolean(busy)} onClick={() => { void step.action!.run() }}>
                        {step.action.label}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ol>
            {offer.direction === 'usdc-to-pusd' && role === 'responder' && (
              <input className="input mt-3 font-mono text-[10px]" placeholder="PUSD claim transaction ID from the other side" value={claimTxid} onChange={(e) => setClaimTxid(e.target.value)} />
            )}
            {busy && <p className="mt-3 text-xs text-nomos-accent"><span className="spinner mr-2" />{busy}…</p>}
            {error && <p className="mt-3 text-xs text-nomos-refuse">{error}</p>}
          </Panel>

          {refunds.length > 0 && (
            <Panel title="Refunds" tone="pending">
              {refunds.map((r) => (
                <div key={r.label} className="flex items-center justify-between gap-3 py-1">
                  <span className="text-[11px] text-nomos-text">{r.label}</span>
                  <button type="button" className="btn-ghost px-3 py-1.5 text-[10px]" disabled={Boolean(busy)} onClick={() => { void r.action!.run() }}>{r.action!.label}</button>
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

          <button type="button" className="btn-ghost w-full py-2 text-[10px]" onClick={() => setParams({})}>New offer</button>
        </>
      )}
    </div>
  )
}
