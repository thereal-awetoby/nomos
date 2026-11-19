import { useState } from 'react'
import * as nip19 from 'nostr-tools/nip19'
import { useWallet } from '../context/WalletContext'
import {
  anchorNostrKey,
  verifyAnchor,
  signBchChallenge,
  verifyBchChallenge,
  EXPLORER_TX_URL,
} from '../lib/contract'
import {
  findIdentityClaims,
  publishIdentityClaim,
  nostrSigner,
  signNostrChallenge,
  verifyNostrChallenge,
  newChallenge,
} from '../lib/nostr'
import type { IdentityClaim } from '../lib/nostr'
import { Panel, KV, shortAddr } from './ui'

interface CheckedClaim extends IdentityClaim {
  anchorOk: boolean
  anchorReason: string
}

interface Linked {
  address: string
  pubkeyHex: string
}

async function checkClaims(input: string): Promise<CheckedClaim[]> {
  const claims = await findIdentityClaims(input)
  return Promise.all(claims.map(async (claim) => {
    const check = await verifyAnchor(claim.anchorTxid, claim.address, claim.pubkeyHex)
    return { ...claim, anchorOk: check.ok, anchorReason: check.reason }
  }))
}

/** Create, verify and authenticate a link between a BCH address and a Nostr key. */
export default function IdentityLink() {
  const { wallet } = useWallet()
  const [query, setQuery] = useState('')
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

  const runCheck = async (input: string) => {
    if (!input.trim() || checking) return
    setChecking(true)
    setVerifyError(null)
    setClaims(null)
    try {
      const found = await checkClaims(input)
      setClaims(found)
      const proven = found.find((c) => c.anchorOk)
      if (proven) setLinked({ address: proven.address, pubkeyHex: proven.pubkeyHex })
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : 'Lookup failed')
    } finally {
      setChecking(false)
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
    setLinked({ address: wallet.address, pubkeyHex: nostrPk })
    setQuery(wallet.address)
    await runCheck(wallet.address)
  })

  const proveNostr = () => step('Signing challenge', async () => {
    if (!linked) return
    const event = await signNostrChallenge(nonce)
    const check = verifyNostrChallenge(event, linked.pubkeyHex, nonce)
    setProofResult({ ...check, proof: JSON.stringify(event) })
  })

  const proveBch = () => step('Signing challenge', async () => {
    if (!linked || !wallet?.connected) return
    if (wallet.address.toLowerCase() !== linked.address.toLowerCase()) {
      throw new Error('Connect the wallet for the linked address to answer with BCH.')
    }
    const proof = await signBchChallenge(wallet.address, nonce, wallet.provider, wallet.wcIndex ?? 0)
    const check = verifyBchChallenge(proof, linked.address, nonce)
    setProofResult({ ...check, proof: JSON.stringify(proof) })
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
            placeholder="npub… / name@domain / bitcoincash:q…"
            className="input text-xs"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" disabled={!query.trim() || checking} className="btn-primary w-full py-2">
            {checking ? <><span className="spinner mr-2" /> Checking relays and chain…</> : 'Verify link'}
          </button>
        </form>
        {verifyError && <p className="mt-2 text-xs text-nomos-refuse">{verifyError}</p>}
        {claims && claims.length === 0 && <p className="mt-2 text-xs text-nomos-muted">No signed BCH identity claim found on the queried relays.</p>}
        {claims && claims.map((claim) => (
          <div key={`${claim.eventId}-${claim.address}`} className="mt-3 border hairline p-3">
            <p className={`font-mono text-[10px] font-bold uppercase tracking-[0.14em] ${claim.anchorOk ? 'text-nomos-accent' : 'text-nomos-refuse'}`}>
              {claim.anchorOk ? 'Linked · both keys signed' : 'Not proven'}
            </p>
            <KV label="Nostr key">{shortAddr(claim.npub, 10, 6)}</KV>
            <KV label="BCH address">{shortAddr(claim.address, 10, 6)}</KV>
            <KV label="Nostr claim">signature valid · {new Date(claim.createdAt * 1000).toLocaleDateString()}</KV>
            <KV label="BCH anchor" tone={claim.anchorOk ? 'paid' : 'refused'}>
              <a href={`${EXPLORER_TX_URL}${claim.anchorTxid}`} target="_blank" rel="noreferrer" className="underline">{claim.anchorTxid.slice(0, 10)}…</a>
            </KV>
            <p className="mt-1 text-[10px] text-nomos-muted">{claim.anchorReason}</p>
          </div>
        ))}
      </Panel>

      <Panel title="Link your BCH address to your Nostr key">
        <p className="text-[11px] leading-relaxed text-nomos-muted">
          Each key signs on its own network. Your wallet sends a transaction to itself that names your Nostr key; your Nostr key publishes a NIP-39 claim naming your address, with that transaction as proof. The wallet pays the network fee.
        </p>
        {!canCreate && <p className="mt-2 text-xs text-nomos-pending">Connect a BCH wallet first.</p>}
        <ol className="mt-3 space-y-2">
          <li className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate font-mono text-[11px] text-nomos-text">1. Nostr key {nostrPk ? shortAddr(nip19.npubEncode(nostrPk), 10, 6) : ''}</span>
            <button type="button" onClick={() => { void readNostrKey() }} disabled={!canCreate || Boolean(busy) || Boolean(nostrPk)} className="btn-ghost shrink-0 px-3 py-1.5 text-[10px]">
              {nostrPk ? 'Done' : 'Read from extension'}
            </button>
          </li>
          <li className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate font-mono text-[11px] text-nomos-text">2. BCH anchor {anchorTxid ? `${anchorTxid.slice(0, 10)}…` : ''}</span>
            <button type="button" onClick={() => { void anchor() }} disabled={!nostrPk || Boolean(busy) || Boolean(anchorTxid)} className="btn-ghost shrink-0 px-3 py-1.5 text-[10px]">
              {anchorTxid ? 'Done' : 'Sign in wallet'}
            </button>
          </li>
          <li className="flex items-center justify-between gap-3">
            <span className="font-mono text-[11px] text-nomos-text">3. Nostr claim</span>
            <button type="button" onClick={() => { void publish() }} disabled={!anchorTxid || Boolean(busy) || published} className="btn-ghost shrink-0 px-3 py-1.5 text-[10px]">
              {published ? 'Published' : 'Sign in extension'}
            </button>
          </li>
        </ol>
        {busy && <p className="mt-2 text-xs text-nomos-accent"><span className="spinner mr-2" />{busy}…</p>}
        {createError && <p className="mt-2 text-xs text-nomos-refuse">{createError}</p>}
      </Panel>

      <Panel title="Prove control of a linked identity">
        {!linked ? (
          <p className="text-[11px] text-nomos-muted">Verify or create a link first. The challenge is answered with either key and checked against that link.</p>
        ) : (
          <>
            <KV label="Linked address">{shortAddr(linked.address, 10, 6)}</KV>
            <KV label="Linked key">{shortAddr(nip19.npubEncode(linked.pubkeyHex), 10, 6)}</KV>
            <KV label="Challenge">{nonce}</KV>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => { void proveNostr() }} disabled={Boolean(busy)} className="btn-ghost py-2 text-[10px]">Answer with Nostr key</button>
              <button type="button" onClick={() => { void proveBch() }} disabled={Boolean(busy) || !wallet?.connected} className="btn-ghost py-2 text-[10px]">Answer with BCH wallet</button>
            </div>
            <button type="button" onClick={() => { setNonce(newChallenge()); setProofResult(null) }} className="mt-2 text-[10px] text-nomos-muted hover:text-nomos-text">New challenge</button>
            {proofResult && (
              <div className="mt-3 border hairline p-3">
                <p className={`font-mono text-[10px] font-bold uppercase tracking-[0.14em] ${proofResult.ok ? 'text-nomos-accent' : 'text-nomos-refuse'}`}>
                  {proofResult.ok ? 'Authenticated' : 'Rejected'}
                </p>
                <p className="mt-1 text-[11px] text-nomos-muted-bright">{proofResult.reason}</p>
                <button
                  type="button"
                  onClick={() => { void navigator.clipboard.writeText(proofResult.proof) }}
                  className="mt-2 text-[10px] text-nomos-accent hover:underline"
                >
                  Copy signed response
                </button>
                <p className="mt-1 text-[10px] text-nomos-muted">Another app can check this response against the same link without asking Nomos.</p>
              </div>
            )}
          </>
        )}
      </Panel>
    </>
  )
}
