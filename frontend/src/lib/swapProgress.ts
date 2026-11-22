/**
 * Small, pure helpers for the swap tracker on the Bridge page. They have no
 * imports so the tests can run them in Node.
 */

/**
 * The Bitcoin Cash transaction ID in what someone pasted: the bare ID or an
 * explorer link that contains it. A Base hash (0x…) is not one, and neither
 * is a longer run of hex such as a raw transaction.
 */
export function txidFrom(text: string): string | null {
  const match = /(?:^|[^0-9a-fx])([0-9a-f]{64})(?![0-9a-f])/i.exec(text.trim())
  return match ? match[1].toLowerCase() : null
}

/**
 * Whether a Base lock was claimed. The contract marks a lock done when it is
 * claimed or refunded, but it refuses refunds before refundAfter and claims
 * from then on, so a lock done before refundAfter was claimed. After that
 * only other evidence (our own claim, or the Claimed event) can tell.
 */
export function baseLockClaimed(
  lock: { done: boolean; refundAfter: number } | null | undefined,
  nowS: number,
  claimSeen: boolean,
): boolean {
  if (!lock?.done) return false
  return nowS < lock.refundAfter || claimSeen
}

/**
 * Tick every step before a finished one. Claiming a lock empties it, so the
 * chain stops showing the lock once the swap moves on; without this the lock
 * step would lose its tick and offer to lock again. A step with a warning
 * keeps it.
 */
export function tickEarlierSteps<T extends { done: boolean; warn?: boolean }>(steps: T[]): T[] {
  let laterDone = false
  for (let i = steps.length - 1; i >= 0; i--) {
    if (laterDone && !steps[i].warn) steps[i].done = true
    laterDone = laterDone || steps[i].done
  }
  return steps
}
