import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import * as nip19 from 'nostr-tools/nip19'
import { useWallet } from '../context/WalletContext'
import {
  anchorNostrKey,
  signBchChallenge,
  verifyBchChallenge,
  EXPLORER_TX_URL,
} from '../lib/contract'
import {
  DEFAULT_RELAYS,
  publishIdentityClaim,
  removeIdentityClaim,
  nostrSigner,
  signNostrChallenge,
  verifyNostrChallenge,
  newChallenge,
} from '../lib/nostr'
import { verifyLinks, makeAuthResponse, verifyAuthResponse } from '../lib/identity'
import type { CheckedClaim, AuthCheck } from '../lib/identity'
import { KV, shortAddr } from './ui'

interface Linked {
  address: string
  pubkeyHex: string
  anchorTxid: string
}

type Tab = 'verify' | 'prove' | 'response' | 'lookup'
type Scope = 'link' | 'prove' | 'verify'

const NOS2X_URL = 'https://github.com/fiatjaf/nos2x'
const ALBY_URL = 'https://getalby.com'
const NO_ANSWER = 'No answer from your Nostr extension. Click its icon in the browser toolbar: it may be waiting for you to allow Nomos, or to finish its own setup.'

function verifyUrl(input: string): string {
  return `${window.location.origin}/identity?verify=${encodeURIComponent(input.trim())}`
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      (value) => { clearTimeout(id); resolve(value) },
      (err) => { clearTimeout(id); reject(err) },
    )
  })
}

/** Extension errors in words a person can act on. */
function extensionError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err ?? '')
  if (/reject|denied|declin|cancel|not allowed/i.test(message)) return 'You declined in the extension. Try again and choose Allow.'
  return message || 'The Nostr extension did not answer.'
}

/** Whether a NIP-07 extension has put window.nostr on the page. Extensions inject late, so keep looking for a few seconds. */
function useNostrExtension(): { found: boolean; alby: boolean } {
  const detect = () => ({
    found: Boolean(nostrSigner()),
    alby: Boolean((window as unknown as { webln?: unknown; alby?: unknown }).webln || (window as unknown as { alby?: unknown }).alby),
  })
  const [state, setState] = useState(detect)
  useEffect(() => {
    if (state.found) return
    let tries = 0
    const id = setInterval(() => {
      tries += 1
      const next = detect()
      if (next.found || tries > 24) {
        setState(next)
        clearInterval(id)
      }
    }, 250)
    return () => clearInterval(id)
  }, [state.found])
  return state
}

/** Link a BCH address to a Nostr key, and verify, prove or check such links. */
export default function IdentityLink({ lookup }: { lookup?: ReactNode }) {
  const { wallet } = useWallet()
  const extension = useNostrExtension()
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>('verify')
  const [query, setQuery] = useState(() => searchParams.get('verify') ?? '')
  const [checkedInput, setCheckedInput] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [claims, setClaims] = useState<CheckedClaim[] | null>(null)
  const [verifyError, setVerifyError] = useState<string | null>(null)

  const [nostrPk, setNostrPk] = useState<string | null>(null)
  const [anchorTxid, setAnchorTxid] = useState<string | null>(null)
  // Linking and proving share one signer at a time; each shows its own status.
  const [busy, setBusy] = useState<{ label: string; scope: Scope } | null>(null)
  const [stepError, setStepError] = useState<{ message: string; scope: Scope } | null>(null)
  const [published, setPublished] = useState(false)

  const [linked, setLinked] = useState<Linked | null>(null)
  const [nonce, setNonce] = useState(newChallenge)
  const [proofResult, setProofResult] = useState<{ ok: boolean; reason: string; proof: string } | null>(null)

  const [issued, setIssued] = useState(newChallenge)
  const [response, setResponse] = useState('')
  const [responseBusy, setResponseBusy] = useState(false)
  const [responseResult, setResponseResult] = useState<{ ok: boolean; checks: AuthCheck[] } | null>(null)

  const copy = (key: string, text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 1500)
    })
  }

  const runCheck = async (input: string) => {
    if (!input.trim() || checking) return
    setChecking(true)
    setVerifyError(null)
    setClaims(null)
    try {
      const found = await verifyLinks(input)
      setClaims(found)
      setCheckedInput(input.trim())
      const proven = found.find((c) => c.anchorOk)
      if (proven) setLinked({ address: proven.address, pubkeyHex: proven.pubkeyHex, anchorTxid: proven.anchorTxid })
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : 'Lookup failed')
    } finally {
      setChecking(false)
    }
  }

  // A shared verify link (/identity?verify=…) runs the check on open. Otherwise
  // the connected wallet's own address is checked, so an existing link shows.
  const autoRan = useRef(false)
  useEffect(() => {
    if (autoRan.current) return
    const initial = searchParams.get('verify')
    if (initial) {
      autoRan.current = true
      void runCheck(initial)
    } else if (wallet?.connected && wallet.address) {
      autoRan.current = true
      setQuery(wallet.address)
      void runCheck(wallet.address)
    }
  }, [searchParams, wallet?.connected, wallet?.address]) // eslint-disable-line react-hooks/exhaustive-deps

  const checkResponse = async () => {
    if (!response.trim() || responseBusy) return
    setResponseBusy(true)
    setResponseResult(null)
    try {
      setResponseResult(await verifyAuthResponse(response, issued))
    } finally {
      setResponseBusy(false)
    }
  }

  const step = async (label: string, action: () => Promise<void>, scope: Scope = 'link') => {
    setBusy({ label, scope })
    setStepError(null)
    try {
      await action()
    } catch (err) {
      setStepError({ message: err instanceof Error ? err.message : `${label} failed`, scope })
    } finally {
      setBusy(null)
    }
  }

  const readNostrKey = () => step('Waiting for your Nostr extension', async () => {
    const signer = nostrSigner()
    if (!signer) throw new Error('No Nostr extension found. Install nos2x or Alby, then reload this page.')
    try {
      setNostrPk(await withTimeout(signer.getPublicKey(), 90_000, NO_ANSWER))
    } catch (err) {
      throw new Error(extensionError(err))
    }
  })

  const anchor = () => step('Waiting for your BCH wallet', async () => {
    if (!wallet?.connected || !nostrPk) return
    setAnchorTxid(await anchorNostrKey(wallet.address, nostrPk, wallet.provider, wallet.wcIndex ?? 0))
  })

  const publish = () => step('Waiting for your Nostr extension', async () => {
    if (!wallet?.connected || !anchorTxid || !nostrPk) return
    try {
      await withTimeout(publishIdentityClaim(wallet.address, anchorTxid), 120_000, NO_ANSWER)
    } catch (err) {
      throw new Error(extensionError(err))
    }
    setPublished(true)
    setLinked({ address: wallet.address, pubkeyHex: nostrPk, anchorTxid })
    setQuery(wallet.address)
    setTab('verify')
    await runCheck(wallet.address)
  })

  const proveNostr = () => step('Signing challenge', async () => {
    if (!linked) return
    const event = await signNostrChallenge(nonce)
    const check = verifyNostrChallenge(event, linked.pubkeyHex, nonce)
    setProofResult({ ...check, proof: JSON.stringify(makeAuthResponse('nostr', nonce, linked, event)) })
  }, 'prove')

  const proveBch = () => step('Signing challenge', async () => {
    if (!linked || !wallet?.connected) return
    if (wallet.address.toLowerCase() !== linked.address.toLowerCase()) {
      throw new Error('Connect the wallet for the linked address to answer with BCH.')
    }
    const proof = await signBchChallenge(wallet.address, nonce, wallet.provider, wallet.wcIndex ?? 0)
    const check = verifyBchChallenge(proof, linked.address, nonce)
    setProofResult({ ...check, proof: JSON.stringify(makeAuthResponse('bch', nonce, linked, proof)) })
  }, 'prove')

  const removeLink = (claim: CheckedClaim) => step('Removing link', async () => {
    const signer = nostrSigner()
    if (!signer) throw new Error('No Nostr extension found. Install nos2x or Alby, then reload this page.')
    if ((await signer.getPublicKey()) !== claim.pubkeyHex) throw new Error('Only the Nostr key that made this claim can remove it.')
    await removeIdentityClaim(claim.address)
    if (linked?.address === claim.address && linked.pubkeyHex === claim.pubkeyHex) setLinked(null)
    await runCheck(checkedInput || claim.address)
  }, 'verify')

  const connected = Boolean(wallet?.connected)
  const current = !nostrPk ? 1 : !anchorTxid ? 2 : !published ? 3 : 4
  const ownLink = claims?.find((c) => c.anchorOk && wallet?.address && c.address.toLowerCase() === wallet.address.toLowerCase())

  const steps: { n: number; title: string; body: string; action: string; run: () => void; enabled: boolean; result: ReactNode }[] = [
    {
      n: 1,
      title: 'Share your Nostr public key',
      body: 'Your extension asks whether Nomos may read your public key. Choose Allow. Your private key never leaves the extension.',
      action: 'Read from extension',
      run: () => { void readNostrKey() },
      enabled: connected && extension.found,
      result: nostrPk ? <span className="font-mono">{shortAddr(nip19.npubEncode(nostrPk), 12, 6)}</span> : null,
    },
    {
      n: 2,
      title: 'Write it into a Bitcoin Cash transaction',
      body: 'Your BCH wallet asks you to sign a transaction back to yourself that carries your Nostr key. Only the network fee leaves your wallet, a few hundred sats.',
      action: 'Sign in wallet',
      run: () => { void anchor() },
      enabled: Boolean(nostrPk),
      result: anchorTxid ? <a href={`${EXPLORER_TX_URL}${anchorTxid}`} target="_blank" rel="noreferrer" className="font-mono underline underline-offset-2">{anchorTxid.slice(0, 12)}…</a> : null,
    },
    {
      n: 3,
      title: 'Publish the link on Nostr',
      body: `Your extension asks to sign a note that points to that transaction. It goes to ${DEFAULT_RELAYS.length} public relays.`,
      action: 'Sign in extension',
      run: () => { void publish() },
      enabled: Boolean(anchorTxid),
      result: published ? 'Published' : null,
    },
  ]

  const TABS: { id: Tab; label: string }[] = [
    { id: 'verify', label: 'Verify a link' },
    { id: 'prove', label: "Prove it's you" },
    { id: 'response', label: 'Check a response' },
    ...(lookup ? [{ id: 'lookup' as Tab, label: 'Find a payee' }] : []),
  ]

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] lg:items-start lg:gap-8">
        {/* Link: three signatures, in order */}
        <section className="rounded-2xl border hairline bg-nomos-surface p-5 sm:p-6" aria-label="Link your BCH address">
          <h2 className="font-display text-[1.35rem] font-extrabold leading-tight text-nomos-text" style={{ fontStretch: '112%' }}>Link your BCH address</h2>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-nomos-muted">
            Both keys sign, so the link cannot be faked by either side alone. Afterwards anyone can pay you by your npub or name@domain, and check the link here.
          </p>

          {ownLink && !published && (
            <p className="mt-4 rounded-xl border border-nomos-ok/40 bg-nomos-ok/10 px-4 py-3 text-sm text-nomos-text">
              This wallet is already linked to <span className="font-mono">{shortAddr(ownLink.npub, 12, 6)}</span>. Link again only to use a different Nostr key.
            </p>
          )}

          {!connected && (
            <p className="mt-4 rounded-xl bg-nomos-surface-raised px-4 py-3 text-sm text-nomos-text">
              Connect a BCH wallet first. <Link to="/connect" className="font-semibold underline underline-offset-4">Connect wallet</Link>
            </p>
          )}

          <ol className="relative mt-5 space-y-0">
            {steps.map((s, i) => {
              const done = s.n < current
              const active = s.n === current
              return (
                <li key={s.n} className="relative flex gap-4 pb-6 last:pb-0">
                  {i < steps.length - 1 && <span className={`absolute left-[15px] top-9 h-[calc(100%-2.25rem)] w-0.5 ${done ? 'bg-nomos-ok' : 'bg-nomos-surface-raised'}`} aria-hidden="true" />}
                  <span
                    className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      done ? 'bg-nomos-ok text-nomos-on-ok' : active ? 'bg-nomos-accent text-nomos-on-accent ring-4 ring-nomos-accent/25' : 'bg-nomos-surface-raised text-nomos-muted'
                    }`}
                    aria-hidden="true"
                  >
                    {done ? (
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    ) : s.n}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-[15px] font-semibold ${active || done ? 'text-nomos-text' : 'text-nomos-muted'}`}>{s.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-nomos-muted">{s.body}</p>
                    {s.result && <p className="mt-2 text-sm text-nomos-ok">{s.result}</p>}
                    {active && (
                      <button type="button" onClick={s.run} disabled={!s.enabled || Boolean(busy)} className="btn-primary mt-3 min-h-[40px] px-4 text-sm">
                        {busy?.scope === 'link' ? <><span className="spinner mr-2" aria-hidden="true" />{busy.label}…</> : s.action}
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>

          {stepError?.scope === 'link' && <p className="mt-4 rounded-xl bg-nomos-refuse/10 px-4 py-3 text-sm text-nomos-refuse" role="alert">{stepError.message}</p>}

          {published && nostrPk && (
            <div className="mt-5 rounded-xl border border-nomos-ok/40 bg-nomos-ok/10 p-4">
              <p className="text-[15px] font-semibold text-nomos-text">Linked by both keys</p>
              <p className="mt-1 text-sm text-nomos-muted">People can now pay you by your npub in Pay, and anyone can check the link.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => copy('own-verify', verifyUrl(nip19.npubEncode(nostrPk)))} className="btn-secondary min-h-[38px] px-3 text-sm">
                  {copied === 'own-verify' ? 'Copied' : 'Copy verify link'}
                </button>
                <button type="button" onClick={() => copy('own-npub', nip19.npubEncode(nostrPk))} className="btn-ghost min-h-[38px] px-3 text-sm">
                  {copied === 'own-npub' ? 'Copied' : 'Copy npub'}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Setup help for the Nostr side */}
        {/* Without an extension nothing can start, so on phones its help comes first. */}
        <aside className={`space-y-4 ${extension.found ? '' : 'order-first lg:order-none'}`} aria-label="Nostr extension">
          <div className="rounded-2xl border hairline bg-nomos-surface p-5">
            <p className="flex items-center gap-2 text-[15px] font-semibold text-nomos-text">
              <span className={`h-2.5 w-2.5 rounded-full ${extension.found ? 'bg-nomos-ok' : 'bg-nomos-refuse'}`} aria-hidden="true" />
              {extension.found ? 'Nostr extension found' : 'No Nostr extension found'}
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-nomos-muted">
              {extension.found
                ? 'Steps 1 and 3 open a prompt from it. If nothing appears, click the extension icon in your browser toolbar.'
                : 'Your Nostr key lives in a browser extension. Install one, add your key, then reload this page.'}
            </p>
          </div>
          <div className="rounded-2xl border hairline bg-nomos-surface p-5">
            <p className="text-[15px] font-semibold text-nomos-text">Which extension?</p>
            <dl className="mt-3 space-y-3 text-sm leading-relaxed">
              <div>
                <dt className="font-semibold text-nomos-text"><a href={NOS2X_URL} target="_blank" rel="noreferrer" className="underline underline-offset-4">nos2x</a>, the simplest</dt>
                <dd className="mt-0.5 text-nomos-muted">It only holds your Nostr key. Open its options, paste your nsec or generate a new key, and save.</dd>
              </div>
              <div>
                <dt className="font-semibold text-nomos-text"><a href={ALBY_URL} target="_blank" rel="noreferrer" className="underline underline-offset-4">Alby</a></dt>
                <dd className="mt-0.5 text-nomos-muted">Also a Lightning wallet, so it asks you to finish its own setup before it signs anything for Nostr.</dd>
              </div>
              <div>
                <dt className="font-semibold text-nomos-text">Have both?</dt>
                <dd className="mt-0.5 text-nomos-muted">
                  Both answer the same request, so turn one off in your browser's extensions page and reload.
                  {extension.alby && ' Alby looks active in this browser.'}
                </dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>

      {/* Check and prove */}
      <section className="card min-w-0 overflow-hidden" aria-label="Check and prove links">
        <div role="tablist" aria-label="Identity tools" className="flex gap-1 overflow-x-auto border-b hairline px-2 pt-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px shrink-0 border-b-2 px-3 pb-2.5 pt-1.5 text-sm font-semibold transition-colors ${
                tab === t.id ? 'border-nomos-accent text-nomos-text' : 'border-transparent text-nomos-muted hover:text-nomos-text'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-4 sm:p-5" role="tabpanel">
          {tab === 'verify' && (
            <>
              <p className="mb-3 text-sm text-nomos-muted">Paste an npub, a name@domain or a BCH address. Nomos checks the Nostr note and the BCH transaction in your browser.</p>
              <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void runCheck(query) }}>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="npub, name@domain or BCH address"
                  className="input"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="npub, name@domain or BCH address"
                />
                <button type="submit" disabled={!query.trim() || checking} className="btn-primary shrink-0 sm:w-36">
                  {checking ? <><span className="spinner mr-2" /> Checking…</> : 'Verify link'}
                </button>
              </form>
              {verifyError && <p className="mt-2 text-sm text-nomos-refuse">{verifyError}</p>}
              {busy?.scope === 'verify' && <p className="mt-2 text-sm text-nomos-muted-bright"><span className="spinner mr-2" />{busy.label}…</p>}
              {stepError?.scope === 'verify' && <p className="mt-2 text-sm text-nomos-refuse">{stepError.message}</p>}
              {claims && claims.length === 0 && <p className="mt-3 text-sm text-nomos-muted">No link found for {shortAddr(checkedInput, 12, 6)}.</p>}
              {claims && claims.map((claim) => (
                <div key={`${claim.eventId}-${claim.address}`} className="mt-3 rounded-xl border hairline p-4">
                  <p className={`text-sm font-semibold ${claim.anchorOk ? 'text-nomos-ok' : 'text-nomos-refuse'}`}>
                    {claim.anchorOk ? 'Linked by both keys' : 'Not proven'}
                  </p>
                  <KV label="Nostr key">{shortAddr(claim.npub, 10, 6)}</KV>
                  <KV label="BCH address">{shortAddr(claim.address, 10, 6)}</KV>
                  <KV label="Nostr note">Signature valid, {new Date(claim.createdAt * 1000).toLocaleDateString()}</KV>
                  <KV label="BCH transaction" tone={claim.anchorOk ? 'paid' : 'refused'}>
                    <a href={`${EXPLORER_TX_URL}${claim.anchorTxid}`} target="_blank" rel="noreferrer" className="underline">{claim.anchorTxid.slice(0, 10)}…</a>
                  </KV>
                  <p className="mt-1 text-sm text-nomos-muted">{claim.anchorReason}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    <button type="button" onClick={() => copy(`v-${claim.eventId}`, verifyUrl(claim.npub))} className="text-sm text-nomos-muted-bright hover:text-nomos-text">
                      {copied === `v-${claim.eventId}` ? 'Copied' : 'Copy verify link'}
                    </button>
                    <button type="button" onClick={() => copy(`e-${claim.eventId}`, claim.eventId)} className="text-sm text-nomos-muted-bright hover:text-nomos-text">
                      {copied === `e-${claim.eventId}` ? 'Copied' : 'Copy event id'}
                    </button>
                    {extension.found && (
                      <button type="button" onClick={() => { void removeLink(claim) }} disabled={Boolean(busy)} className="text-sm text-nomos-muted-bright hover:text-nomos-text">
                        Remove link
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}

          {tab === 'prove' && (
            !linked ? (
              <p className="text-sm text-nomos-muted">Verify or create a link first. Then answer a fresh challenge with either key to show you control it.</p>
            ) : (
              <>
                <KV label="Linked address">{shortAddr(linked.address, 10, 6)}</KV>
                <KV label="Linked key">{shortAddr(nip19.npubEncode(linked.pubkeyHex), 10, 6)}</KV>
                <KV label="Challenge">{nonce}</KV>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button type="button" onClick={() => { void proveNostr() }} disabled={Boolean(busy)} className="btn-secondary">Answer with Nostr key</button>
                  <button type="button" onClick={() => { void proveBch() }} disabled={Boolean(busy) || !wallet?.connected} className="btn-secondary">Answer with BCH wallet</button>
                </div>
                <button type="button" onClick={() => { setNonce(newChallenge()); setProofResult(null) }} className="mt-2 text-sm text-nomos-muted hover:text-nomos-text">New challenge</button>
                {busy?.scope === 'prove' && <p className="mt-2 text-sm text-nomos-muted-bright"><span className="spinner mr-2" />{busy.label}…</p>}
                {stepError?.scope === 'prove' && <p className="mt-2 text-sm text-nomos-refuse">{stepError.message}</p>}
                {proofResult && (
                  <div className="mt-3 rounded-xl border hairline p-4">
                    <p className={`text-sm font-semibold ${proofResult.ok ? 'text-nomos-ok' : 'text-nomos-refuse'}`}>
                      {proofResult.ok ? 'Authenticated' : 'Rejected'}
                    </p>
                    <p className="mt-1 text-sm text-nomos-muted-bright">{proofResult.reason}</p>
                    <button type="button" onClick={() => { void navigator.clipboard.writeText(proofResult.proof) }} className="link-action mt-2">
                      Copy signed response
                    </button>
                  </div>
                )}
              </>
            )
          )}

          {tab === 'response' && (
            <>
              <p className="text-sm text-nomos-muted">Send this challenge to the person, then paste their signed response.</p>
              <KV label="Your challenge">{issued}</KV>
              <div className="mt-1 flex gap-4">
                <button type="button" onClick={() => copy('issued', issued)} className="text-sm text-nomos-muted-bright hover:text-nomos-text">{copied === 'issued' ? 'Copied' : 'Copy challenge'}</button>
                <button type="button" onClick={() => { setIssued(newChallenge()); setResponseResult(null) }} className="text-sm text-nomos-muted-bright hover:text-nomos-text">New challenge</button>
              </div>
              <textarea
                value={response}
                onChange={(event) => { setResponse(event.target.value); setResponseResult(null) }}
                placeholder='{"v":1,"protocol":"nomos-identity",…}'
                rows={4}
                className="input mt-3 font-mono text-sm"
                spellCheck={false}
                aria-label="Signed response"
              />
              <button type="button" onClick={() => { void checkResponse() }} disabled={!response.trim() || responseBusy} className="btn-primary mt-2 w-full sm:w-auto sm:px-6">
                {responseBusy ? <><span className="spinner mr-2" /> Checking…</> : 'Check response'}
              </button>
              {responseResult && (
                <div className="mt-3 rounded-xl border hairline p-4">
                  <p className={`text-sm font-semibold ${responseResult.ok ? 'text-nomos-ok' : 'text-nomos-refuse'}`}>
                    {responseResult.ok ? 'Authenticated' : 'Rejected'}
                  </p>
                  {responseResult.checks.map((c) => (
                    <KV key={c.label} label={c.label} tone={c.ok ? 'paid' : 'refused'}>{c.detail}</KV>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'lookup' && lookup}
        </div>
      </section>
    </>
  )
}
