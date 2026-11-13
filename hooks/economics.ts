import type { Ttl } from '../types'

export const TTL_MS: Record<Ttl, number> = { '5m': 5 * 60_000, '1h': 60 * 60_000 }

// Cache writes cost this multiple of the base input price.
export const WRITE_MULTIPLIER: Record<Ttl, number> = { '5m': 1.25, '1h': 2 }

// A ping sent this close to expiry may start after the entry lapsed.
export const PING_MARGIN_MS = 5_000

// What a ping is assumed to add on top of the cache read until one has been measured.
export const DEFAULT_PING_OVERHEAD = { input: 40, output: 60 }

/** List prices in USD per million tokens; `read` is the cache-read multiplier on `input`. */
export type Price = { input: number; output: number; read: number }

// platform.claude.com/docs/en/about-claude/pricing, read 2026-10-03. First match wins.
const PRICES: readonly (readonly [RegExp, Price])[] = [
  [/(fable|mythos)-5-1/, { input: 10, output: 50, read: 0.025 }],
  [/(fable|mythos)-5/, { input: 10, output: 50, read: 0.1 }],
  [/opus-5-5/, { input: 4, output: 20, read: 0.05 }],
  [/opus-5/, { input: 5, output: 25, read: 0.1 }],
  [/opus-4-[5-8]/, { input: 5, output: 25, read: 0.1 }],
  [/opus-4/, { input: 15, output: 75, read: 0.1 }],
  [/sonnet-5/, { input: 2, output: 10, read: 0.1 }],
  [/sonnet-4/, { input: 3, output: 15, read: 0.1 }],
  [/haiku-4-5/, { input: 1, output: 5, read: 0.1 }],
  [/haiku-3-5/, { input: 0.8, output: 4, read: 0.1 }],
]

export function priceOf(model: string): Price | null {
  for (const [pattern, price] of PRICES) {
    if (pattern.test(model)) return price
  }

  return null
}

export type Economics = {
  /** One keep-alive: the cache read, the last reply it writes again, and the ping's own tokens. */
  pingUsd: number
  /** Re-writing the whole prefix after a lapse. */
  rewriteUsd: number
  /** What a lapse costs over a hit: the rewrite less the read it replaces. */
  lapseUsd: number
  /** The most pings that still cost less than one lapse. */
  maxPings: number
  /** Keep pinging while the chance of a return within the next window is above this. */
  hazardThreshold: number
}

export function economics(
  price: Price,
  ttl: Ttl,
  cachedTokens: number,
  overhead: { input: number; output: number; written?: number } = DEFAULT_PING_OVERHEAD,
): Economics {
  const perToken = price.input / 1e6
  const readUsd = cachedTokens * perToken * price.read
  const rewriteUsd = cachedTokens * perToken * WRITE_MULTIPLIER[ttl]
  // The written tokens are priced at this cache's write rate, as a ping's own report prices them.
  const writtenUsd = (overhead.written ?? 0) * perToken * WRITE_MULTIPLIER[ttl]
  const pingUsd = readUsd + writtenUsd + overhead.input * perToken + (overhead.output * price.output) / 1e6
  const lapseUsd = rewriteUsd - readUsd
  const ratio = pingUsd > 0 ? lapseUsd / pingUsd : 0

  return {
    pingUsd,
    rewriteUsd,
    lapseUsd,
    // The largest n with n * pingUsd strictly under lapseUsd.
    maxPings: Math.max(0, Math.ceil(ratio - 1e-9) - 1),
    hazardThreshold: lapseUsd > 0 ? pingUsd / lapseUsd : 1,
  }
}

export function fmtTokens(tokens: number): string {
  if (tokens >= 1e6) return `${(tokens / 1e6).toFixed(2)}M`
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}k`

  return String(tokens)
}

export function fmtUsd(usd: number): string {
  if (usd >= 1) return `$${usd.toFixed(2)}`
  if (usd >= 0.01) return `$${usd.toFixed(3)}`

  return `$${usd.toFixed(4)}`
}

/** The countdown as drawn: minutes far out, five-second steps closer in, seconds in the last minute. */
export function fmtRemaining(ms: number): string {
  if (ms <= 0) return 'expired'
  const seconds = Math.ceil(ms / 1000)
  if (seconds >= 600) return `${Math.ceil(seconds / 60)}m`
  if (seconds >= 60) {
    const stepped = Math.ceil(seconds / 5) * 5

    return `${Math.floor(stepped / 60)}:${String(stepped % 60).padStart(2, '0')}`
  }

  return `${seconds}s`
}

export function fmtGap(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 90) return `${seconds}s`
  if (seconds < 5400) return `${(seconds / 60).toFixed(1)}m`

  return `${(seconds / 3600).toFixed(1)}h`
}

/** A stretch of time for a sentence: whole minutes under an hour, then hours. */
export function fmtSpan(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes}m`
  const hours = minutes / 60

  return hours < 10 ? `${hours.toFixed(1)}h` : `${Math.round(hours)}h`
}
