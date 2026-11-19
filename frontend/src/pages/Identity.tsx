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
    <div className="page-enter space-y-6">
      <header>
        <Link to="/" className="text-xs text-nomos-muted transition-colors hover:text-nomos-accent">
          ← Home
        </Link>
        <h1 className="mt-3 font-mono text-2xl font-bold text-nomos-text">Nostr Identity</h1>
        <p className="mt-2 text-sm leading-relaxed text-nomos-muted">
          Look up the BCH address a Nostr identity published. No Nomos server is
          involved: your browser queries NIP-05 domains when needed and public
          Nostr relays directly.
        </p>
      </header>

      <section className="card p-5" aria-labelledby="identity-how-it-works">
        <h2 id="identity-how-it-works" className="label mb-3">How it works</h2>
        <ol className="space-y-3 text-xs leading-relaxed text-nomos-muted-bright">
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-nomos-accent/15 text-[10px] font-bold text-nomos-accent" aria-hidden="true">1</span>
            <span>Enter an <strong className="text-nomos-text">npub</strong>, <strong className="text-nomos-text">nprofile</strong>, or <strong className="text-nomos-text">name@domain</strong> NIP-05 identifier.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-nomos-accent/15 text-[10px] font-bold text-nomos-accent" aria-hidden="true">2</span>
            <span>The browser looks for a signed BCH-address event (kind 30078, Paytaca format) on the listed relays.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-nomos-accent/15 text-[10px] font-bold text-nomos-accent" aria-hidden="true">3</span>
            <span>The event signature is checked locally and the address is validated for the configured BCH network. Relays can still withhold or serve stale events.</span>
          </li>
        </ol>
      </section>

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          void handleLookup()
        }}
      >
        <label htmlFor="nostr-identity" className="label mb-2 block">Nostr identity</label>
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
        <p id="identity-hint" className="text-[10px] text-nomos-muted" aria-live="polite">
          {!query.trim()
            ? 'Enter an npub, nprofile, or NIP-05 name.'
            : looksLikeIdentity
              ? 'This looks like a Nostr identity.'
              : 'Enter an npub, nprofile, or NIP-05 name.'}
        </p>
        <button
          type="submit"
          disabled={!query.trim() || !looksLikeIdentity || loading}
          className="btn-primary w-full"
        >
          {loading ? <><span className="spinner mr-2" /> Resolving…</> : 'Look up'}
        </button>
      </form>

      {error && (
        <div className="card border-nomos-refuse/20 bg-nomos-refuse/5 p-5 text-center" role="alert" style={{ borderWidth: '1px', borderStyle: 'solid' }}>
          <p className="text-sm font-medium text-nomos-refuse">{error}</p>
          <p className="mt-2 text-[10px] text-nomos-muted">
            The person may not have published an address, or the relays may be unavailable.
          </p>
        </div>
      )}

      {result && (
        <section className="card border-nomos-accent/20 p-5" aria-labelledby="identity-result-title" aria-live="polite" style={{ borderWidth: '1px', borderStyle: 'solid' }}>
          <div className="flex items-start gap-4">
            {result.picture && (
              <img
                src={result.picture}
                alt=""
                referrerPolicy="no-referrer"
                className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-nomos-accent/20"
              />
            )}
            <div className="min-w-0 flex-1">
              <h2 id="identity-result-title" className="text-lg font-semibold text-nomos-text">
                {result.displayName || payeeLabel(result)}
              </h2>
              {result.nip05 && <p className="text-xs text-nomos-accent">{result.nip05}</p>}
              <p className="mt-1 truncate font-mono text-[10px] text-nomos-muted">{result.npub}</p>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-nomos-surface-raised/60 p-4">
            <p className="label mb-1">Published BCH address</p>
            <p className="break-all font-mono text-xs text-nomos-text">{result.address}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-nomos-muted">
              <span className="text-nomos-accent">✓ Signature verified</span>
              <span aria-hidden="true">·</span>
              <span>Event published {new Date(result.publishedAt * 1000).toLocaleDateString()}</span>
            </div>
          </div>

          <p className="mt-4 text-center text-xs leading-relaxed text-nomos-muted">
            This is the latest valid address event found on the queried relays; it
            may not be the latest event published anywhere. Verify the destination
            before sending. Pay resolves Nostr names too, and the covenant still
            enforces the configured spending rules.
          </p>
        </section>
      )}

      <section className="card p-4" aria-labelledby="identity-relays-title">
        <h2 id="identity-relays-title" className="label mb-2">Default public relays</h2>
        <ul className="space-y-1">
          {DEFAULT_RELAYS.map((relay) => (
            <li key={relay} className="font-mono text-[10px] text-nomos-muted-bright">{relay}</li>
          ))}
        </ul>
        <p className="mt-2 text-[10px] leading-relaxed text-nomos-muted">
          NIP-05 lookups contact the named domain. Event queries use these
          defaults and may include relay hints supplied by the identity. No Nomos
          backend is involved; relays may censor or withhold results.
        </p>
      </section>
    </div>
  )
}
