export type RejectionKind = 'script-failure' | 'missing-inputs' | 'node-rejection'

/** A node's rejection is a point-in-time observation, never chain confirmation. */
export interface RefusalProof {
  txid: string
  /** A signed raw transaction is publicly rebroadcastable. Treat it as sensitive. */
  rawTx: string
  /** Exact error returned in the Electrum JSON-RPC response. */
  nodeError: string
  rejectionKind: RejectionKind
  /** Kept explicit for older receipt consumers and straightforward UI checks. */
  scriptFailure: boolean
  network: string
  checkedAt: number
}

const STORAGE_KEY = 'nomos:local-refusal-proofs'
const MAX_SAVED_PROOFS = 12
const MAX_RAW_TX_CHARS = 200_000
const PROOFS_UPDATED_EVENT = 'nomos:proofs-updated'

/** Classify an Electrum rejection conservatively; only script checks are evidence of script failure. */
export function classifyNodeRejection(message: string): RejectionKind {
  const normalized = message.toLowerCase()
  if (/inputs-missingorspent|bad-txns-inputs-missingorspent|missing(?: or)? spent inputs|missing inputs|inputs? (?:(?:are|is) )?(?:missing|already spent|not found|do not exist|does not exist)|(?:missing|already spent|not found) inputs/.test(normalized)) {
    return 'missing-inputs'
  }
  if (/mandatory-script-verify-flag-failed|non-mandatory-script-verify-flag|script verification|script failed|script evaluated|script error|script_err|op_[a-z_]+/.test(normalized)) {
    return 'script-failure'
  }
  return 'node-rejection'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isRefusalProof(value: unknown): value is RefusalProof {
  if (!isRecord(value)) return false
  const kind = value.rejectionKind
  return typeof value.txid === 'string'
    && /^[0-9a-f]{64}$/i.test(value.txid)
    && typeof value.rawTx === 'string'
    && value.rawTx.length > 0
    && value.rawTx.length <= MAX_RAW_TX_CHARS
    && value.rawTx.length % 2 === 0
    && /^[0-9a-f]+$/i.test(value.rawTx)
    && typeof value.nodeError === 'string'
    && value.nodeError.length <= 10_000
    && (kind === 'script-failure' || kind === 'missing-inputs' || kind === 'node-rejection')
    && value.scriptFailure === (kind === 'script-failure')
    && typeof value.network === 'string'
    && Number.isFinite(value.checkedAt)
}

function publishUpdated(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(PROOFS_UPDATED_EVENT))
}

export function getLocalProofs(): RefusalProof[] {
  if (typeof window === 'undefined') return []
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isRefusalProof).slice(0, MAX_SAVED_PROOFS)
  } catch {
    return []
  }
}

/** Store recent node rejections in this browser only; never uploads proof data. */
export function saveLocalProof(proof: RefusalProof): void {
  if (typeof window === 'undefined' || !isRefusalProof(proof)) return
  const next = [proof, ...getLocalProofs().filter((saved) => saved.txid !== proof.txid)]
    .slice(0, MAX_SAVED_PROOFS)
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    publishUpdated()
  } catch {
    throw new Error('Node rejected the transaction, but this browser could not save the proof. Export or copy it now.')
  }
}

export function removeLocalProof(txid: string): void {
  if (typeof window === 'undefined') return
  try {
    const next = getLocalProofs().filter((proof) => proof.txid !== txid)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    publishUpdated()
  } catch { /* storage may be unavailable */ }
}

export function clearLocalProofs(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
    publishUpdated()
  } catch { /* storage may be unavailable */ }
}

export function localProofsUpdatedEvent(): string {
  return PROOFS_UPDATED_EVENT
}
