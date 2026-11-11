import { atom, read, update } from 'claude-code'
import type { ContextAgent, EngineInterface, ModelUsage, Register, SessionContextBreakdown } from 'claude-code'

import type { Auto, ContextFile, ContextLists, ContextListKey, ContextMeter, Guard, GuardRun, Snapshot, Ttl } from '../types'
import { contextWords } from './context'
import type { ContextWords } from './context'
import { detect, follow } from './detect'
import { PING_MARGIN_MS, TTL_MS, WRITE_MULTIPLIER, fmtRemaining, fmtTokens, fmtUsd, priceOf } from './economics'
import {
  ABORT_AFTER_DENIED,
  DEFAULT_GUARD,
  GRACE_TOOLS,
  HARD_PERCENT,
  IDLE_RUN,
  MAX_RESUME_RETRIES,
  MAX_THRESHOLD,
  MIN_THRESHOLD,
  RESUME_DELAY_MS,
  WRAP_UP_REMINDER,
  blockingReset,
  fiveHourOf,
  fmtClock,
  isPastLimit,
  isWeeklyFull,
  keptGuard,
  limitWords,
  resumeRetryMs,
} from './limits'
import { LANGS, MESSAGES, langFrom } from './messages'
import type { Lang, LangSource } from './messages'
import {
  COLD_MODEL,
  COLD_PING,
  HIT,
  LEAD_MS,
  budgetOf,
  coldWords,
  extensionEvidence,
  isTracked,
  remainingOf,
  resumedTtl,
  verdictOf,
} from './model'
import type { Extension, Observation, Verdict, View } from './model'
import { autoLines, report } from './report'
import { bandView, paneView } from './views'
import type { ContextPart, Motion } from './views'

const DEFAULT_CAP = 12
const MAX_CAP = 200

const PANE = 'cache'

const snap = atom({ plugin: 'cache-context', key: 'snapshot' } as const, null)
const auto = atom({ plugin: 'cache-context', key: 'auto' } as const, {
  isOn: false,
  cap: DEFAULT_CAP,
})

const context = atom({ plugin: 'cache-context', key: 'context' } as const, null)
const isCompacting = atom({ plugin: 'cache-context', key: 'isCompacting' } as const, false)
const isLegendOpen = atom({ plugin: 'cache-context', key: 'isLegendOpen' } as const, false)
const openLists = atom({ plugin: 'cache-context', key: 'openLists' } as const, [] as ContextListKey[])
const guard = atom({ plugin: 'cache-context', key: 'guard' } as const, DEFAULT_GUARD)
const guardRun = atom({ plugin: 'cache-context', key: 'guardRun' } as const, IDLE_RUN)

const PING_PROMPT =
  'Prompt-cache keep-alive from the cache-refresher plugin. Reply with exactly: ok'

const OBSERVATIONS = 'observations'
const MAX_OBSERVATIONS = 100
const EXTENDS = 'pingExtends'
const LANG = 'lang'
const HEARD = 'langHeard'
// Set while auto-refresh has idle compaction turned off, so turning auto-refresh off turns it back on.
const PAUSED = 'idleCompactionPaused'
// The sessions with auto-refresh on, by when each last said so: the setting is shared, auto-refresh is per session.
const HOLDERS = 'idleCompactionHolders'
// A session renews its hold this often; one not heard from for longer than the stale age has ended without saying so.
const HOLD_BEAT_MS = 60_000
const HOLD_STALE_MS = 5 * 60_000
// The auto-refresh switch and its limit as last chosen, kept across restarts.
const AUTO = 'auto'
// The usage guard's settings, kept across restarts, and each session's pause, so a restart plans its continue again.
const GUARD = 'usageGuard'
const PAUSES = 'usagePauses'
// A kept pause this long past its reset belongs to a session that will not come back for it.
const PAUSE_STALE_MS = 24 * 60 * 60_000
const FIVE_HOURS_MS = 5 * 60 * 60_000
// Prompts the person sent, from any client, or Claude Code's own continue at the reset: each ends a pause.
const PERSON_KINDS = ['composer', 'bridge', 'sdk', 'slack-ping', 'auto-continuation']

type TtlChoice = Pick<Snapshot, 'ttl' | 'ttlSource'>

// How long an automatic refresh waits after one that failed for any reason but the usage limit.
const RETRY_MS = 60_000

/** What a ping said; `failure` when a request went out and refreshed nothing: refused at the usage limit, or else. */
type PingResult = { text: string; verdict: Verdict | null; failure?: 'limit' | 'other' }

// What the environment pins the TTL to; undefined until first read.
let configured: TtlChoice | null | undefined
// The TTL Claude Code itself last named, at a model switch or on a resume; undefined until it has.
let reported: Ttl | undefined
// The store's record of whether pings extend the cache; undefined until first read.
let extension: Extension | undefined
// The store's log of touches; undefined until first read.
let observed: Observation[] | undefined
// The language in force and what decided it; undefined until first read.
let spoken: { lang: Lang; source: LangSource } | undefined
// The languages of Claude's recent replies, and the store's last followed language until first read.
let heard: Record<string, number> = {}
let heardLang: Lang | null | undefined
// When the ping under way went out; null with none.
let pingAt: number | null = null
// No automatic refresh before this moment: the usage limit's reset, a failed one's wait, or Infinity until the next reply.
let autoHeldUntil = 0
// Main-thread requests under way: each touched the cache as it started.
let inFlight = 0
// No person at the engine's own prompt, as in the desktop app's local sessions: compaction there runs only as a /compact prompt.
let isHeadless = false
// What the panel's last button press came to, shown under its buttons.
let lastAction = ''
// The band's words as last drawn: the countdown redraws only when they change.
let lastHead = ''
// The language the open panel's title was last written in.
let titledIn: Lang | undefined
// When this session last renewed its hold on idle compaction.
let heldBeatAt = 0
// Changes to the hold run one at a time, so two quick toggles cannot interleave.
let holdQueue: Promise<unknown> = Promise.resolve()
// The main conversation's turn under way, for the guard to end; and the turn its continue prompt started.
let mainTurnId: string | null = null
let resumeTurnId: string | null = null
// When the panel was last opened: its entrance plays from that moment.
let openedAt: number | undefined
// The touch that last refilled the cache, and the share of its lifetime left before it: the ring sweeps back from there.
let refill: { at: number; from: number } | undefined

function isOn(value: string | undefined): boolean {
  return value === '1' || value === 'true'
}

// The person's own choice, then the language Claude last replied in, then the locale.
async function speaking($: EngineInterface): Promise<{ lang: Lang; source: LangSource }> {
  if (heardLang === undefined) heardLang = langFrom(await $.store.get(HEARD))
  if (spoken === undefined) {
    const pinned = langFrom(await $.store.get(LANG))
    const fromTalk = pinned === null ? heardLang : null
    const fromLocale =
      pinned === null && fromTalk === null
        ? (langFrom(await $.env.get('LC_ALL')) ?? langFrom(await $.env.get('LANG')))
        : null
    spoken =
      pinned !== null
        ? { lang: pinned, source: 'pinned' }
        : fromTalk !== null
          ? { lang: fromTalk, source: 'conversation' }
          : fromLocale !== null
            ? { lang: fromLocale, source: 'locale' }
            : { lang: 'en', source: 'default' }
  }

  return spoken
}

/**
 * Follows the language of a reply as it passes: its letters are counted, and only the language they say is kept.
 * Code says nothing about a language, and a reply with too few letters says too little.
 */
async function hear($: EngineInterface, answer: string): Promise<void> {
  const found = detect(answer)
  if (found === null) return
  const now = await speaking($)
  const followed = follow(heard, found, heardLang ?? now.lang)
  heard = followed.tally
  const { lang } = followed
  if (lang !== heardLang) {
    heardLang = lang
    await $.store.set(HEARD, lang)
  }
  if (now.source === 'pinned' || (now.source === 'conversation' && now.lang === lang)) return
  spoken = { lang, source: 'conversation' }
  // The band's words change with the language even while the clock stands still.
  lastHead = ''
  $.ui.invalidate('ui.render')
}

async function langOf($: EngineInterface): Promise<Lang> {
  return (await speaking($)).lang
}

/** Pins a language, or with `auto` goes back to detecting it; false for a word that names neither. */
async function setLang($: EngineInterface, word: string): Promise<boolean> {
  if (word === 'auto') {
    await $.store.delete(LANG)
    spoken = undefined
  } else {
    const lang = langFrom(word)
    if (lang === null) return false
    await $.store.set(LANG, lang)
    spoken = { lang, source: 'pinned' }
  }
  // The band's words change with the language even while the clock stands still.
  lastHead = ''
  $.ui.invalidate('ui.render')

  return true
}

// What the environment pins the main conversation's TTL to, in Claude Code's own order of precedence.
async function configuredTtl($: EngineInterface): Promise<TtlChoice | null> {
  if (isOn(await $.env.get('FORCE_PROMPT_CACHING_5M'))) {
    return { ttl: '5m', ttlSource: 'env' }
  }
  const fromEnv = await $.env.get('CLAUDE_CODE_PROMPT_CACHE_TTL')
  if (fromEnv === '5m' || fromEnv === '1h') return { ttl: fromEnv, ttlSource: 'env' }
  if (isOn(await $.env.get('ENABLE_PROMPT_CACHING_1H'))) {
    return { ttl: '1h', ttlSource: 'env' }
  }

  return null
}

async function resolveTtl($: EngineInterface, previous: Snapshot | null): Promise<TtlChoice> {
  if (configured === undefined) configured = await configuredTtl($)
  if (configured !== null) return configured
  if (previous?.ttlSource === 'observed') return { ttl: previous.ttl, ttlSource: 'observed' }
  const { rateLimits } = await $.session.usage()
  const plan = rateLimits.filter(one => one.kind === 'five_hour' || one.kind === 'seven_day')
  // A subscription inside its plan's usage gets the hour; over it, or off a subscription, five minutes.
  const isWithinPlan = plan.length > 0 && plan.every(one => one.percentUsed < 100)
  // Claude Code's own word replaces the guess, except past the plan's usage: that ends the hour whatever it said before.
  const isPastPlan = plan.length > 0 && !isWithinPlan
  const guessed = isWithinPlan ? '1h' : '5m'

  return { ttl: isPastPlan ? '5m' : (reported ?? guessed), ttlSource: 'assumed' }
}

async function observations($: EngineInterface): Promise<Observation[]> {
  if (observed === undefined) {
    const held = await $.store.get(OBSERVATIONS)
    observed = Array.isArray(held) ? held : []
  }

  return observed
}

async function remember($: EngineInterface, observation: Observation): Promise<void> {
  observed = [...(await observations($)), observation].slice(-MAX_OBSERVATIONS)
  await $.store.set(OBSERVATIONS, observed)
}

async function knownExtension($: EngineInterface): Promise<Extension> {
  if (extension === undefined) {
    const held = await $.store.get(EXTENDS)
    extension = typeof held === 'object' && held !== null ? (held as Extension) : {}
  }

  return extension
}

async function learnExtension($: EngineInterface, ttl: Ttl, doesExtend: boolean): Promise<void> {
  extension = { ...(await knownExtension($)), [ttl]: doesExtend }
  await $.store.set(EXTENDS, extension)
}

/** The auto-refresh setting the store kept; null when none was kept or the value is not one. */
function keptAuto(held: unknown): Auto | null {
  if (typeof held !== 'object' || held === null) return null
  const { isOn, cap } = held as Record<string, unknown>
  if (typeof isOn !== 'boolean' || typeof cap !== 'number' || !Number.isInteger(cap) || cap < 1 || cap > MAX_CAP) {
    return null
  }

  return { isOn, cap }
}

// Idle compaction runs at 90% of a one-hour cache's lifetime, before an auto-refresh would go out, so it is off while any session has auto-refresh on.
// Only a setting this mod turned off is turned back on; one that was off already stays off.
function holdIdleCompaction($: EngineInterface, isAutoOn: boolean, sessionId?: string): Promise<'paused' | 'restored' | null> {
  const run = holdQueue.then(() => changeHold($, isAutoOn, sessionId))
  holdQueue = run.catch(() => undefined)

  return run
}

async function changeHold($: EngineInterface, isAutoOn: boolean, sessionId?: string): Promise<'paused' | 'restored' | null> {
  try {
    const id = sessionId ?? (await $.session.id())
    const now = await $.clock.now()
    const stored = await $.store.get(HOLDERS)
    const holders: Record<string, number> = {}
    if (typeof stored === 'object' && stored !== null) {
      for (const [other, at] of Object.entries(stored)) {
        if (other !== id && typeof at === 'number' && now - at < HOLD_STALE_MS) holders[other] = at
      }
    }
    if (isAutoOn) holders[id] = now
    await $.store.set(HOLDERS, holders)
    if (isAutoOn) heldBeatAt = now
    const isWanted = Object.keys(holders).length > 0
    const isPaused = (await $.store.get(PAUSED)) === true
    if (isWanted === isPaused) return null
    // The setting's key is written out in each call: the plugin directory accepts a settings write only with its key as fixed text.
    const row = (await $.config.list()).find(each => each.key === 'idleCompaction')
    if (isWanted) {
      if (row?.value !== true) return null
      // Recorded before the write: a record with the setting still on is cleared harmlessly, a write with no record would never be undone.
      await $.store.set(PAUSED, true)
      if ((await $.config.set({ key: 'idleCompaction', value: false })).deny === undefined) return 'paused'
      await $.store.set(PAUSED, false)

      return null
    }
    // A row another settings file now holds cannot be written: the record stays, to try again later.
    if (row === undefined) return null
    if (row.value === false && (await $.config.set({ key: 'idleCompaction', value: true })).deny !== undefined) return null
    await $.store.set(PAUSED, false)

    return row.value === false ? 'restored' : null
  } catch {
    return null
  }
}

// The person's own change: kept in the store too, since the session's state starts over when Claude Code restarts or updates.
// A session ending turns its own switch off with `update` alone, so what was chosen still comes back next time.
async function setAuto($: EngineInterface, change: (held: Auto) => Auto): Promise<string | null> {
  const held = await update($, auto, change)
  await $.store.set(AUTO, held)
  const outcome = await holdIdleCompaction($, held.isOn)
  if (outcome === null) return null
  const m = MESSAGES[await langOf($)]

  return outcome === 'paused' ? m.idlePaused : m.idleRestored
}

/** A pause as the store keeps it for a restart. */
type KeptPause = Pick<GuardRun, 'resetsAt' | 'isWeekly' | 'resumeAt' | 'resumeTries'> & { phase: 'paused' | 'resumeFailed' }

function keptPauses(held: unknown): Record<string, KeptPause> {
  return typeof held === 'object' && held !== null ? (held as Record<string, KeptPause>) : {}
}

async function setGuard($: EngineInterface, change: (held: Guard) => Guard): Promise<Guard> {
  const held = await update($, guard, change)
  await $.store.set(GUARD, held)
  $.ui.invalidate('ui.render')

  return held
}

async function changeRun($: EngineInterface, change: (run: GuardRun) => GuardRun): Promise<GuardRun> {
  const run = await update($, guardRun, change)
  $.ui.invalidate('ui.render')

  return run
}

/** Claude Code's own "continue at the usage-limit reset" setting; null where this version has none. */
async function readAutoContinue($: EngineInterface): Promise<boolean | null> {
  const row = (await $.config.list()).find(each => each.key === 'autoContinueAtUsageLimit')

  return typeof row?.value === 'boolean' ? row.value : null
}

/** Reads the plan's windows, noting the five-hour one's use and reset for the guard. */
async function readUsage($: EngineInterface) {
  const limits = (await $.session.usage()).rateLimits
  const five = fiveHourOf(limits)
  await changeRun($, run => ({ ...run, percent: five?.percent ?? null, resetsAt: five?.resetsAt ?? null }))

  return { limits, five }
}

/** Keeps this session's pause in the store for a restart, or drops it once there is none. */
async function keepPause($: EngineInterface, run: GuardRun): Promise<void> {
  const id = await $.session.id()
  const now = await $.clock.now()
  const pauses: Record<string, KeptPause> = {}
  for (const [other, kept] of Object.entries(keptPauses(await $.store.get(PAUSES)))) {
    if (other !== id && (kept.resetsAt ?? now) + PAUSE_STALE_MS > now) pauses[other] = kept
  }
  if (run.phase === 'paused' || run.phase === 'resumeFailed') {
    const { resetsAt, isWeekly, resumeAt, resumeTries } = run
    pauses[id] = { phase: run.phase, resetsAt, isWeekly, resumeAt, resumeTries }
  }
  await $.store.set(PAUSES, pauses)
}

/** After the main conversation's reply: at the threshold Claude is asked to wrap up, at 99% its tools are refused. */
async function watchUsage($: EngineInterface): Promise<void> {
  const settings = await read($, guard)
  if (!settings.isOn) return
  const { five } = await readUsage($)
  const run = await read($, guardRun)
  if (five === null || (await $.clock.now()) < run.skipUntil) return
  const isHard = five.percent >= HARD_PERCENT
  if (run.phase === 'watching' && five.percent >= settings.threshold) {
    await changeRun($, r => ({ ...r, phase: isHard ? 'blocking' : 'wrapping', toolsUsed: 0, denied: 0 }))
  } else if (run.phase === 'wrapping' && isHard) {
    await changeRun($, r => ({ ...r, phase: 'blocking' }))
  }
}

/** The wrapped-up turn has ended: paused until the reset, with a continue planned when Claude Code's setting asks for one. */
async function startPause($: EngineInterface): Promise<void> {
  const { limits, five } = await readUsage($)
  const autoContinue = await readAutoContinue($)
  const isWeekly = isWeeklyFull(limits)
  const resetsAt = five?.resetsAt ?? null
  const resumeAt = autoContinue === true && !isWeekly && resetsAt !== null ? resetsAt + RESUME_DELAY_MS : null
  const run = await changeRun($, r => ({ ...r, phase: 'paused', autoContinue, isWeekly, resumeAt, resumeTries: 0, isResuming: false }))
  await keepPause($, run)
}

async function endPause($: EngineInterface): Promise<void> {
  resumeTurnId = null
  const run = await changeRun($, r => ({ ...r, phase: 'watching', toolsUsed: 0, denied: 0, resumeAt: null, resumeTries: 0, isResuming: false }))
  await keepPause($, run)
}

/** Sends the continue prompt; the turn it starts says at its end whether it went through. */
async function resume($: EngineInterface): Promise<void> {
  resumeTurnId = null
  await changeRun($, r => ({ ...r, phase: 'paused', isResuming: true, resumeTries: r.resumeTries + 1 }))
  const w = limitWords(MESSAGES[await langOf($)].tag)
  try {
    await $.prompt.submit({ text: w.resumePrompt })
  } catch {
    await retryResume($)
  }
}

/** A continue that was refused is tried again: first soon, then once a minute, until it gives up. */
async function retryResume($: EngineInterface): Promise<void> {
  resumeTurnId = null
  const now = await $.clock.now()
  const run = await changeRun($, r =>
    r.resumeTries > MAX_RESUME_RETRIES
      ? { ...r, phase: 'resumeFailed', isResuming: false, resumeAt: null }
      : { ...r, isResuming: false, resumeAt: now + resumeRetryMs(r.resumeTries) },
  )
  await keepPause($, run)
}

/** The main conversation's turn has ended: a wrapped-up turn pauses, and the continue's own turn settles the pause. */
async function settleTurn($: EngineInterface, turnId: string, reason: string): Promise<void> {
  const run = await read($, guardRun)
  if (run.phase === 'wrapping' || run.phase === 'blocking') {
    await startPause($)
    return
  }
  if (!run.isResuming || turnId !== resumeTurnId) return
  // An API error is the limit refusing it still; an answer, or the person stopping it, ends the pause.
  if (reason === 'error') await retryResume($)
  else await endPause($)
}

/** Takes Claude Code's continue setting as changed, planning or dropping a paused session's continue with it. */
async function applyAutoContinue($: EngineInterface, value: boolean): Promise<void> {
  const run = await changeRun($, r => {
    if (r.phase !== 'paused' || r.isResuming) return { ...r, autoContinue: value }
    const resumeAt = value && !r.isWeekly && r.resetsAt !== null ? r.resetsAt + RESUME_DELAY_MS : null

    return { ...r, autoContinue: value, resumeAt }
  })
  if (run.phase === 'paused') await keepPause($, run)
}

/** On a start or a reload: the guard's settings, and a pause this session left, planned again. */
async function restoreGuard($: EngineInterface): Promise<void> {
  const settings = keptGuard(await $.store.get(GUARD))
  await update($, guard, () => settings)
  if (!settings.isOn) return
  const autoContinue = await readAutoContinue($)
  const kept = keptPauses(await $.store.get(PAUSES))[await $.session.id()]
  // A reload keeps the session's state but not the turn a continue started: it is planned again from now.
  await changeRun($, r => {
    const isPaused = r.phase === 'paused' || r.phase === 'resumeFailed'
    if (kept === undefined || isPaused) return { ...r, autoContinue, isResuming: false }

    return { ...r, ...kept, autoContinue, isResuming: false }
  })
}

/** Each second: a continue that is due goes out, and a usage limit that has reset stops being shown. */
async function tickGuard($: EngineInterface, now: number): Promise<void> {
  const run = await read($, guardRun)
  if (run.limit !== null && run.limit.reset !== null && now >= run.limit.reset) {
    await changeRun($, r => ({ ...r, limit: null }))
  }
  if (run.phase === 'paused' && run.resumeAt !== null && !run.isResuming && now >= run.resumeAt) await resume($)
}

async function viewOf($: EngineInterface): Promise<View> {
  return {
    held: await read($, snap),
    now: await $.clock.now(),
    policy: await read($, auto),
    known: await knownExtension($),
    observations: await observations($),
  }
}

/** The moment of a draw, and the events its movements run from. */
async function motionOf($: EngineInterface): Promise<Motion> {
  return { now: await $.clock.now(), openedAt: openedAt ?? null, refill: refill ?? null, pingAt }
}

// The plain usage figures carry the API's own count; the full breakdown adds the compaction window and
// the categories /context shows, counted with the token-count API as the app's own popover counts them
// (a summary one estimates locally, and its tool and memory rows came out far from the app's).
async function measureContext($: EngineInterface): Promise<void> {
  const { context: usage } = await $.session.usage({ breakdown: 'full' })
  const b = usage.breakdown
  const next: ContextMeter = {
    tokens: usage.tokens,
    max: b?.rawMaxTokens ?? usage.window,
    threshold: b?.isAutoCompactEnabled ? b.autoCompactThreshold : undefined,
    segments: (b?.categories ?? []).map(c => ({ name: c.name, tokens: c.tokens, color: c.color, kind: c.kind })),
    lists: b === undefined ? undefined : await listsOf($, b),
  }
  await update($, context, () => next)
}

/** A path under a base, in the base's own separator. */
function joinPath(base: string, ...parts: string[]): string {
  const sep = base.includes('\\') ? '\\' : '/'

  return [base.replace(/[\\/]+$/, ''), ...parts].join(sep)
}

/** The path shown for a file: under the home directory as `~`. */
function shownPath(path: string, home: string | undefined): string {
  return home !== undefined && path.toLowerCase().startsWith(home.toLowerCase()) ? `~${path.slice(home.length)}` : path
}

/**
 * Where a custom agent's file is, by the settings it came from: the person's own or the project's agents
 * folder, under the agent's name. Null for a plugin's agent, whose file the breakdown does not say, and for
 * a file not found there, so the panel never offers a press that opens nothing.
 */
async function agentPath($: EngineInterface, agent: ContextAgent, home: string | undefined): Promise<string | null> {
  const base = agent.source === 'userSettings' ? home : agent.source === 'projectSettings' ? await $.session.cwd() : undefined
  if (base === undefined) return null
  const path = joinPath(base, '.claude', 'agents', `${agent.agentType}.md`)
  const found = await $.fs.stat(path).catch(() => undefined)

  return found?.kind === 'file' ? path : null
}

/** The lists beneath the legend: the MCP servers by tool count, the memory files and the custom agents. */
async function listsOf($: EngineInterface, b: SessionContextBreakdown): Promise<ContextLists> {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  const servers = new Map<string, number>()
  for (const tool of b.mcpTools) servers.set(tool.serverName, (servers.get(tool.serverName) ?? 0) + 1)
  const agents: ContextFile[] = []
  for (const agent of b.agents) agents.push({ name: agent.agentType, path: await agentPath($, agent, home) })

  return {
    mcpServers: [...servers].map(([name, tools]) => ({ name, tools })).sort((x, y) => y.tools - x.tools),
    memoryFiles: b.memoryFiles.map(file => ({ name: shownPath(file.path, home), path: file.path })),
    agents,
  }
}

/**
 * Opens a file with the app the system gives its type: `start` on Windows; elsewhere `xdg-open` (Linux and
 * the BSDs), then `open` (macOS). xdg-open goes first because some Linux systems have an unrelated `open`.
 */
async function openFile($: EngineInterface, path: string, w: ContextWords): Promise<void> {
  const tries = /^[A-Za-z]:[\\/]/.test(path) ? [['cmd', '/c', 'start', '', path]] : [['xdg-open', path], ['open', path]]
  for (const argv of tries) {
    const ran = await $.process.run(argv).catch(() => undefined)
    if (ran?.exitCode === 0) return
  }
  $.ui.toast(w.openFailed(path))
}

/** The context window and its controls as a draw needs them. */
async function contextPartOf($: EngineInterface, tag: string, isWorking: boolean): Promise<ContextPart> {
  const w = contextWords(tag)

  return {
    meter: await read($, context),
    isCompacting: await read($, isCompacting),
    isLegendOpen: await read($, isLegendOpen),
    canCompact: !isWorking,
    onCompact: async () => {
      await update($, isCompacting, () => true)
      try {
        if (isHeadless) {
          // Run as if the person typed /compact; it is queued and runs once the session is idle.
          await $.command.run({ command: 'compact' })
          return
        }
        const r = await $.session.compact()
        if ('skip' in r) $.ui.toast(w.skipped(r.skip))
        await measureContext($)
      } catch (err) {
        // compact() rejects while a turn runs; say so instead of failing silently.
        $.ui.toast(w.failed(err instanceof Error ? err.message : String(err)))
      } finally {
        await update($, isCompacting, () => false)
      }
    },
    onLegend: () => {
      void update($, isLegendOpen, open => !open)
    },
    openLists: await read($, openLists),
    onList: key => {
      void update($, openLists, open => (open.includes(key) ? open.filter(one => one !== key) : [...open, key]))
    },
    onOpen: path => {
      void openFile($, path, w)
    },
  }
}

/** Opens the panel, noting when. */
async function openPane($: EngineInterface, title: string): Promise<void> {
  openedAt = await $.clock.now()
  await $.ui.open({ id: PANE, title, focus: true, closeOnEscape: true })
}

/** The share of its lifetime a cache had left at a moment, for the ring to sweep back from. */
function shareLeft(held: Snapshot | null, at: number): number {
  return isTracked(held) ? Math.max(0, remainingOf(held, at)) / TTL_MS[held.ttl] : 0
}

/** Takes one main-thread response's usage as the cache's new state. */
async function recordStep(
  $: EngineInterface,
  startedAt: number,
  index: number,
  usage: ModelUsage & { model: string },
): Promise<void> {
  const previous = await read($, snap)
  const served = usage.cache_read_input_tokens
  let { ttl, ttlSource } = await resolveTtl($, previous)

  if (isTracked(previous) && previous.coldReason === null && previous.model === usage.model) {
    const gapMs = startedAt - previous.touchedAt
    const verdict = verdictOf(served, previous.cachedTokens)
    const evidence = extensionEvidence(previous, startedAt, verdict)
    if (evidence !== undefined) await learnExtension($, previous.ttl, evidence)
    // After a ping a miss may be the ping's doing, so only a turn's own gap speaks for the TTL.
    const canInfer = ttlSource === 'assumed' || ttlSource === 'observed'
    if (canInfer && verdict === 'hit' && gapMs > TTL_MS['5m'] + 30_000) {
      ttl = '1h'
      ttlSource = 'observed'
    } else if (
      canInfer &&
      previous.touchedBy !== 'ping' &&
      verdict === 'miss' &&
      gapMs > TTL_MS['5m'] &&
      gapMs < TTL_MS['1h']
    ) {
      ttl = '5m'
      ttlSource = 'observed'
    }
    if (index === 0 || verdict !== 'hit') {
      await remember($, {
        at: startedAt,
        kind: 'turn',
        gapMs,
        prevBy: previous.touchedBy,
        ttl: previous.ttl,
        cachedBefore: previous.cachedTokens,
        read: served,
        created: usage.cache_creation_input_tokens,
        input: usage.input_tokens,
        output: usage.output_tokens,
        model: usage.model,
        verdict,
      })
    }
  }

  // A reply went through, so whatever held automatic refreshes back no longer does.
  autoHeldUntil = 0
  if ((await read($, guardRun)).limit !== null) await changeRun($, r => ({ ...r, limit: null }))
  // Noted before the write: the redraw the write causes must already find it.
  const at = await $.clock.now()
  refill = { at, from: shareLeft(previous, at) }
  await update($, snap, () => ({
    touchedAt: startedAt,
    touchedBy: 'turn' as const,
    turnAt: startedAt,
    pingsSinceTurn: 0,
    cachedTokens: served + usage.cache_creation_input_tokens,
    model: usage.model,
    ttl,
    ttlSource,
    coldReason: null,
    lastPing: previous?.lastPing ?? null,
  }))
  $.ui.invalidate('ui.render')
}

/** Sends one keep-alive over the main conversation's prefix and says what it did. */
async function ping($: EngineInterface, isForced: boolean): Promise<PingResult> {
  const m = MESSAGES[await langOf($)]
  const held = await read($, snap)
  if (!isTracked(held)) return { text: m.pingNothing, verdict: null }
  if (pingAt !== null) return { text: m.pingBusy, verdict: null }
  const startedAt = await $.clock.now()
  if (remainingOf(held, startedAt) <= PING_MARGIN_MS && !isForced) {
    return { text: m.pingCold(coldWords(m, held, startedAt), fmtTokens(held.cachedTokens)), verdict: null }
  }

  pingAt = startedAt
  // The ring shows the ping going out, and again what came of it.
  $.ui.invalidate('ui.render')
  try {
    const reply = await $.model.fork({ prompt: PING_PROMPT })
    if (!reply.isAnswered && reply.reason === 'nothing-to-fork') {
      return { text: m.pingNoFork, verdict: null, failure: 'other' }
    }
    if (!reply.isAnswered && reply.reason === 'api-error') {
      const failure = reply.status === 429 ? 'limit' : 'other'

      return { text: m.pingApiError(reply.error, reply.status), verdict: null, failure }
    }

    const { usage } = reply
    const lastPing = {
      at: startedAt,
      read: usage.cache_read_input_tokens,
      created: usage.cache_creation_input_tokens,
      input: usage.input_tokens,
      output: usage.output_tokens,
    }
    if (lastPing.read + lastPing.created + lastPing.input === 0) return { text: m.pingCut, verdict: null, failure: 'other' }
    const verdict = verdictOf(lastPing.read, held.cachedTokens)
    const hasRewritten = verdict !== 'hit' && lastPing.created >= held.cachedTokens * HIT
    const evidence = extensionEvidence(held, startedAt, verdict)
    if (evidence !== undefined) await learnExtension($, held.ttl, evidence)
    await remember($, {
      at: startedAt,
      kind: 'ping',
      gapMs: startedAt - held.touchedAt,
      prevBy: held.touchedBy,
      ttl: held.ttl,
      cachedBefore: held.cachedTokens,
      read: lastPing.read,
      created: lastPing.created,
      input: lastPing.input,
      output: lastPing.output,
      model: held.model,
      verdict,
    })
    if (verdict === 'hit' || hasRewritten) {
      // Noted before the write: the redraw the write causes must already find it.
      const at = await $.clock.now()
      refill = { at, from: shareLeft(held, at) }
    }
    await update($, snap, now => {
      if (now === null) return now
      const pingsSinceTurn = now.pingsSinceTurn + 1
      if (verdict === 'hit' || hasRewritten) {
        return { ...now, touchedAt: startedAt, touchedBy: 'ping' as const, pingsSinceTurn, coldReason: null, lastPing }
      }

      return { ...now, pingsSinceTurn, coldReason: COLD_PING, lastPing }
    })

    const counts = m.counts({
      read: fmtTokens(lastPing.read),
      wrote: fmtTokens(lastPing.created),
      input: lastPing.input,
      output: lastPing.output,
    })
    const price = priceOf(held.model)
    const cost = price
      ? m.atListPrice(
          fmtUsd(
            (lastPing.read * price.read * price.input +
              lastPing.created * WRITE_MULTIPLIER[held.ttl] * price.input +
              lastPing.input * price.input +
              lastPing.output * price.output) /
              1e6,
          ),
        )
      : ''
    if (verdict === 'hit') return { text: m.pingHit(counts, cost, held.ttl), verdict }

    return { text: hasRewritten ? m.pingRewrote(counts, cost) : m.pingMissed(counts, cost), verdict }
  } finally {
    pingAt = null
    $.ui.invalidate('ui.render')
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    isHeadless = !e.isInteractive
    // The session's state starts over when Claude Code restarts or updates, so the switch comes back from the store.
    const kept = keptAuto(await $.store.get(AUTO))
    if (kept !== null) await update($, auto, () => kept)
    // Held with the switch as restored. A session that ended without saying so (a crash, a kill) leaves its hold behind until it goes stale.
    void holdIdleCompaction($, (await read($, auto)).isOn)
    await restoreGuard($)
    $.clock.every(1000, async () => {
      const lang = await langOf($)
      const m = MESSAGES[lang]
      // An open panel keeps the title it was opened with, so it is renamed when the language moves on.
      if (lang !== titledIn) {
        titledIn = lang
        const panes = await $.ui.panes()
        if (panes.some(pane => pane.id === PANE && pane.title !== m.paneTitle)) {
          await $.ui.open({ id: PANE, title: m.paneTitle })
        }
      }
      const held = await read($, snap)
      const now = await $.clock.now()
      await tickGuard($, now)
      // The countdown: redraw only when its words change.
      const head = held === null ? '' : remainingOf(held, now) > 0 ? fmtRemaining(remainingOf(held, now)) : 'cold'
      if (head !== lastHead) {
        lastHead = head
        $.ui.invalidate('ui.render')
      }

      const policy = await read($, auto)
      if (policy.isOn && now - heldBeatAt >= HOLD_BEAT_MS) void holdIdleCompaction($, true)

      // The keep-alive. A request under way has already touched the cache.
      if (held === null || pingAt !== null || inFlight > 0) return
      if (!policy.isOn) return
      const remaining = remainingOf(held, now)
      if (remaining <= PING_MARGIN_MS || remaining > LEAD_MS[held.ttl]) return
      const budget = budgetOf(held, policy.cap, await knownExtension($))
      if (held.pingsSinceTurn >= budget || now < autoHeldUntil) return
      const w = limitWords(m.tag)
      const holdForLimit = async (limits: Parameters<typeof blockingReset>[0]): Promise<string> => {
        const reset = blockingReset(limits)
        autoHeldUntil = reset ?? Infinity
        // The panel and the band say so until the reset, or the next reply.
        await changeRun($, r => ({ ...r, limit: { reset } }))

        return reset === null ? w.heldNoReset : w.heldUntil(fmtClock(reset))
      }
      // A plan window already used up refuses the request: wait for its reset instead of sending one.
      const before = (await $.session.usage()).rateLimits
      if (isPastLimit(before)) {
        $.ui.log(await holdForLimit(before))
        return
      }
      const sent = await ping($, false)
      const line = m.autoLog(held.pingsSinceTurn + 1, budget, sent.text)
      if (sent.failure === 'limit') {
        // Refused for the usage limit: it refreshed nothing, so it spends none of the budget.
        $.ui.log(`${line} ${await holdForLimit((await $.session.usage()).rateLimits)}`)
        return
      }
      if (sent.failure === 'other') {
        // Nothing refreshed, but the try counts, and the next waits, so a failure cannot repeat every second.
        await update($, snap, s => (s === null ? s : { ...s, pingsSinceTurn: s.pingsSinceTurn + 1 }))
        autoHeldUntil = now + RETRY_MS
      }
      $.ui.log(line)
      if (sent.verdict !== 'hit') $.ui.toast(m.autoMissToast)
    })
    const m = MESSAGES[await langOf($)]
    await $.command.register({ name: 'cache-status', description: m.cmdStatus, immediate: true })
    await $.command.register({ name: 'cache-panel', description: m.cmdPanel, immediate: true })
    await $.command.register({ name: 'cache-ping', description: m.cmdPing, argumentHint: '[force]' })
    await $.command.register({
      name: 'cache-auto',
      description: m.cmdAuto,
      argumentHint: m.cmdAutoHint,
      immediate: true,
    })
    await $.command.register({
      name: 'cache-lang',
      description: m.cmdLang,
      argumentHint: m.cmdLangHint,
      immediate: true,
    })
    const result = await next(e)
    await measureContext($)

    return result
  })

  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    await measureContext($)

    return result
  })

  on('session.end', async ($, e, next) => {
    // Auto-refresh ends with the conversation: after a /clear or a resume the next one starts with it off.
    if ((await read($, auto)).isOn) {
      await update($, auto, held => ({ ...held, isOn: false }))
      await holdIdleCompaction($, false, e.sessionId)
    }

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    // Subagents keep caches of their own; only the main conversation is tracked.
    const isMain = e.agentId === undefined
    const startedAt = await $.clock.now()
    if (isMain) inFlight += 1
    try {
      const result = yield* next(e)
      if (isMain && pingAt === null && result.usage !== null) {
        await hear($, result.answer)
        await recordStep($, startedAt, e.index, result.usage)
        await watchUsage($)
      }

      return result
    } finally {
      if (isMain) inFlight -= 1
    }
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      mainTurnId = e.turnId
      if ((await read($, guardRun)).isResuming && resumeTurnId === null) resumeTurnId = e.turnId
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) await settleTurn($, e.turnId, e.reason)

    return result
  })

  // Wrapping up: each tool still runs, its result carrying a reminder only Claude reads, until the grace is
  // used or the usage reaches 99%. Then every call is refused, and the third refusal ends the turn.
  on('tool.call', async ($, e, next) => {
    const run = await read($, guardRun)
    if (run.phase !== 'wrapping' && run.phase !== 'blocking') return next(e)
    if (run.phase === 'wrapping' && run.toolsUsed < GRACE_TOOLS) {
      await changeRun($, r => ({ ...r, toolsUsed: r.toolsUsed + 1 }))
      const result = await next(e)
      // A subagent's tools count against the grace, but only the main conversation is asked to stop.
      if (result.deny !== undefined || e.agentId !== undefined) return result

      return { ...result, context: [...(result.context ?? []), WRAP_UP_REMINDER] }
    }
    const { denied } = await changeRun($, r => ({ ...r, phase: 'blocking', denied: r.denied + 1 }))
    if (denied >= ABORT_AFTER_DENIED && mainTurnId !== null) await $.turn.abort({ turnId: mainTurnId })

    return { deny: limitWords(MESSAGES[await langOf($)].tag).denied }
  })

  on('prompt.submit', async ($, e, next) => {
    if (PERSON_KINDS.includes(e.origin.kind)) {
      const { phase } = await read($, guardRun)
      if (phase === 'paused' || phase === 'resumeFailed') await endPause($)
    }

    return next(e)
  })

  on('config.set', { key: 'autoContinueAtUsageLimit' }, async ($, e, next) => {
    const result = await next(e)
    if (result.deny === undefined && typeof result.value === 'boolean') await applyAutoContinue($, result.value)

    return result
  })

  on('classic.SessionStart', async ($, e, next) => {
    if (e.source === 'compact') {
      // The compacted conversation shares no prefix with what was cached.
      await update($, snap, () => null)
    } else if (
      (e.source === 'resume' || e.source === 'fork') &&
      e.seconds_since_last_response !== undefined &&
      e.context_tokens !== undefined
    ) {
      const now = await $.clock.now()
      const gapMs = e.seconds_since_last_response * 1000
      reported = resumedTtl(gapMs, e.prompt_cache_likely_expired) ?? reported
      const choice = await resolveTtl($, null)
      const touchedAt = now - gapMs
      const cachedTokens = e.context_tokens
      const model = e.model ?? 'unknown'
      await update($, snap, () => ({
        touchedAt,
        touchedBy: 'resume' as const,
        turnAt: touchedAt,
        pingsSinceTurn: 0,
        cachedTokens,
        model,
        ...choice,
        coldReason: null,
        lastPing: null,
      }))
    }

    return next(e)
  })

  on('classic.PostModelSwitch', async ($, e, next) => {
    if (e.cache_ttl !== undefined) {
      // Claude Code names the TTL it applies as it reports a switch; a cache still counting down takes it at once.
      reported = e.cache_ttl
      const choice = await resolveTtl($, await read($, snap))
      await update($, snap, now => (now === null ? now : { ...now, ...choice }))
    }
    if (e.from_model !== e.to_model) {
      const reason = COLD_MODEL + e.to_model
      await update($, snap, now => (now === null ? now : { ...now, coldReason: reason }))
    }

    return next(e)
  })

  on('command.run', { command: 'cache-status' }, async $ => {
    return { text: report(MESSAGES[await langOf($)], await viewOf($)) }
  })

  on('command.run', { command: 'cache-panel' }, async $ => {
    await openPane($, MESSAGES[await langOf($)].paneTitle)

    return {}
  })

  on('command.run', { command: 'cache-ping' }, async ($, e) => {
    return { text: (await ping($, e.args.trim() === 'force')).text }
  })

  on('command.run', { command: 'cache-auto' }, async ($, e) => {
    const m = MESSAGES[await langOf($)]
    const words = e.args.trim().split(/\s+/).filter(Boolean)
    const wanted = words.find(word => word === 'on' || word === 'off')
    const cap = words.map(Number).find(n => Number.isInteger(n) && n > 0 && n <= MAX_CAP)
    if (words.length > 0 && wanted === undefined && cap === undefined) return { text: m.autoUsage(MAX_CAP) }
    const idle =
      words.length > 0
        ? await setAuto($, now => ({
            isOn: wanted === undefined ? true : wanted === 'on',
            cap: cap ?? now.cap,
          }))
        : null
    const lines = [m.autoHeader, ...autoLines(m, await viewOf($)), m.autoNote]

    return { text: (idle === null ? lines : [...lines, `  ${idle}`]).join('\n') }
  })

  on('command.run', { command: 'cache-lang' }, async ($, e) => {
    const word = e.args.trim().toLowerCase()
    if (word !== '' && !(await setLang($, word))) return { text: MESSAGES[await langOf($)].langUsage(LANGS.join(', ')) }
    const now = await speaking($)
    const m = MESSAGES[now.lang]

    return { text: m.langNow(m.name, now.source) }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const view = await viewOf($)
    const { held } = view
    const meter = await read($, context)
    if (e.props.hasSurvey || (!isTracked(held) && meter === null)) return next(e)
    const m = MESSAGES[await langOf($)]
    const beneath = await next(e)
    const els = $.ui.resolve(e)
    const band = bandView(els, e.surface, m, view, await motionOf($), () => {
      void openPane($, m.paneTitle)
    }, await contextPartOf($, m.tag, e.props.isWorking), { settings: await read($, guard), run: await read($, guardRun) })

    return els.Box({ flexDirection: 'column', children: [beneath, band] })
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const m = MESSAGES[await langOf($)]
    // A pane is not told whether a turn runs; compaction answers for itself then, with a toast.
    const ctx = await contextPartOf($, m.tag, false)

    return paneView($.ui.resolve(e), e.surface, m, await viewOf($), lastAction, {
      onToggle: async () => {
        const idle = await setAuto($, held => ({ ...held, isOn: !held.isOn }))
        if (idle !== null) $.ui.toast(idle)
      },
      onCapDown: () => {
        void setAuto($, held => ({ ...held, cap: Math.max(1, held.cap - 1) }))
      },
      onCapUp: () => {
        void setAuto($, held => ({ ...held, cap: Math.min(MAX_CAP, held.cap + 1) }))
      },
      onPing: async () => {
        lastAction = (await ping($, false)).text
        $.ui.invalidate('ui.render')
      },
    }, e.props.bodyColumns, await motionOf($), ctx, {
      settings: await read($, guard),
      run: await read($, guardRun),
      onToggle: async () => {
        const settings = await setGuard($, held => ({ ...held, isOn: !held.isOn }))
        if (!settings.isOn) {
          await endPause($)
          return
        }
        const autoContinue = await readAutoContinue($)
        await changeRun($, r => ({ ...r, autoContinue }))
        await readUsage($)
      },
      onThresholdDown: () => {
        void setGuard($, held => ({ ...held, threshold: Math.max(MIN_THRESHOLD, held.threshold - 1) }))
      },
      onThresholdUp: () => {
        void setGuard($, held => ({ ...held, threshold: Math.min(MAX_THRESHOLD, held.threshold + 1) }))
      },
      onAutoContinue: async () => {
        const now = (await read($, guardRun)).autoContinue
        if (now === null) return
        // The key is written out as fixed text: the plugin directory accepts a settings write only so.
        const written = await $.config.set({ key: 'autoContinueAtUsageLimit', value: !now })
        if (written.deny !== undefined) $.ui.toast(written.deny)
        else await applyAutoContinue($, !now)
      },
      onStop: async () => {
        if (mainTurnId === null) return
        await changeRun($, r => ({ ...r, phase: 'blocking' }))
        await $.turn.abort({ turnId: mainTurnId })
      },
      onSkip: async () => {
        const now = await $.clock.now()
        const run = await changeRun($, r => ({ ...r, phase: 'watching', toolsUsed: 0, denied: 0, skipUntil: r.resetsAt ?? now + FIVE_HOURS_MS }))
        await keepPause($, run)
      },
      onResume: async () => {
        await changeRun($, r => ({ ...r, resumeTries: 0 }))
        await resume($)
      },
      onCancelResume: async () => {
        await keepPause($, await changeRun($, r => ({ ...r, resumeAt: null })))
      },
    })
  })
}
