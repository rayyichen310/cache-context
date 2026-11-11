import type { Snapshot, Ttl } from '../../types'
import type { LangSource } from '../messages'
import type { Counts, Verdict } from './shared'

// The words a person reads for what the contract keeps as short codes.
const SOURCE_EN: Record<Snapshot['ttlSource'], string> = {
  env: 'environment',
  observed: 'observed',
  assumed: 'assumed',
}
const BY_EN: Record<Snapshot['touchedBy'], string> = { turn: 'message', ping: 'refresh', resume: 'resumed session' }
const VERDICT_EN: Record<Verdict, string> = { hit: 'hit', partial: 'partial hit', miss: 'miss' }

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

// Every word the mod shows. A new language is one more catalog of this shape.
// The vocabulary: a cache is active until it expires; a refresh restarts its lifetime; an expired cache is rebuilt.
export const en = {
  name: 'English',
  tag: 'en',
  fonts: '',

  bandCold: 'Expired',
  bandUnusable: 'Unavailable',
  bandWarmDetail: (size: string, cost: string) =>
    `${size} cached${cost && ` · ${cost} to rebuild if it expires`}`,
  bandAutoDetail: (size: string, used: number, budget: number) =>
    `${size} cached · auto-refresh ${used}/${budget}`,
  bandColdDetail: (size: string, cost: string) => `next message rebuilds ${size} tokens${cost && ` (≈${cost})`}`,

  cmdStatus: 'Show prompt cache status, time left and estimated rebuild cost',
  cmdPing: 'Refresh the prompt cache now',
  cmdAuto: 'View or change auto-refresh settings',
  cmdAutoHint: '[on|off] [max refreshes]',
  cmdLang: 'Set the display language',
  cmdLangHint: '[auto|code]',

  expiredAgo: (gap: string) => `expired ${gap} ago`,
  coldPing: 'the last refresh missed',
  coldModel: (model: string) => `model changed to ${model}`,

  pingNothing: 'Nothing is cached yet, so there is nothing to refresh.',
  pingBusy: 'A refresh is already in progress.',
  pingCold: (why: string, size: string) =>
    `Not sent: the cache is not active (${why}). A request now would rebuild all ${size} tokens at the cache-write price. Run /cache-ping force to send anyway.`,
  pingNoFork: 'Not sent: this conversation has no response yet.',
  pingApiError: (error: string, status: number | null) =>
    `Refresh failed: API error (${error}, status ${status ?? 'none'}). The countdown was not reset.`,
  pingCut: 'The refresh was interrupted before the API responded. The countdown was not reset.',
  counts: (c: Counts) => `read ${c.read}, wrote ${c.wrote}, ${c.input} in, ${c.output} out`,
  atListPrice: (usd: string) => ` ≈${usd} at list prices.`,
  pingHit: (counts: string, cost: string, ttl: Ttl) => `Cache refreshed: ${counts}.${cost} Countdown reset to ${ttl}.`,
  pingRewrote: (counts: string, cost: string) =>
    `Cache miss. The cache was rebuilt: ${counts}.${cost}`,
  pingMissed: (counts: string, cost: string) => `Cache miss: ${counts}.${cost} The cache was not extended.`,
  autoLog: (n: number, budget: number, text: string) => `Auto-refresh ${n}/${budget}. ${text}`,
  autoMissToast: 'Auto-refresh did not succeed. See /cache-status',
  idlePaused: 'Idle compaction is off while auto-refresh is on, so a long conversation is not compacted before its refresh. It comes back on when auto-refresh is turned off.',
  idleRestored: 'Idle compaction is back on.',

  reportNothing: 'Prompt cache: nothing cached yet. The countdown starts after the next response.',
  reportWarm: (left: string) => `Prompt cache: active, ${left} left.`,
  reportCold: (why: string) => `Prompt cache: not active (${why}).`,
  reportTtl: (ttl: Ttl, source: Snapshot['ttlSource']) => `  Lifetime: ${ttl} (${SOURCE_EN[source]})`,
  reportCached: (size: string, model: string, by: Snapshot['touchedBy'], since: string) =>
    `  Cached: ${size} tokens on ${model}, last used ${since} ago (${BY_EN[by]})`,
  reportNoPrice: '  Cost: pricing unavailable for this model',
  reportLapse: (lapse: string, rewrite: string) =>
    `  If it expires: ${rewrite} to rebuild, ${lapse} more than a cache hit`,
  reportPing: (ping: string, isMeasured: boolean, max: number) =>
    `  One refresh: about ${ping} (token overhead ${isMeasured ? 'measured' : 'estimated'}). Up to ${max} in a row cost less than one rebuild`,
  reportPingNone: (ping: string, isMeasured: boolean) =>
    `  One refresh: about ${ping} (token overhead ${isMeasured ? 'measured' : 'estimated'}). That is more than an expiry would add, so refreshing does not pay off`,
  reportRule: (ttl: Ttl, percent: string) =>
    `  Rule of thumb: refreshing pays off if you are more than ${percent}% likely to return within ${ttl}`,
  reportLastPing: (ago: string, counts: string) => `  Last refresh: ${ago} ago, ${counts}`,
  reportTouches: 'Recent cache activity:',
  reportTouch: (
    kind: 'turn' | 'ping',
    gap: string,
    prevBy: Snapshot['touchedBy'],
    ttl: Ttl,
    verdict: Verdict,
    read: string,
    cached: string,
  ) => `  ${capitalize(BY_EN[kind])}, ${gap} after a ${BY_EN[prevBy]} (${ttl}): ${VERDICT_EN[verdict]}, read ${read} of ${cached}`,
  reportFooter: 'Costs are estimates at API list prices. On a subscription they reflect plan usage, not charges.',

  autoHeader: 'Auto-refresh:',
  autoOff: '  Auto-refresh: off (run /cache-auto on to keep the cache active while you are away)',
  autoWaiting: (cap: number) => `  Auto-refresh: on, up to ${cap} per idle period. Waiting for the first response`,
  autoOn: (used: number, budget: number, cap: number, next: string) =>
    `  Auto-refresh: on, ${used} of ${budget} used since your last message (limit ${cap}). Next: ${next}`,
  autoOnNone: (cap: number) =>
    `  Auto-refresh: on (limit ${cap}), but not sending: a refresh would cost more than an expiry adds for this cache`,
  nextCold: 'none, the cache is not active',
  nextSpent: 'none, the limit for this idle period is used up',
  nextIn: (time: string) => `in ${time}`,
  nextNow: 'any moment now',
  autoPings: (state: string) => `  Effect: ${state}`,
  extendsYes: (ttl: Ttl) => `confirmed, a refresh restores the full ${ttl}`,
  extendsNo: 'not confirmed. The last refresh was followed by a miss, so auto-refresh sends only one per idle period',
  extendsUnknown: (ttl: Ttl) =>
    `not confirmed yet. Auto-refresh sends one per idle period until a refresh is seen to restore the full ${ttl}`,
  autoNote:
    '  Note: refreshes are sent only while this app is running and your computer is awake, and each one counts toward your plan usage or API credit',
  autoUsage: (max: number) => `Usage: /cache-auto [on|off] [max refreshes per idle period, 1-${max}]`,

  details: 'Details ›',
  cmdPanel: 'Open the prompt cache panel',
  paneTitle: 'Prompt cache',
  paneNothing: 'Nothing cached yet. The countdown starts after the next response.',
  heroLeft: (size: string) => `left · ${size} tokens cached`,
  heroAuto: (time: string, span: string) => `${time ? `refreshes in ${time}` : 'refreshing soon'} · up to ~${span}`,
  heroCold: (size: string, cost: string) => `${size} tokens to rebuild${cost && ` (≈${cost})`}`,
  heroPinging: 'Refreshing…',
  rowLapse: 'If it expires',
  rowPing: 'One refresh',
  breakEven: (max: number) => `${max} refreshes ≈ 1 rebuild`,
  breakEvenNone: 'Refreshing costs more than rebuilding here',
  breakEvenRule: (max: number, percent: string) =>
    `${max} refreshes ≈ 1 rebuild · worth it if you are ${percent}%+ likely to return`,
  noPrice: 'Pricing unavailable for this model',
  autoTitle: 'Auto-refresh while away',
  btnOn: 'Turn on',
  btnOff: 'Turn off',
  autoPlanOff: (left: number, span: string) =>
    `Up to ${left} ${left === 1 ? 'refresh' : 'refreshes'}${span && ` · ~${span}`}`,
  autoPlanOn: (used: number, budget: number) => `${used}/${budget} used`,
  autoTrialOff: (cap: number) => `1 trial, up to ${cap} if it works`,
  autoTrialOn: (used: number, cap: number) => `Trial ${used}/1, up to ${cap} if it works`,
  autoSpent: 'None left until next message',
  autoNotWorth: 'Not worth it for this cache',
  historyAll: (n: number) => (n === 1 ? 'Last request hit' : `Last ${n} all hit`),
  historySome: (n: number, misses: number) => `${misses} of last ${n} missed`,
  historyEmpty: 'No history yet',
  btnPing: 'Refresh now',
  listPrice: 'Estimates at API list prices',
  priceNote: (cap: string) => `Est. max ${cap} · API list prices`,

  langNow: (name: string, source: LangSource) =>
    `Language: ${name} (${{ pinned: 'manual', conversation: 'matches the conversation', locale: 'matches your system', default: 'default' }[source]}).`,
  langUsage: (codes: string) => `Usage: /cache-lang [auto|code]. Codes: ${codes}`,
}

export type Messages = typeof en
