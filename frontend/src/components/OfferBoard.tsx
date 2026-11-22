import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from './Toast'
import { shortAddr } from './ui'
import {
  acceptEvent,
  acceptMatches,
  boardKey,
  closePostEvent,
  foldBoard,
  isOpen,
  postKey,
  publishToBoard,
  readBoard,
  takeEvent,
} from '../lib/board'
import type { BoardMessage, BoardNetwork, BoardParty, BoardPost, BoardTake, OfferTerms } from '../lib/board'
import { formatUnits, USDC_DECIMALS } from '../lib/evm'
import { PUSD_DECIMALS, decodeOffer } from '../lib/swap'
import { swapOutcome, swapProgressKey } from '../lib/swapProgress'
import type { SwapProgressRecord } from '../lib/swapProgress'

// ── Offer board ─────────────────────────────────────────────
// Open offers from public Nostr relays. Take one and the maker's page answers
// with a swap offer made for you; accept a take on your own post and you are
// both in the usual two-lock swap. See lib/board.ts.

const READ_EVERY_MS = 20_000
const unix = () => Math.floor(Date.now() / 1000)
const pusd = (units: string) => `${formatUnits(BigInt(units), PUSD_DECIMALS)} PUSD`
const usdc = (units: string) => `${formatUnits(BigInt(units), USDC_DECIMALS)} USDC`

function ago(t: number, now: number): string {
  const s = Math.max(0, now - t)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  return `${Math.floor(s / 3600)} h ago`
}
/** How an accepted swap ended for this browser's side, from what the swap page saved. */
function outcomeOf(encoded: string, role: 'initiator' | 'responder'): 'complete' | 'refunded' | 'open' {
  try {
    const offer = decodeOffer(encoded)
    const raw = localStorage.getItem(swapProgressKey(offer.secretHash))
    return swapOutcome(offer.direction, role, raw ? (JSON.parse(raw) as SwapProgressRecord) : {})
  } catch {
    return 'open'
  }
}

/** A finished swap: what happened, and a way back to its transactions. */
function Finished({ outcome, onOpen }: { outcome: 'complete' | 'refunded'; onOpen: () => void }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      {outcome === 'complete' ? (
        <span className="inline-flex items-center gap-2 rounded-full border border-nomos-ok/60 bg-nomos-ok/10 px-3 py-1.5 text-sm font-semibold text-nomos-text">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-nomos-ok text-nomos-on-ok" aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          Swap complete
        </span>
      ) : (
        <span className="text-sm font-semibold text-nomos-muted-bright">Refunded: the swap did not go through</span>
      )}
      <button type="button" className="text-sm text-nomos-muted underline underline-offset-4 hover:text-nomos-text" onClick={onOpen}>
        See its transactions
      </button>
    </div>
  )
}

function left(t: number, now: number): string {
  const s = t - now
  if (s <= 0) return 'ended'
  if (s < 3600) return `${Math.ceil(s / 60)} min left`
  return `${Math.floor(s / 3600)} h left`
}

/** What each side sends: the maker gives first in `direction`. */
function sides(post: BoardPost) {
  const makerGives = post.direction === 'pusd-to-usdc' ? pusd(post.pusdUnits) : usdc(post.usdcUnits)
  const makerGets = post.direction === 'pusd-to-usdc' ? usdc(post.usdcUnits) : pusd(post.pusdUnits)
  return { makerGives, makerGets }
}

export default function OfferBoard({
  network,
  me,
  refreshSignal,
  makeOffer,
  checkOffer,
  openOffer,
}: {
  network: BoardNetwork
  /** Both wallets connected: the details a take or a post carries. */
  me: BoardParty | null
  /** Changes when this page posts, so the board reads again. */
  refreshSignal: number
  /** The maker's page builds the swap offer for a take (and keeps its secret). */
  makeOffer: (post: BoardPost, take: BoardTake) => Promise<string>
  checkOffer: (encoded: string) => OfferTerms | null
  openOffer: (encoded: string) => void
}) {
  const { toast } = useToast()
  const key = useMemo(boardKey, [])
  const [messages, setMessages] = useState<BoardMessage[] | null>(null)
  const [readError, setReadError] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [now, setNow] = useState(unix)

  const read = useCallback(async () => {
    try {
      setMessages(await readBoard())
      setReadError(false)
    } catch {
      setReadError(true)
    }
    setNow(unix())
  }, [])

  useEffect(() => {
    void read()
    const id = setInterval(() => { if (!document.hidden) void read() }, READ_EVERY_MS)
    return () => clearInterval(id)
  }, [read, refreshSignal])

  const act = async (label: string, task: () => Promise<void>) => {
    setBusy(label)
    try {
      await task()
      await read()
    } catch (err) {
      toast(err instanceof Error ? err.message : `${label} failed`, 'error')
    } finally {
      setBusy(null)
    }
  }

  // While the page is open, say when someone takes your post or accepts your take.
  const seen = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (!messages) return
    const news = messages.filter((m) => (m.type === 'take' && m.postAuthor === key.publicKey)
      || (m.type === 'accept' && m.takeAuthor === key.publicKey))
    if (seen.current === null) {
      seen.current = new Set(news.map((m) => m.event))
      return
    }
    for (const m of news) {
      if (seen.current.has(m.event)) continue
      seen.current.add(m.event)
      toast(m.type === 'take'
        ? 'Someone took your offer. Accept it on the board to start the swap.'
        : 'Your take was accepted. Open your swap on the board.', 'success')
    }
  }, [messages, key.publicKey, toast])

  const board = useMemo(() => foldBoard(messages ?? []), [messages])
  const mine = (p: BoardPost) => p.author === key.publicKey
  const myTakeOn = (p: BoardPost) => board.takes.get(postKey(p.author, p.id))?.find((t) => t.author === key.publicKey)
  const acceptOn = (p: BoardPost) => board.accepts.get(postKey(p.author, p.id))

  const others = board.posts.filter((p) => p.network === network && !mine(p) && (isOpen(board, p, now) || myTakeOn(p)))
  const own = board.posts.filter((p) => p.network === network && mine(p) && (isOpen(board, p, now) || acceptOn(p)))

  const take = (post: BoardPost) => act('Taking the offer', async () => {
    if (!me) throw new Error('Connect both wallets first')
    await publishToBoard(takeEvent(key.secretKey, post, me))
    toast('Sent. The maker\'s page answers with your swap offer.', 'success')
  })

  const accept = (post: BoardPost, t: BoardTake) => act('Accepting', async () => {
    const encoded = await makeOffer(post, t)
    await publishToBoard(acceptEvent(key.secretKey, post, t, encoded))
    toast('Accepted. Lock your side to start the swap.', 'success')
    openOffer(encoded)
  })

  const takeDown = (post: BoardPost) => act('Taking the post down', async () => {
    await publishToBoard(closePostEvent(key.secretKey, post))
  })

  const yourOffer = (post: BoardPost) => {
    const t = myTakeOn(post)
    const a = acceptOn(post)
    if (!t) return null
    if (!a) return { state: 'waiting' as const }
    if (a.takeEvent !== t.event) return { state: 'other' as const }
    const terms = checkOffer(a.offer)
    return terms && acceptMatches(post, t, a, terms) ? { state: 'ready' as const, offer: a.offer } : { state: 'mismatch' as const }
  }

  return (
    <section className="rounded-2xl border hairline bg-nomos-surface p-5" aria-label="Offer board">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[17px] font-semibold text-nomos-text">Offer board</h2>
        <button type="button" onClick={() => { void read() }} className="text-sm text-nomos-muted hover:text-nomos-text">
          {messages === null ? 'Reading…' : `Updated ${ago(now, unix())}`}
        </button>
      </div>
      <p className="mt-1 text-sm leading-relaxed text-nomos-muted">
        Open offers on public Nostr relays, with no Nomos server in between. Take one and the maker's page answers with a swap made for you; then both of you lock as usual.
      </p>
      {readError && <p className="mt-2 text-sm text-nomos-refuse">Could not reach the relays. Trying again shortly.</p>}

      {own.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-nomos-text">Your posts</h3>
          <ul className="mt-2 space-y-3">
            {own.map((post) => {
              const { makerGives, makerGets } = sides(post)
              const a = acceptOn(post)
              const outcome = a ? outcomeOf(a.offer, 'initiator') : 'open'
              const takes = board.takes.get(postKey(post.author, post.id)) ?? []
              const wrongWallets = me !== null
                && (me.bchPk.toLowerCase() !== post.maker.bchPk || me.baseAddress.toLowerCase() !== post.maker.baseAddress.toLowerCase())
              return (
                <li key={post.event} className="rounded-xl bg-nomos-surface-raised p-4">
                  <p className="text-[15px] font-semibold tabular-nums text-nomos-text">You send {makerGives}, you receive {makerGets}</p>
                  <p className="mt-0.5 text-xs text-nomos-muted">Posted {ago(post.createdAt, now)}{outcome === 'open' ? ` · ${left(post.expiresAt, now)}` : ''}</p>
                  {a && outcome !== 'open' ? (
                    <Finished outcome={outcome} onOpen={() => openOffer(a.offer)} />
                  ) : a ? (
                    <button type="button" className="btn-primary mt-3 min-h-[40px] px-4 text-sm" onClick={() => openOffer(a.offer)}>
                      Accepted: open the swap
                    </button>
                  ) : (
                    <>
                      {takes.length === 0 && <p className="mt-2 text-sm text-nomos-muted">No one has taken it yet.</p>}
                      <ul className="mt-2 space-y-2">
                        {takes.map((t) => (
                          <li key={t.event} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                            <span className="text-nomos-muted">
                              Taken {ago(t.createdAt, now)} by <span className="font-mono text-nomos-text">{shortAddr(t.taker.baseAddress, 6, 4)}</span>
                            </span>
                            <button
                              type="button"
                              className="btn-primary min-h-[36px] px-3 text-sm"
                              disabled={Boolean(busy) || !me || wrongWallets}
                              title={!me ? 'Connect both wallets first' : wrongWallets ? 'Connect the wallets you posted with' : undefined}
                              onClick={() => { void accept(post, t) }}
                            >
                              Accept
                            </button>
                          </li>
                        ))}
                      </ul>
                      {wrongWallets && <p className="mt-2 text-xs text-nomos-refuse">Connect the wallets you posted with to accept.</p>}
                      <button type="button" className="mt-3 text-sm text-nomos-muted underline underline-offset-4 hover:text-nomos-text" disabled={Boolean(busy)} onClick={() => { void takeDown(post) }}>
                        Take the post down
                      </button>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="mt-4">
        {own.length > 0 && <h3 className="text-sm font-semibold text-nomos-text">Open offers</h3>}
        {messages !== null && others.length === 0 && (
          <p className="mt-2 text-sm text-nomos-muted">No open offers right now. Post yours above and anyone can take it.</p>
        )}
        <ul className="mt-2 space-y-3">
          {others.map((post) => {
            const { makerGives, makerGets } = sides(post)
            const yours = yourOffer(post)
            const outcome = yours?.state === 'ready' ? outcomeOf(yours.offer, 'responder') : 'open'
            return (
              <li key={post.event} className="rounded-xl bg-nomos-surface-raised p-4">
                <p className="text-[15px] font-semibold tabular-nums text-nomos-text">You send {makerGets}, you receive {makerGives}</p>
                <p className="mt-0.5 text-xs text-nomos-muted">
                  Posted {ago(post.createdAt, now)} by <span className="font-mono">{shortAddr(post.maker.baseAddress, 6, 4)}</span>{outcome === 'open' ? ` · ${left(post.expiresAt, now)}` : ''}
                </p>
                {yours?.state === 'ready' && outcome !== 'open' ? (
                  <Finished outcome={outcome} onOpen={() => openOffer(yours.offer)} />
                ) : yours?.state === 'ready' ? (
                  <button type="button" className="btn-primary mt-3 min-h-[40px] px-4 text-sm" onClick={() => openOffer(yours.offer)}>
                    Accepted: open your swap
                  </button>
                ) : yours?.state === 'waiting' ? (
                  <p className="mt-2 text-sm text-nomos-muted-bright">You took it. Waiting for the maker to accept.</p>
                ) : yours?.state === 'other' ? (
                  <p className="mt-2 text-sm text-nomos-muted">The maker accepted someone else.</p>
                ) : yours?.state === 'mismatch' ? (
                  <p className="mt-2 text-sm text-nomos-refuse">The maker's reply does not match this post, so it is not shown. Nothing was locked.</p>
                ) : (
                  <button
                    type="button"
                    className="btn-secondary mt-3 min-h-[40px] px-4 text-sm"
                    disabled={Boolean(busy) || !me}
                    title={!me ? 'Connect both wallets first' : undefined}
                    onClick={() => { void take(post) }}
                  >
                    {busy === 'Taking the offer' ? <><span className="spinner mr-2" aria-hidden="true" />Sending…</> : 'Take this offer'}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
        {!me && others.length > 0 && <p className="mt-2 text-xs text-nomos-muted">Connect both wallets to take an offer.</p>}
      </div>
    </section>
  )
}
