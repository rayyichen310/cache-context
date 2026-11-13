import type { Auto, Snapshot, Ttl } from '../types'
import { DEFAULT_PING_OVERHEAD, TTL_MS, economics, fmtGap, fmtRemaining, priceOf } from './economics'
import type { Messages } from './messages'

// A prefix below the smallest cacheable size is not worth tracking.
export const MIN_TRACKED = 1024
// Share of the cached prefix a request must read to count as a hit, and below which it is a miss.
export const HIT = 0.9
const MISS = 0.5

// How long before expiry an auto ping goes out: as late as is safe, so each one buys the most time.
export const LEAD_MS: Record<Ttl, number> = { '5m': 30_000, '1h': 5 * 60_000 }

// Why a cache is cold whatever the clock says, as the snapshot keeps it: a code, never words.
export const COLD_PING = 'ping-miss'
export const COLD_MODEL = 'model:'

export type Verdict = 'hit' | 'partial' | 'miss'

/** One touch of the cache after a gap: what was expected and what the API served. */
export type Observation = {
  at: number
  kind: 'turn' | 'ping'
  gapMs: number
  prevBy: Snapshot['touchedBy']
  ttl: Ttl
  cachedBefore: number
  read: number
  created: number
  input: number
  output: number
  model: string
  verdict: Verdict
}

/** Whether a ping has been seen to restart an entry's full lifetime, per TTL. */
export type Extension = Partial<Record<Ttl, boolean>>

/** Everything a drawing or a report of the cache is made from. */
export type View = {
  held: Snapshot | null
  now: number
  policy: Auto
  known: Extension
  observations: readonly Observation[]
}

export function isTracked(held: Snapshot | null): held is Snapshot {
  return held !== null && held.cachedTokens >= MIN_TRACKED
}

export function verdictOf(served: number, cachedBefore: number): Verdict {
  if (served >= cachedBefore * HIT) return 'hit'

  return served < cachedBefore * MISS ? 'miss' : 'partial'
}

export function overheadOf(held: Snapshot): { input: number; output: number } {
  return held.lastPing ?? DEFAULT_PING_OVERHEAD
}

export function remainingOf(held: Snapshot, now: number): number {
  return held.coldReason === null ? held.touchedAt + TTL_MS[held.ttl] - now : 0
}

export function costsOf(held: Snapshot) {
  const price = priceOf(held.model)

  return price ? economics(price, held.ttl, held.cachedTokens, overheadOf(held)) : null
}

export function coldWords(m: Messages, held: Snapshot, now: number): string {
  const reason = held.coldReason
  if (reason === null) return m.expiredAgo(fmtGap(now - held.touchedAt - TTL_MS[held.ttl]))
  if (reason === COLD_PING) return m.coldPing

  return reason.startsWith(COLD_MODEL) ? m.coldModel(reason.slice(COLD_MODEL.length)) : reason
}

/**
 * What a touch after a ping says about pings: true when it hit although the
 * conversation's own last request was too long ago to explain it.
 */
export function extensionEvidence(previous: Snapshot, startedAt: number, verdict: Verdict): boolean | undefined {
  if (previous.touchedBy !== 'ping') return undefined
  const lifetime = TTL_MS[previous.ttl]
  const isPastTurn = startedAt - previous.turnAt > lifetime + 30_000
  const isWithinPing = startedAt - previous.touchedAt < lifetime
  if (!isPastTurn || !isWithinPing || verdict === 'partial') return undefined

  return verdict === 'hit'
}

/**
 * The TTL Claude Code applies, as a resume gives it away: a cache it still
 * calls warm past five minutes lives an hour. A lapsed verdict names no TTL,
 * as Claude Code also gives it when nothing was cached since a compaction.
 */
export function resumedTtl(gapMs: number, isLikelyExpired: boolean | undefined): Ttl | undefined {
  const isBetween = gapMs > TTL_MS['5m'] + 30_000 && gapMs < TTL_MS['1h'] - 30_000

  return isLikelyExpired === false && isBetween ? '1h' : undefined
}

/** The pings one idle stretch may spend: the person's cap, never past break-even, one until pings are proven. */
export function budgetOf(held: Snapshot, cap: number, known: Extension): number {
  const costs = costsOf(held)
  const limit = costs ? Math.min(cap, costs.maxPings) : cap

  return known[held.ttl] === true ? limit : Math.min(1, limit)
}

/** When the next auto ping goes out, in the catalog's words. */
export function nextPingWords(m: Messages, held: Snapshot, budget: number, now: number): string {
  const remaining = remainingOf(held, now)
  if (remaining <= 0) return m.nextCold
  if (budget - held.pingsSinceTurn <= 0) return m.nextSpent
  const due = remaining - LEAD_MS[held.ttl]

  return due > 0 ? m.nextIn(fmtRemaining(due)) : m.nextNow
}

export function extensionWords(m: Messages, ttl: Ttl, known: Extension): string {
  if (known[ttl] === true) return m.extendsYes(ttl)

  return known[ttl] === false ? m.extendsNo : m.extendsUnknown(ttl)
}
