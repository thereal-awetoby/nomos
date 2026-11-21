import { useEffect, useRef, useState } from 'react'
import {
  DEFAULT_RELAYS,
  isNostrIdentifier,
  payeeLabel,
  resolveNostrPayee,
} from '../lib/nostr'
import type { NostrPayee } from '../lib/nostr'
import { validateCashAddress, verifyAnchor } from '../lib/contract'
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
      const payee = await resolveNostrPayee(input, validateCashAddress, verifyAnchor)
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
    <div className="page-enter space-y-4">
      <h1 className="page-title">Nostr identity</h1>
      <p className="text-sm text-nomos-muted">
        Link your BCH address to your Nostr key, or check someone else's link. Everything is checked in your browser against relays and a BCH node.
      </p>

      <IdentityLink />

      <form
        className="card space-y-3 p-4"
        onSubmit={(event) => {
          event.preventDefault()
          void handleLookup()
        }}
      >
        <label htmlFor="nostr-identity" className="block text-[15px] font-semibold text-nomos-text">Look up a published address</label>
        <div className="flex gap-2">
          <input
            id="nostr-identity"
            name="nostr-identity"
            type="text"
            value={query}
            onChange={(event) => updateQuery(event.target.value)}
            placeholder="npub or name@domain"
            className="input"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" disabled={!query.trim() || !looksLikeIdentity || loading} className="btn-ghost shrink-0">
            {loading ? <span className="spinner" /> : 'Look up'}
          </button>
        </div>

        {error && <p className="text-sm text-nomos-refuse" role="alert">{error}</p>}

        {result && (
          <div className="border-t hairline pt-3" aria-live="polite">
            <div className="flex items-center gap-3">
              {result.picture && <img src={result.picture} alt="" referrerPolicy="no-referrer" className="h-9 w-9 shrink-0 rounded-full object-cover" />}
              <div className="min-w-0">
                <p className="truncate text-[15px] font-medium text-nomos-text">{result.displayName || payeeLabel(result)}</p>
                <p className="truncate font-mono text-xs text-nomos-muted">{result.nip05 || result.npub}</p>
              </div>
            </div>
            <p className="mt-3 break-all font-mono text-sm text-nomos-text">{result.address}</p>
            <p className="mt-1 text-xs text-nomos-muted">
              {result.link ? 'Linked by both keys' : 'Signed by the Nostr key only'} · {new Date(result.publishedAt * 1000).toLocaleDateString()}
            </p>
          </div>
        )}
      </form>

      <details className="px-1 text-sm text-nomos-muted">
        <summary className="cursor-pointer">Relays used</summary>
        <ul className="mt-2 space-y-1">
          {DEFAULT_RELAYS.map((relay) => <li key={relay} className="break-all font-mono text-xs">{relay}</li>)}
        </ul>
      </details>
    </div>
  )
}
