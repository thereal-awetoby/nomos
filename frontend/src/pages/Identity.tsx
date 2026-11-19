import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  DEFAULT_RELAYS,
  isNostrIdentifier,
  payeeLabel,
  resolveNostrPayee,
} from '../lib/nostr'
import type { NostrPayee } from '../lib/nostr'
import { validateCashAddress } from '../lib/contract'
import IdentityLink from '../components/IdentityLink'

/** Standalone Nostr identity lookup; it does not require a connected wallet. */
export default function Identity() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<NostrPayee | null>(null)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)

  useEffect(() => () => {
    requestId.current += 1
  }, [])

  const updateQuery = (value: string) => {
    requestId.current += 1
    setQuery(value)
    setLoading(false)
    setResult(null)
    setError(null)
  }

  const handleLookup = async () => {
    const input = query.trim()
    if (!input || !isNostrIdentifier(input) || loading) return

    const currentRequest = ++requestId.current
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const payee = await resolveNostrPayee(input, validateCashAddress)
      if (requestId.current === currentRequest) setResult(payee)
    } catch (err) {
      if (requestId.current === currentRequest) {
        setError(err instanceof Error ? err.message : 'Lookup failed')
      }
    } finally {
      if (requestId.current === currentRequest) setLoading(false)
    }
  }

  const looksLikeIdentity = isNostrIdentifier(query)

  return (
    <div className="page-enter space-y-5">
      <header>
        <p className="eyebrow">NO WALLET REQUIRED</p>
        <h1 className="page-title">Nostr Identity</h1>
        <p className="mt-1.5 max-w-prose text-xs leading-relaxed text-nomos-muted">
          Look up the BCH address a Nostr identity published, or link your own address to your Nostr key with a signature from each. Queries go directly to public NIP-05 domains, Nostr relays and BCH nodes, not a Nomos server.
        </p>
      </header>

      <form
        className="card space-y-3 p-4"
        onSubmit={(event) => {
          event.preventDefault()
          void handleLookup()
        }}
      >
        <label htmlFor="nostr-identity" className="label block">Nostr identity</label>
        <input
          id="nostr-identity"
          name="nostr-identity"
          type="text"
          value={query}
          onChange={(event) => updateQuery(event.target.value)}
          placeholder="npub… / nprofile… / name@domain"
          className="input text-xs"
          autoComplete="off"
          aria-describedby="identity-hint"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p id="identity-hint" className="text-[10px] text-nomos-muted" aria-live="polite">
            {!query.trim()
              ? 'Enter an npub, nprofile, or NIP-05 name.'
              : looksLikeIdentity
                ? 'This looks like a Nostr identity.'
                : 'Enter an npub, nprofile, or NIP-05 name.'}
          </p>
          <button type="submit" disabled={!query.trim() || !looksLikeIdentity || loading} className="btn-primary px-4 py-2">
            {loading ? <><span className="spinner mr-2" /> Resolving…</> : 'Look up'}
          </button>
        </div>
      </form>

      {error && (
        <div className="card border-nomos-refuse/20 bg-nomos-refuse/5 p-4" role="alert" style={{ borderWidth: '1px', borderStyle: 'solid' }}>
          <p className="text-sm font-medium text-nomos-refuse">{error}</p>
          <p className="mt-1 text-[10px] text-nomos-muted">The person may not have published an address, or the relays may be unavailable.</p>
        </div>
      )}

      {result && (
        <section className="card p-4" aria-labelledby="identity-result-title" aria-live="polite">
          <div className="flex items-start gap-3">
            {result.picture && <img src={result.picture} alt="" referrerPolicy="no-referrer" className="h-10 w-10 shrink-0 rounded-sm object-cover" />}
            <div className="min-w-0 flex-1">
              <p className="eyebrow">VERIFIED EVENT SIGNATURE</p>
              <h2 id="identity-result-title" className="font-mono text-sm font-bold text-nomos-text">{result.displayName || payeeLabel(result)}</h2>
              {result.nip05 && <p className="font-mono text-[10px] text-nomos-accent">{result.nip05}</p>}
              <p className="truncate font-mono text-[9px] text-nomos-muted">{result.npub}</p>
            </div>
          </div>

          <div className="mt-3 border hairline bg-nomos-bg-deep/30 p-3">
            <p className="label mb-1">Published BCH address</p>
            <p className="break-all font-mono text-xs text-nomos-text">{result.address}</p>
            <p className="mt-1 font-mono text-[9px] text-nomos-muted">Published {new Date(result.publishedAt * 1000).toLocaleDateString()}</p>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-nomos-muted">Latest valid event found on queried relays; not necessarily the latest published. Verify the destination before sending.</p>
        </section>
      )}

      <IdentityLink />

      <section className="card p-4" aria-labelledby="identity-relays-title">
        <h2 id="identity-relays-title" className="label mb-2">Default public relays</h2>
        <ul className="grid gap-1 sm:grid-cols-3">
          {DEFAULT_RELAYS.map((relay) => <li key={relay} className="break-all font-mono text-[9px] text-nomos-muted-bright">{relay}</li>)}
        </ul>
        <p className="mt-2 text-[9px] leading-relaxed text-nomos-muted">NIP-05 lookups contact the named domain. Event queries use these defaults and any relay hints. Relays may censor or withhold results.</p>
      </section>
    </div>
  )
}
