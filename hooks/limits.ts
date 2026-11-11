import type { SessionRateLimit } from 'claude-code'

// The plan's own windows; a gateway's spend limit is not one a reset brings back.
const PLAN_WINDOWS = ['five_hour', 'seven_day']

/** The words of the usage-limit lines; English where a language has none of its own. */
export type LimitWords = {
  heldUntil: (time: string) => string
  heldNoReset: string
}

const EN: LimitWords = {
  heldUntil: time => `Auto-refresh paused: usage limit reached. It resumes after the reset at ${time}.`,
  heldNoReset: 'Auto-refresh paused: usage limit reached and no reset time was given. It resumes after the next reply.',
}

const ZH_HANT: LimitWords = {
  heldUntil: time => `自動續期暫停：已達用量上限，${time} 重置後恢復。`,
  heldNoReset: '自動續期暫停：已達用量上限，讀不到重置時間，下次回覆後恢復。',
}

export function limitWords(tag: string): LimitWords {
  return tag === 'zh-Hant' ? ZH_HANT : EN
}

function planWindows(limits: readonly SessionRateLimit[]): SessionRateLimit[] {
  return limits.filter(one => PLAN_WINDOWS.includes(one.kind))
}

/** Whether a plan window is used up, so a request now would only be refused. */
export function isPastLimit(limits: readonly SessionRateLimit[]): boolean {
  return planWindows(limits).some(one => one.percentUsed >= 100)
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
  const resets = holding.map(one => (one.resetsAt === undefined ? NaN : Date.parse(one.resetsAt)))
  if (resets.length === 0 || resets.some(Number.isNaN)) return null

  return Math.max(...resets)
}

/** A moment as the local time of day, hours and minutes. */
export function fmtClock(ms: number): string {
  const at = new Date(ms)

  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
}
