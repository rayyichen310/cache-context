import { expect, mock, test } from 'claude-code/testing'

import { WRAP_UP_REMINDER, fmtClock } from '../hooks/limits'

const SECOND = 1000
const MINUTE = 60_000
const START = 1_700_000_000_000
// The five-hour window resets ten minutes in: the automatic continue goes out 30 seconds after.
const RESET = START + 10 * MINUTE
const RESUME = RESET + 30 * SECOND
const PANE_PROPS = { title: 'Prompt cache', isFocused: true, bodyColumns: 60, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 60 }, view: {} }
const GUARD_ON = { usageGuard: { isOn: true, threshold: 97 } }

// The context measure Claude Code gives, with auto-compaction on, so the panel's context section is whole.
const BREAKDOWN = {
  categories: [{ name: 'Messages', tokens: 80_000, color: 'permission', isDeferred: false, kind: 'used' as const }],
  totalTokens: 80_000,
  maxTokens: 1_000_000,
  rawMaxTokens: 1_000_000,
  autocompactSource: 'settings' as const,
  percentage: 8,
  gridRows: [],
  model: 'claude-sonnet-5-5',
  memoryFiles: [],
  mcpTools: [],
  agents: [],
  autoCompactThreshold: 900_000,
  isAutoCompactEnabled: true,
  apiUsage: null,
}

// The panel open now: a pane is mounted once at a time, so a fresh look unmounts the last.
let mounted: any

type Setup = { percent?: number; weekly?: number; autoContinue?: boolean; store?: Record<string, unknown> }

/** A session with the guard on, the five-hour window at `percent`, and the guard's continue switch as given. */
async function guarded($: any, on: any, setup: Setup = {}) {
  mounted = undefined
  const clock = mock.clock(on, { now: START })
  const settings = { ...GUARD_ON.usageGuard, autoContinue: setup.autoContinue ?? true }
  mock.store(on, { usageGuard: settings, ...setup.store })
  mock.env(on, { CLAUDE_CODE_PROMPT_CACHE_TTL: '1h' })
  const world = {
    percent: setup.percent ?? 50,
    weekly: setup.weekly ?? 10,
    // Claude Code's own setting, which a mod may turn off but not on: the guard must not touch it.
    nativeContinue: true,
    aborted: [] as string[],
    submitted: [] as string[],
  }
  on('session.usage', () => ({
    value: {
      startedAt: START,
      context: { tokens: 80_000, window: 1_000_000, percent: 8, breakdown: BREAKDOWN },
      rateLimits: [
        { kind: 'five_hour', percentUsed: world.percent, resetsAt: new Date(RESET).toISOString() },
        { kind: 'seven_day', percentUsed: world.weekly, resetsAt: new Date(START + 3 * 24 * 60 * MINUTE).toISOString() },
      ],
    },
  }))
  on('config.list', () => ({
    value: [{ key: 'autoContinueAtUsageLimit', label: 'Continue automatically at usage limit', kind: 'boolean', value: world.nativeContinue, provider: { plugin: 'engine', tier: 'core' }, isLocked: false }],
  }))
  // As Claude Code answers a mod: off is written, on is refused.
  on('config.set', (_: unknown, e: { key: string; value: boolean }) => {
    if (e.key !== 'autoContinueAtUsageLimit') return { deny: `unexpected key ${e.key}` }
    if (e.value) return { deny: 'Continue automatically at usage limit can only be turned on from the /config panel.' }
    world.nativeContinue = false

    return { value: false }
  })
  on('session.id', () => ({ value: 'session-a' }))
  on('turn.abort', (_: unknown, e: { turnId: string }) => {
    world.aborted.push(e.turnId)

    return { value: undefined }
  })
  on('prompt.submit', (_: unknown, e: { text: string }) => {
    world.submitted.push(e.text)

    return { text: e.text }
  })
  on('tool.call', () => ({ result: { stdout: 'ok', stderr: '', interrupted: false } }))
  on('turn.start', (_: unknown, e: { turnId: string }) => ({ turnId: e.turnId }))
  on('turn.complete', (_: unknown, e: { answer: string }) => ({ text: e.answer }))
  on('turn.step', async function* (_: unknown, e: any) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: 'working on it',
      toolUses: [],
      stopReason: 'end_turn',
      usage: { input_tokens: 12, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 80_000, model: 'claude-sonnet-5-5' },
    }
  })
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('command.register', (_: unknown, e: { name: string }) => ({ value: { command: e.name } }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })

  return { clock, world }
}

/** The main conversation starts a turn and Claude replies once in it. */
async function turnWithReply($: any, turnId = 't1') {
  await $.turn.start({ text: 'go on', turnId })
  const step = $.turn.step({ turnId, index: 0, model: 'claude-sonnet-5-5', messageCount: 1 })
  for await (const _ of step) void _
  await step.result
}

async function endTurn($: any, turnId: string, reason: 'answer' | 'aborted' | 'error' = 'answer') {
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: reason === 'aborted', turnId, reason })
}

const bash = ($: any) => $.tool.call({ tool: 'Bash', command: 'ls' })

async function pane($: any, surface: 'terminal' | 'desktop' = 'terminal') {
  if (mounted !== undefined) await mounted.unmount()
  mounted = await $.ui.mount({ plugin: 'cache-context', surface, component: 'Pane', requestId: 'cache', props: PANE_PROPS })

  return mounted
}

/** Wraps up at 97% and ends the turn: the session is paused. */
async function pausedSession($: any, on: any, setup: Setup = {}) {
  const session = await guarded($, on, { percent: 97, ...setup })
  await turnWithReply($)
  await endTurn($, 't1')

  return session
}

test('below the threshold tools run as they are; at it each result asks Claude to wrap up', async ($, on) => {
  const { world } = await guarded($, on, { percent: 96 })
  await turnWithReply($)
  expect((await bash($)).context).toBeUndefined()

  world.percent = 97
  await turnWithReply($)
  const reminded = await bash($)
  expect(reminded.deny).toBeUndefined()
  expect(reminded.context).toEqual([WRAP_UP_REMINDER])
})

test('a guard left off never reminds, refuses or pauses', async ($, on) => {
  const { clock, world } = await guarded($, on, { percent: 99, store: { usageGuard: { isOn: false, threshold: 97 } } })
  await turnWithReply($)
  for (let i = 0; i < 12; i += 1) expect((await bash($)).deny).toBeUndefined()
  await endTurn($, 't1')
  await clock.advance(11 * MINUTE)
  expect(world.submitted).toHaveLength(0)
})

test('after eight tools since wrapping up began, the next is refused', async ($, on) => {
  await guarded($, on, { percent: 97 })
  await turnWithReply($)
  for (let i = 0; i < 8; i += 1) {
    const used = await bash($)
    expect(used.deny).toBeUndefined()
    expect(used.context).toEqual([WRAP_UP_REMINDER])
  }
  const refused = await bash($)
  expect(refused.deny).toContain('Write down the progress so far')
})

test('at 99% tools are refused at once', async ($, on) => {
  await guarded($, on, { percent: 99 })
  await turnWithReply($)
  expect((await bash($)).deny).toBeDefined()
})

test('the third refused call ends the turn', async ($, on) => {
  const { world } = await guarded($, on, { percent: 99 })
  await turnWithReply($)
  await bash($)
  await bash($)
  expect(world.aborted).toHaveLength(0)
  await bash($)
  expect(world.aborted).toEqual(['t1'])
})

test('the wrapped-up turn pauses, and the continue goes out 30 seconds after the reset', async ($, on) => {
  const { clock, world } = await pausedSession($, on)
  const ui = await pane($)
  expect(await ui.find({ type: 'Text', text: `Paused · continues at ${fmtClock(RESUME)} (in 10:30)` })).toBeDefined()
  expect(await ui.find({ key: 'guard-resume' })).toBeDefined()
  expect(await ui.find({ key: 'guard-cancel' })).toBeDefined()
  // Tools are Claude's again while paused.
  expect((await bash($)).context).toBeUndefined()

  await clock.advance(RESUME - START - SECOND)
  expect(world.submitted).toHaveLength(0)
  await clock.advance(2 * SECOND)
  expect(world.submitted).toEqual(['The five-hour usage limit has reset. Continue from where you paused.'])

  // The continue's turn answers: the pause is over, and the guard watches again.
  world.percent = 3
  await turnWithReply($, 't2')
  await endTurn($, 't2')
  expect(await (await pane($)).find({ type: 'Text', text: /5-hour 3%/ })).toBeDefined()
})

test('a refused continue is tried again after 5 seconds, then each minute, and gives up after five retries', { timeoutMs: 60_000 }, async ($, on) => {
  const { clock, world } = await pausedSession($, on)
  await clock.advance(RESUME - START + SECOND)
  expect(world.submitted).toHaveLength(1)
  const refuse = async (turnId: string) => {
    await $.turn.start({ text: '', turnId })
    await endTurn($, turnId, 'error')
  }

  await refuse('r1')
  await clock.advance(4 * SECOND)
  expect(world.submitted).toHaveLength(1)
  await clock.advance(2 * SECOND)
  expect(world.submitted).toHaveLength(2)

  for (let retry = 2; retry <= 5; retry += 1) {
    await refuse(`r${retry}`)
    await clock.advance(59 * SECOND)
    expect(world.submitted).toHaveLength(retry)
    await clock.advance(2 * SECOND)
    expect(world.submitted).toHaveLength(retry + 1)
  }

  await refuse('r6')
  await clock.advance(10 * MINUTE)
  expect(world.submitted).toHaveLength(6)
  const ui = await pane($)
  expect(await ui.find({ type: 'Text', text: 'The automatic continue failed; continue by hand' })).toBeDefined()
  expect(await ui.find({ key: 'guard-resume' })).toBeDefined()
})

test('the person\'s own message ends the pause and drops the planned continue', async ($, on) => {
  const { clock, world } = await pausedSession($, on)
  await $.prompt.submit({ text: 'never mind, I will take it from here', wait: false, origin: { kind: 'composer' } })
  await clock.advance(11 * MINUTE)
  expect(world.submitted).toEqual(['never mind, I will take it from here'])
})

test('a restart plans the continue of this session\'s pause again, and not another session\'s', async ($, on) => {
  const kept = { phase: 'paused', resetsAt: RESET, isWeekly: false, resumeAt: RESUME, resumeTries: 0 }
  const { clock, world } = await guarded($, on, { store: { usagePauses: { 'session-a': kept } } })
  const ui = await pane($)
  expect(await ui.find({ key: 'guard-cancel' })).toBeDefined()
  await clock.advance(11 * MINUTE)
  expect(world.submitted).toHaveLength(1)
})

test('another session\'s kept pause is not this one\'s to continue', async ($, on) => {
  const kept = { phase: 'paused', resetsAt: RESET, isWeekly: false, resumeAt: RESUME, resumeTries: 0 }
  const { clock, world } = await guarded($, on, { store: { usagePauses: { 'session-b': kept } } })
  await clock.advance(11 * MINUTE)
  expect(world.submitted).toHaveLength(0)
})

test('with the seven-day window used up there is no automatic continue, and the panel says why', async ($, on) => {
  const { clock, world } = await pausedSession($, on, { weekly: 100 })
  expect(await (await pane($)).find({ type: 'Text', text: 'Paused · the 7-day usage is used up; no automatic continue' })).toBeDefined()
  await clock.advance(11 * MINUTE)
  expect(world.submitted).toHaveLength(0)
})

test('with the continue switch off the pause waits for the person', async ($, on) => {
  const { clock, world } = await pausedSession($, on, { autoContinue: false })
  expect(await (await pane($)).find({ type: 'Text', text: `Paused · usage resets at ${fmtClock(RESET)}; continue by hand` })).toBeDefined()
  await clock.advance(11 * MINUTE)
  expect(world.submitted).toHaveLength(0)
})

test('"Not this time" lets the work go on until the window resets', async ($, on) => {
  const { world } = await guarded($, on, { percent: 97 })
  await turnWithReply($)
  const ui = await pane($)
  await ui.press({ key: 'guard-skip' })
  expect((await bash($)).context).toBeUndefined()
  world.percent = 98
  await turnWithReply($)
  for (let i = 0; i < 10; i += 1) expect((await bash($)).deny).toBeUndefined()
  await endTurn($, 't1')
  expect(await (await pane($)).find({ key: 'guard-cancel' })).toBeUndefined()
})

test('"Not this time" holds across a restart until the window resets', async ($, on) => {
  const { clock, world } = await guarded($, on, { percent: 97, store: { usageGuardSkip: RESET } })
  await turnWithReply($)
  expect((await bash($)).context).toBeUndefined()

  // Past the reset the guard watches again.
  await clock.advance(11 * MINUTE)
  await turnWithReply($, 't2')
  expect((await bash($)).context).toEqual([WRAP_UP_REMINDER])
  void world
})

test('"Stop now" ends the turn at once, and the session pauses', async ($, on) => {
  const { world } = await guarded($, on, { percent: 97 })
  await turnWithReply($)
  const ui = await pane($)
  expect(await ui.find({ type: 'Text', text: '8 more tool uses, then stopped (or at 99%)' })).toBeDefined()
  await bash($)
  expect(await ui.find({ type: 'Text', text: '7 more tool uses, then stopped (or at 99%)' })).toBeDefined()
  await ui.press({ key: 'guard-stop' })
  expect(world.aborted).toEqual(['t1'])
  expect((await bash($)).deny).toBeDefined()
  await endTurn($, 't1', 'aborted')
  expect(await (await pane($)).find({ key: 'guard-cancel' })).toBeDefined()
})

test('"Continue now" sends the continue before the reset', async ($, on) => {
  const { world } = await pausedSession($, on)
  await (await pane($)).press({ key: 'guard-resume' })
  expect(world.submitted).toHaveLength(1)
})

test('"Cancel continue" keeps the pause without sending anything', async ($, on) => {
  const { clock, world } = await pausedSession($, on)
  const ui = await pane($)
  await ui.press({ key: 'guard-cancel' })
  expect(await ui.find({ type: 'Text', text: `Paused · usage resets at ${fmtClock(RESET)}; continue by hand` })).toBeDefined()
  await clock.advance(11 * MINUTE)
  expect(world.submitted).toHaveLength(0)
})

test('the panel shows the usage and sets the threshold', async ($, on) => {
  await guarded($, on, { percent: 42 })
  await turnWithReply($)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await pane($, surface)
    expect(await ui.find({ key: 'guard-toggle' })).toBeDefined()
    expect(await ui.find({ key: 'guard-continue' })).toBeDefined()
  }
  const ui = await pane($)
  expect(await ui.find({ type: 'Text', text: `5-hour 42% · resets ${fmtClock(RESET)}` })).toBeDefined()
  await ui.press({ key: 'guard-down' })
  expect(await ui.find({ type: 'Text', text: '96%' })).toBeDefined()

  // Turned off, the section is its switch alone.
  await ui.press({ key: 'guard-toggle' })
  expect(await ui.find({ key: 'guard-continue' })).toBeUndefined()
  expect((await ui.find({ key: 'guard-toggle' }))?.text).toContain('Turn on')
})

test('the continue switch turns off and back on, apart from Claude Code\'s own setting', async ($, on) => {
  const { clock, world } = await pausedSession($, on)
  const ui = await pane($)
  expect(await ui.find({ type: 'Text', text: 'This switch is the mod\'s own, apart from "Continue automatically at usage limit" in /config.' })).toBeUndefined()

  await ui.press({ key: 'guard-cancel' })
  await ui.press({ key: 'guard-toggle' })
  await ui.press({ key: 'guard-toggle' })
  expect(await ui.find({ type: 'Text', text: 'This switch is the mod\'s own, apart from "Continue automatically at usage limit" in /config.' })).toBeDefined()
  await ui.press({ key: 'guard-continue' })
  expect((await ui.find({ key: 'guard-continue' }))?.text).toContain('Turn on')
  await ui.press({ key: 'guard-continue' })
  expect((await ui.find({ key: 'guard-continue' }))?.text).toContain('Turn off')
  expect(world.nativeContinue).toBe(true)

  // Back on, the next pause plans its continue again.
  await turnWithReply($, 't2')
  await endTurn($, 't2')
  await clock.advance(11 * MINUTE)
  expect(world.submitted).toHaveLength(1)
})

test('the band says the session is wrapping up, then paused until the continue', async ($, on) => {
  const { world } = await guarded($, on, { percent: 97 })
  await turnWithReply($)
  const props = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} }
  const band = () => $.ui.mount({ plugin: 'cache-context', surface: 'terminal', component: 'AbovePrompt', props })
  expect(await (await band()).find({ type: 'Text', text: '· usage 97%, wrapping up' })).toBeDefined()
  await endTurn($, 't1')
  expect(await (await band()).find({ type: 'Text', text: `Paused · continues at ${fmtClock(RESUME)} · cache` })).toBeDefined()
  void world
})
