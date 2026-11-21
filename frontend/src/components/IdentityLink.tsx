import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import * as nip19 from 'nostr-tools/nip19'
import { useWallet } from '../context/WalletContext'
import {
  anchorNostrKey,
  signBchChallenge,
  verifyBchChallenge,
  EXPLORER_TX_URL,
} from '../lib/contract'
import {
  publishIdentityClaim,
  removeIdentityClaim,
  nostrSigner,
  signNostrChallenge,
  verifyNostrChallenge,
  newChallenge,
} from '../lib/nostr'
import { verifyLinks, makeAuthResponse, verifyAuthResponse } from '../lib/identity'
import type { CheckedClaim, AuthCheck } from '../lib/identity'
import { Panel, KV, shortAddr } from './ui'

interface Linked {
  address: string
  pubkeyHex: string
  anchorTxid: string
}

function verifyUrl(input: string): string {
  return `${window.location.origin}/identity?verify=${encodeURIComponent(input.trim())}`
}

/** Create, verify and authenticate a link between a BCH address and a Nostr key. */
export default function IdentityLink() {
  const { wallet } = useWallet()
  const [searchParams] = useSearchParams()
  const [query, setQuery] = useState(() => searchParams.get('verify') ?? '')
  const [checkedInput, setCheckedInput] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [claims, setClaims] = useState<CheckedClaim[] | null>(null)
  const [verifyError, setVerifyError] = useState<string | null>(null)

  const [nostrPk, setNostrPk] = useState<string | null>(null)
  const [anchorTxid, setAnchorTxid] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
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

  // A shared verify link (/identity?verify=…) runs the check on open.
  const autoRan = useRef(false)
  useEffect(() => {
    const initial = searchParams.get('verify')
    if (initial && !autoRan.current) {
      autoRan.current = true
      void runCheck(initial)
    }
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const step = async (label: string, action: () => Promise<void>) => {
    setBusy(label)
    setCreateError(null)
    try {
      await action()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : `${label} failed`)
    } finally {
      setBusy(null)
    }
  }

  const readNostrKey = () => step('Reading Nostr key', async () => {
    const signer = nostrSigner()
    if (!signer) throw new Error('No Nostr signer found. Install a NIP-07 extension such as Alby or nos2x, then reload.')
    setNostrPk(await signer.getPublicKey())
  })

  const anchor = () => step('Anchoring on BCH', async () => {
    if (!wallet?.connected || !nostrPk) return
    setAnchorTxid(await anchorNostrKey(wallet.address, nostrPk, wallet.provider, wallet.wcIndex ?? 0))
  })

  const publish = () => step('Publishing on Nostr', async () => {
    if (!wallet?.connected || !anchorTxid || !nostrPk) return
    await publishIdentityClaim(wallet.address, anchorTxid)
    setPublished(true)
    setLinked({ address: wallet.address, pubkeyHex: nostrPk, anchorTxid })
    setQuery(wallet.address)
    await runCheck(wallet.address)
  })

  const proveNostr = () => step('Signing challenge', async () => {
    if (!linked) return
    const event = await signNostrChallenge(nonce)
    const check = verifyNostrChallenge(event, linked.pubkeyHex, nonce)
    setProofResult({ ...check, proof: JSON.stringify(makeAuthResponse('nostr', nonce, linked, event)) })
  })

  const proveBch = () => step('Signing challenge', async () => {
    if (!linked || !wallet?.connected) return
    if (wallet.address.toLowerCase() !== linked.address.toLowerCase()) {
      throw new Error('Connect the wallet for the linked address to answer with BCH.')
    }
    const proof = await signBchChallenge(wallet.address, nonce, wallet.provider, wallet.wcIndex ?? 0)
    const check = verifyBchChallenge(proof, linked.address, nonce)
    setProofResult({ ...check, proof: JSON.stringify(makeAuthResponse('bch', nonce, linked, proof)) })
  })

  const removeLink = (claim: CheckedClaim) => step('Removing link', async () => {
    const signer = nostrSigner()
    if (!signer) throw new Error('No Nostr signer found. Install a NIP-07 extension such as Alby or nos2x.')
    if ((await signer.getPublicKey()) !== claim.pubkeyHex) throw new Error('Only the Nostr key that made this claim can remove it.')
    await removeIdentityClaim(claim.address)
    if (linked?.address === claim.address && linked.pubkeyHex === claim.pubkeyHex) setLinked(null)
    await runCheck(checkedInput || claim.address)
  })

  const canCreate = Boolean(wallet?.connected)

  return (
    <>
      <Panel title="Verify a BCH and Nostr link">
        <form
          className="space-y-2"
          onSubmit={(event) => { event.preventDefault(); void runCheck(query) }}
        >
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="npub, name@domain or BCH address"
            className="input"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" disabled={!query.trim() || checking} className="btn-primary w-full">
            {checking ? <><span className="spinner mr-2" /> Checking…</> : 'Verify link'}
          </button>
        </form>
        {verifyError && <p className="mt-2 text-sm text-nomos-refuse">{verifyError}</p>}
        {claims && claims.length === 0 && <p className="mt-2 text-sm text-nomos-muted">No link found.</p>}
        {claims && claims.map((claim) => (
          <div key={`${claim.eventId}-${claim.address}`} className="mt-3 rounded-lg border hairline p-3">
            <p className={`text-xs font-medium ${claim.anchorOk ? 'text-nomos-ok' : 'text-nomos-refuse'}`}>
              {claim.anchorOk ? 'Linked by both keys' : 'Not proven'}
            </p>
            <KV label="Nostr key">{shortAddr(claim.npub, 10, 6)}</KV>
            <KV label="BCH address">{shortAddr(claim.address, 10, 6)}</KV>
            <KV label="Nostr claim">signature valid · {new Date(claim.createdAt * 1000).toLocaleDateString()}</KV>
            <KV label="BCH anchor" tone={claim.anchorOk ? 'paid' : 'refused'}>
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
              {nostrSigner() && (
                <button type="button" onClick={() => { void removeLink(claim) }} disabled={Boolean(busy)} className="text-sm text-nomos-muted-bright hover:text-nomos-text">
                  Remove link
                </button>
              )}
            </div>
          </div>
        ))}
      </Panel>

      <Panel title="Link your BCH address to your Nostr key">
        <p className="text-sm text-nomos-muted">
          Your wallet signs a small transaction that names your Nostr key, then your Nostr key publishes a claim that points to it.
        </p>
        {!canCreate && <p className="mt-2 text-sm text-nomos-muted-bright">Connect a BCH wallet first.</p>}
        <ol className="mt-3 space-y-2">
          <li className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-[15px] text-nomos-text">1. Nostr key {nostrPk ? shortAddr(nip19.npubEncode(nostrPk), 10, 6) : ''}</span>
            <button type="button" onClick={() => { void readNostrKey() }} disabled={!canCreate || Boolean(busy) || Boolean(nostrPk)} className="btn-ghost shrink-0">
              {nostrPk ? 'Done' : 'Read from extension'}
            </button>
          </li>
          <li className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-[15px] text-nomos-text">2. BCH anchor {anchorTxid ? `${anchorTxid.slice(0, 10)}…` : ''}</span>
            <button type="button" onClick={() => { void anchor() }} disabled={!nostrPk || Boolean(busy) || Boolean(anchorTxid)} className="btn-ghost shrink-0">
              {anchorTxid ? 'Done' : 'Sign in wallet'}
            </button>
          </li>
          <li className="flex items-center justify-between gap-3">
            <span className="text-[15px] text-nomos-text">3. Nostr claim</span>
            <button type="button" onClick={() => { void publish() }} disabled={!anchorTxid || Boolean(busy) || published} className="btn-ghost shrink-0">
              {published ? 'Published' : 'Sign in extension'}
            </button>
          </li>
        </ol>
        {busy && <p className="mt-2 text-sm text-nomos-muted-bright"><span className="spinner mr-2" />{busy}…</p>}
        {createError && <p className="mt-2 text-sm text-nomos-refuse">{createError}</p>}
      </Panel>

      <Panel title="Prove control of a linked identity">
        {!linked ? (
          <p className="text-sm text-nomos-muted">Verify or create a link first.</p>
        ) : (
          <>
            <KV label="Linked address">{shortAddr(linked.address, 10, 6)}</KV>
            <KV label="Linked key">{shortAddr(nip19.npubEncode(linked.pubkeyHex), 10, 6)}</KV>
            <KV label="Challenge">{nonce}</KV>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => { void proveNostr() }} disabled={Boolean(busy)} className="btn-ghost">Answer with Nostr key</button>
              <button type="button" onClick={() => { void proveBch() }} disabled={Boolean(busy) || !wallet?.connected} className="btn-ghost">Answer with BCH wallet</button>
            </div>
            <button type="button" onClick={() => { setNonce(newChallenge()); setProofResult(null) }} className="mt-2 text-sm text-nomos-muted hover:text-nomos-text">New challenge</button>
            {proofResult && (
              <div className="mt-3 rounded-lg border hairline p-3">
                <p className={`text-xs font-medium ${proofResult.ok ? 'text-nomos-ok' : 'text-nomos-refuse'}`}>
                  {proofResult.ok ? 'Authenticated' : 'Rejected'}
                </p>
                <p className="mt-1 text-sm text-nomos-muted-bright">{proofResult.reason}</p>
                <button
                  type="button"
                  onClick={() => { void navigator.clipboard.writeText(proofResult.proof) }}
                  className="link-action mt-2"
                >
                  Copy signed response
                </button>
              </div>
            )}
          </>
        )}
      </Panel>

      <Panel title="Check someone's signed response">
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
        />
        <button type="button" onClick={() => { void checkResponse() }} disabled={!response.trim() || responseBusy} className="btn-primary mt-2 w-full">
          {responseBusy ? <><span className="spinner mr-2" /> Checking…</> : 'Check response'}
        </button>
        {responseResult && (
          <div className="mt-3 rounded-lg border hairline p-3">
            <p className={`text-xs font-medium ${responseResult.ok ? 'text-nomos-ok' : 'text-nomos-refuse'}`}>
              {responseResult.ok ? 'Authenticated' : 'Rejected'}
            </p>
            {responseResult.checks.map((c) => (
              <KV key={c.label} label={c.label} tone={c.ok ? 'paid' : 'refused'}>{c.detail}</KV>
            ))}
          </div>
        )}
      </Panel>
    </>
  )
}
