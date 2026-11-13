import type { SessionRateLimit } from 'claude-code'

import type { Guard, GuardRun } from '../types'

// The plan's own windows; a gateway's spend limit is not one a reset brings back.
const PLAN_WINDOWS = ['five_hour', 'seven_day']

export const DEFAULT_GUARD: Guard = { isOn: false, threshold: 97, autoContinue: true }
export const MIN_THRESHOLD = 50
export const MAX_THRESHOLD = 99
// Past this the guard refuses tools whatever is left of the grace.
export const HARD_PERCENT = 99
// Tools Claude may still use once asked to wrap up, and refused calls before the turn is ended for it.
export const GRACE_TOOLS = 8
export const ABORT_AFTER_DENIED = 3
// The automatic continue goes out this long after the reset; a refused one is tried again after the first wait, then the next.
export const RESUME_DELAY_MS = 30_000
export const RESUME_RETRY_FIRST_MS = 5_000
export const RESUME_RETRY_MS = 60_000
export const MAX_RESUME_RETRIES = 5

export const IDLE_RUN: GuardRun = {
  phase: 'watching',
  percent: null,
  resetsAt: null,
  isWeekly: false,
  toolsUsed: 0,
  denied: 0,
  skipUntil: 0,
  resumeAt: null,
  resumeTries: 0,
  isResuming: false,
  limit: null,
}

// What the model reads after each tool result while wrapping up; the person never sees it.
export const WRAP_UP_REMINDER =
  'The five-hour usage limit is nearly reached, and this session will pause until it resets. Finish only the small step in hand, write down the progress so far and the next step, then end your turn. Do not start new work.'

/** The words of the usage-limit lines and the usage guard; English where a language has none of its own. */
export type LimitWords = {
  heldUntil: (time: string) => string
  heldNoReset: string
  title: string
  btnOn: string
  btnOff: string
  fiveHour: string
  resets: (time: string) => string
  threshold: string
  autoContinue: string
  wrapping: string
  wrappingLeft: (tools: number) => string
  blocking: string
  btnStop: string
  btnSkip: string
  pausedAuto: (time: string, left: string) => string
  pausedManual: (time: string) => string
  pausedWeekly: string
  pausedNoReset: string
  cacheKept: (refreshes: number) => string
  cacheLost: (expiry: string) => string
  resumeFailed: string
  btnResume: string
  btnCancelResume: string
  limitResume: (time: string) => string
  limitRebuild: (expiry: string) => string
  quickRefresh: string
  quickRefreshHeld: (time: string) => string
  quickGuard: string
  quickWrapping: (percent: string) => string
  quickContinues: (time: string) => string
  quickPaused: string
  denied: string
  resumePrompt: string
  cmdGuard: string
  cmdGuardHint: string
  guardUsage: (min: number, max: number) => string
  guardState: (isOn: boolean, threshold: number, autoContinue: boolean) => string
  guardUsed: (percent: number) => string
}

const EN: LimitWords = {
  heldUntil: time => `Auto-refresh paused: usage limit reached. It resumes after the reset at ${time}.`,
  heldNoReset: 'Auto-refresh paused: usage limit reached and no reset time was given. It resumes after the next reply.',
  title: 'Usage guard',
  btnOn: 'Turn on',
  btnOff: 'Turn off',
  fiveHour: '5-hour',
  resets: time => `resets ${time}`,
  threshold: 'Wrap up at',
  autoContinue: 'Continue after the reset',
  wrapping: 'Wrapping up: Claude was asked to save its progress and stop',
  wrappingLeft: tools => `${tools} more tool uses, then stopped (or at 99%)`,
  blocking: 'Wrapping up: tools are refused until Claude writes down its progress',
  btnStop: 'Stop now',
  btnSkip: 'Not this time',
  pausedAuto: (time, left) => `Paused · continues at ${time} (in ${left})`,
  pausedManual: time => `Paused · usage resets at ${time}; continue by hand`,
  pausedWeekly: 'Paused · the 7-day usage is used up; no automatic continue',
  pausedNoReset: 'Paused · no reset time given; continue by hand',
  cacheKept: refreshes => `The cache is refreshed until the reset, about ${refreshes} more ${refreshes === 1 ? 'time' : 'times'}`,
  cacheLost: expiry => `The cache expires at ${expiry}, before the reset, and is rebuilt after it`,
  resumeFailed: 'The automatic continue failed; continue by hand',
  btnResume: 'Continue now',
  btnCancelResume: 'Cancel continue',
  limitResume: time => `Usage limit reached · refreshing resumes after the reset at ${time}`,
  limitRebuild: expiry => `Usage limit reached · the cache expires at ${expiry} and is rebuilt after the reset`,
  quickRefresh: 'Refresh',
  quickRefreshHeld: time => `Refresh ${time}`,
  quickGuard: 'Guard',
  quickWrapping: percent => `Guard · wrapping up ${percent}%`,
  quickContinues: time => `Guard · continues ${time}`,
  quickPaused: 'Guard · paused',
  denied: 'The five-hour usage limit is nearly reached, so tools are paused. Write down the progress so far and the next step, then end your turn.',
  resumePrompt: 'The five-hour usage limit has reset. Continue from where you paused.',
  cmdGuard: 'Turn the usage guard on or off, or set the five-hour usage at which Claude wraps up',
  cmdGuardHint: '[on|off] [threshold %]',
  guardUsage: (min, max) => `Usage: /cache-guard [on|off] [${min}-${max}]. A threshold alone turns the guard on.`,
  guardState: (isOn, threshold, autoContinue) =>
    `Usage guard: ${isOn ? 'on' : 'off'} · wraps up at ${threshold}% of the 5-hour usage · continue after the reset: ${autoContinue ? 'on' : 'off'}`,
  guardUsed: percent => `5-hour usage now: ${percent}%`,
}

const ZH_HANT: LimitWords = {
  heldUntil: time => `自動續期暫停：已達用量上限，${time} 重置後恢復。`,
  heldNoReset: '自動續期暫停：已達用量上限，讀不到重置時間，下次回覆後恢復。',
  title: '用量保護',
  btnOn: '開啟',
  btnOff: '關閉',
  fiveHour: '五小時',
  resets: time => `${time} 重置`,
  threshold: '到這個用量時收尾',
  autoContinue: '重置後自動繼續',
  wrapping: '收尾中：已提醒 Claude 存好進度後停下',
  wrappingLeft: tools => `還能用 ${tools} 次工具，用完或到 99% 就強制停止`,
  blocking: '收尾中：已擋下工具，等 Claude 寫下進度後停止',
  btnStop: '立即停止',
  btnSkip: '這次不暫停',
  pausedAuto: (time, left) => `已暫停 · ${time} 自動繼續（還有 ${left}）`,
  pausedManual: time => `已暫停 · ${time} 額度重置，需要手動繼續`,
  pausedWeekly: '已暫停 · 七天用量已滿，不會自動繼續',
  pausedNoReset: '已暫停 · 讀不到重置時間，需要手動繼續',
  cacheKept: refreshes => `快取會續期到重置後，預計再續 ${refreshes} 次`,
  cacheLost: expiry => `快取 ${expiry} 過期，撐不到重置，重置後重建`,
  resumeFailed: '自動繼續失敗，請手動繼續',
  btnResume: '立即繼續',
  btnCancelResume: '取消自動繼續',
  limitResume: time => `已達上限 · ${time} 重置後恢復續期`,
  limitRebuild: expiry => `已達上限 · 快取 ${expiry} 過期，重置後重建`,
  quickRefresh: '續期',
  quickRefreshHeld: time => `續期 ${time}`,
  quickGuard: '保護',
  quickWrapping: percent => `保護 · 收尾中 ${percent}%`,
  quickContinues: time => `保護 · ${time} 繼續`,
  quickPaused: '保護 · 已暫停',
  denied: '五小時用量快滿，工具已暫停使用。請直接寫下目前進度和下一步，然後結束這一輪。',
  resumePrompt: '五小時用量已重置。請從暫停前的進度繼續。',
  cmdGuard: '開關用量保護，或設定五小時用量到多少時收尾',
  cmdGuardHint: '[on|off] [門檻 %]',
  guardUsage: (min, max) => `用法：/cache-guard [on|off] [${min}-${max}]。只給門檻會同時開啟保護。`,
  guardState: (isOn, threshold, autoContinue) =>
    `用量保護：${isOn ? '開啟' : '關閉'} · 五小時用量到 ${threshold}% 時收尾 · 重置後自動繼續：${autoContinue ? '開' : '關'}`,
  guardUsed: percent => `目前五小時用量：${percent}%`,
}

export function limitWords(tag: string): LimitWords {
  return tag === 'zh-Hant' ? ZH_HANT : EN
}

function planWindows(limits: readonly SessionRateLimit[]): SessionRateLimit[] {
  return limits.filter(one => PLAN_WINDOWS.includes(one.kind))
}

function resetOf(one: SessionRateLimit): number | null {
  const at = one.resetsAt === undefined ? NaN : Date.parse(one.resetsAt)

  return Number.isNaN(at) ? null : at
}

/** Whether a plan window is used up, so a request now would only be refused. */
export function isPastLimit(limits: readonly SessionRateLimit[]): boolean {
  return planWindows(limits).some(one => one.percentUsed >= 100)
}

/** Whether the seven-day window is used up: a five-hour reset brings nothing back then. */
export function isWeeklyFull(limits: readonly SessionRateLimit[]): boolean {
  return limits.some(one => one.kind === 'seven_day' && one.percentUsed >= 100)
}

/** The five-hour window: its use in percent and its reset; null off a subscription or before the first reading. */
export function fiveHourOf(limits: readonly SessionRateLimit[]): { percent: number; resetsAt: number | null } | null {
  const one = limits.find(each => each.kind === 'five_hour')

  return one === undefined ? null : { percent: one.percentUsed, resetsAt: resetOf(one) }
}

/**
 * When the window holding requests back resets, in ms since the epoch: the latest of those used up, or,
 * with none reading as used up, the most used one. Null when that window gives no reset time.
 */
export function blockingReset(limits: readonly SessionRateLimit[]): number | null {
  const plan = planWindows(limits)
  const used = plan.filter(one => one.percentUsed >= 100)
  const most = [...plan].sort((a, b) => b.percentUsed - a.percentUsed)[0]
  const holding = used.length > 0 ? used : most === undefined ? [] : [most]
  const resets = holding.map(resetOf)
  if (resets.length === 0 || resets.some(at => at === null)) return null

  return Math.max(...(resets as number[]))
}

/** The guard settings the store kept, or the defaults where it kept none or one of the wrong shape. */
export function keptGuard(held: unknown): Guard {
  if (typeof held !== 'object' || held === null) return DEFAULT_GUARD
  const { isOn, threshold, autoContinue } = held as Record<string, unknown>
  const isThreshold =
    typeof threshold === 'number' && Number.isInteger(threshold) && threshold >= MIN_THRESHOLD && threshold <= MAX_THRESHOLD
  if (typeof isOn !== 'boolean' || !isThreshold) return DEFAULT_GUARD

  // Kept before the switch existed it is absent, and takes the default.
  return { isOn, threshold, autoContinue: typeof autoContinue === 'boolean' ? autoContinue : DEFAULT_GUARD.autoContinue }
}

/** The wait before the n-th retry of a refused continue (1-based). */
export function resumeRetryMs(tries: number): number {
  return tries <= 1 ? RESUME_RETRY_FIRST_MS : RESUME_RETRY_MS
}

/** Refreshes needed to carry a cache that ends at `end` past a reset, each adding one refresh interval. */
export function refreshesUntil(reset: number, end: number, intervalMs: number): number {
  return Math.max(0, Math.ceil((reset - end) / intervalMs))
}

/** A moment as the local time of day, hours and minutes. */
export function fmtClock(ms: number): string {
  const at = new Date(ms)

  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
}

/** A wait as hours, minutes and seconds: 1:12:05, or 12:05 under an hour. */
export function fmtWait(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0')

  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`
}
