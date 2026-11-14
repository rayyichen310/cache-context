import { expect, mock, test } from 'claude-code/testing'

import { economics, fmtRemaining, priceOf } from '../hooks/economics'
import { fmtClock } from '../hooks/limits'
import { resumedTtl } from '../hooks/model'

const MINUTE = 60_000
const START = 1_700_000_000_000
const COMMAND_SITE = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 80 } }

function usage(read: number, created: number, model = 'claude-sonnet-5-5') {
  return {
    input_tokens: 12,
    output_tokens: 300,
    cache_read_input_tokens: read,
    cache_creation_input_tokens: created,
    model,
  }
}

test('the break-even ping count follows the model and the TTL', () => {
  const none = { input: 0, output: 0 }
  expect(economics(priceOf('claude-fable-5-1')!, '5m', 100_000, none).maxPings).toBe(48)
  expect(economics(priceOf('claude-fable-5-1')!, '1h', 100_000, none).maxPings).toBe(78)
  expect(economics(priceOf('claude-opus-5-5')!, '5m', 100_000, none).maxPings).toBe(23)
  expect(economics(priceOf('claude-opus-5')!, '5m', 100_000, none).maxPings).toBe(11)
  expect(economics(priceOf('claude-haiku-4-5-20251001')!, '1h', 100_000, none).maxPings).toBe(18)
})

test('a ping that generates tokens is worth fewer repeats', () => {
  const price = priceOf('claude-fable-5-1')!
  const costs = economics(price, '5m', 100_000, { input: 20, output: 100 })
  expect(costs.maxPings).toBe(40)
  expect(Math.abs(costs.lapseUsd - 1.225) < 1e-9).toBe(true)
})

test('the countdown steps by minutes, five seconds, then seconds', () => {
  expect(fmtRemaining(52 * MINUTE)).toBe('52m')
  expect(fmtRemaining(4 * MINUTE + 33_000)).toBe('4:35')
  expect(fmtRemaining(41_200)).toBe('42s')
  expect(fmtRemaining(0)).toBe('expired')
})

test('a response starts the countdown and the cache goes cold at the TTL', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  mock.store(on)
  mock.env(on, {})
  on('session.usage', () => ({ value: { startedAt: START, context: { window: 1_000_000 }, rateLimits: [] } }))
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: 'hi', toolUses: [], stopReason: 'end_turn', usage: usage(0, 80_000) }
  })

  const step = $.turn.step({ turnId: 't1', index: 0, model: 'claude-sonnet-5-5', messageCount: 1 })
  for await (const _ of step) void _
  await step.result

  await clock.advance(2 * MINUTE)
  const warm = await $.command.run({ command: 'cache-status', args: '' })
  expect(warm.text).toContain('active, 3:00 left')
  expect(warm.text).toContain('5m (assumed)')
  expect(warm.text).toContain('80k tokens on claude-sonnet-5-5')

  await clock.advance(4 * MINUTE)
  const cold = await $.command.run({ command: 'cache-status', args: '' })
  expect(cold.text).toContain('not active (expired 60s ago)')
})

test('a subscription inside its plan is assumed to cache for the hour', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  mock.store(on)
  mock.env(on, {})
  on('session.usage', () => ({
    value: {
      startedAt: START,
      context: { window: 1_000_000 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 23.5 }],
    },
  }))
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: 'hi', toolUses: [], stopReason: 'end_turn', usage: usage(0, 80_000) }
  })

  const step = $.turn.step({ turnId: 't1', index: 0, model: 'claude-sonnet-5-5', messageCount: 1 })
  for await (const _ of step) void _
  await step.result

  await clock.advance(20 * MINUTE)
  const status = await $.command.run({ command: 'cache-status', args: '' })
  expect(status.text).toContain('active, 40m left')
  expect(status.text).toContain('1h (assumed)')
})

test('a model switch gives the lifetime Claude Code applies, and a cache counting down takes it at once', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  mock.store(on)
  mock.env(on, {})
  on('session.usage', () => ({ value: { startedAt: START, context: { window: 1_000_000 }, rateLimits: [] } }))
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: 'hi', toolUses: [], stopReason: 'end_turn', usage: usage(0, 80_000) }
  })
  on('classic.PostModelSwitch', (_, e) => e)

  const step = $.turn.step({ turnId: 't1', index: 0, model: 'claude-sonnet-5-5', messageCount: 1 })
  for await (const _ of step) void _
  await step.result
  const guessed = await $.command.run({ command: 'cache-status', args: '' })
  expect(guessed.text).toContain('5m (assumed)')

  await $.classic.PostModelSwitch({ from_model: 'claude-sonnet-5-5', to_model: 'claude-sonnet-5-5', cache_ttl: '1h' })
  await clock.advance(20 * MINUTE)
  const told = await $.command.run({ command: 'cache-status', args: '' })
  expect(told.text).toContain('active, 40m left')
  expect(told.text).toContain('1h (assumed)')
})

test('past the plan\'s usage the lifetime is five minutes whatever Claude Code said before', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  mock.store(on)
  mock.env(on, {})
  let percentUsed = 40
  on('session.usage', () => ({
    value: { startedAt: START, context: { window: 1_000_000 }, rateLimits: [{ kind: 'five_hour', percentUsed }] },
  }))
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: 'hi', toolUses: [], stopReason: 'end_turn', usage: usage(0, 80_000) }
  })
  on('classic.PostModelSwitch', (_, e) => e)

  // Before the first response there is no cache to correct: what was said is kept for it.
  await $.classic.PostModelSwitch({ from_model: 'claude-opus-5-5', to_model: 'claude-sonnet-5-5', cache_ttl: '1h' })
  percentUsed = 100
  const step = $.turn.step({ turnId: 't1', index: 0, model: 'claude-sonnet-5-5', messageCount: 1 })
  for await (const _ of step) void _
  await step.result

  await clock.advance(2 * MINUTE)
  const status = await $.command.run({ command: 'cache-status', args: '' })
  expect(status.text).toContain('active, 3:00 left')
  expect(status.text).toContain('5m (assumed)')
})

test('a resume between the two lifetimes takes the lifetime from Claude Code\'s verdict on the cache', async ($, on) => {
  mock.clock(on, { now: START })
  mock.store(on)
  mock.env(on, {})
  on('session.usage', () => ({ value: { startedAt: START, context: { window: 1_000_000 }, rateLimits: [] } }))
  on('classic.SessionStart', (_, e) => e)
  const resume = (isLikelyExpired: boolean) =>
    $.classic.SessionStart({
      source: 'resume',
      model: 'claude-sonnet-5-5',
      seconds_since_last_response: 600,
      context_tokens: 80_000,
      prompt_cache_likely_expired: isLikelyExpired,
    })

  await resume(false)
  const warm = await $.command.run({ command: 'cache-status', args: '' })
  expect(warm.text).toContain('active, 50m left')
  expect(warm.text).toContain('1h (assumed)')

  expect(resumedTtl(2 * MINUTE, false)).toBeUndefined()
  expect(resumedTtl(90 * MINUTE, true)).toBeUndefined()
  expect(resumedTtl(10 * MINUTE, undefined)).toBeUndefined()
  // Claude Code calls a transcript with no reply since its last compaction expired whatever the gap.
  expect(resumedTtl(10 * MINUTE, true)).toBeUndefined()
})

test('a resume Claude Code calls expired holds nothing to refresh and does not set the lifetime', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  mock.store(on)
  mock.env(on, {})
  // Before the first response after a restart there is no reading of the plan yet.
  let rateLimits: { kind: string; percentUsed: number }[] = []
  on('session.usage', () => ({ value: { startedAt: START, context: { window: 1_000_000 }, rateLimits } }))
  on('classic.SessionStart', (_, e) => e)
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: 'hi', toolUses: [], stopReason: 'end_turn', usage: usage(0, 80_000) }
  })

  // Resumed eleven minutes after a /compact, before any reply to the compacted conversation.
  await $.classic.SessionStart({
    source: 'resume',
    model: 'claude-opus-5-5',
    seconds_since_last_response: 660,
    context_tokens: 80_000,
    prompt_cache_likely_expired: true,
  })
  const resumed = await $.command.run({ command: 'cache-status', args: '' })
  expect(resumed.text).toContain('nothing cached yet')

  rateLimits = [{ kind: 'five_hour', percentUsed: 32 }]
  await clock.advance(2 * MINUTE)
  const step = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 1 })
  for await (const _ of step) void _
  await step.result

  const status = await $.command.run({ command: 'cache-status', args: '' })
  expect(status.text).toContain('active, 60m left')
  expect(status.text).toContain('1h (assumed)')
})

test('a ping is refused once the cache is cold and restarts the countdown while warm', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  mock.store(on)
  mock.env(on, { CLAUDE_CODE_PROMPT_CACHE_TTL: '5m' })
  let forks = 0
  on('model.fork', () => {
    forks += 1

    return { value: { isAnswered: true, text: 'ok', usage: { input_tokens: 25, output_tokens: 8, cache_read_input_tokens: 80_000, cache_creation_input_tokens: 0 } } }
  })
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: 'hi', toolUses: [], stopReason: 'end_turn', usage: usage(0, 80_000) }
  })

  const step = $.turn.step({ turnId: 't1', index: 0, model: 'claude-sonnet-5-5', messageCount: 1 })
  for await (const _ of step) void _
  await step.result

  await clock.advance(4 * MINUTE)
  const hit = await $.command.run({ command: 'cache-ping', args: '' })
  expect(hit.text).toContain('Cache refreshed: read 80k')
  expect(forks).toBe(1)

  await clock.advance(4 * MINUTE)
  const stillWarm = await $.command.run({ command: 'cache-status', args: '' })
  expect(stillWarm.text).toContain('active, 1:00 left')
  expect(stillWarm.text).toContain('5m (environment)')

  await clock.advance(2 * MINUTE)
  const refused = await $.command.run({ command: 'cache-ping', args: '' })
  expect(refused.text).toContain('Not sent: the cache is not active')
  expect(forks).toBe(1)
})

test('the band draws the countdown on the terminal and the desktop', { timeoutMs: 30_000 }, async ($, on) => {
  const clock = mock.clock(on, { now: START })
  mock.store(on)
  mock.env(on, { CLAUDE_CODE_PROMPT_CACHE_TTL: '1h' })
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: 'hi', toolUses: [], stopReason: 'end_turn', usage: usage(150_000, 30_000, 'claude-fable-5-1') }
  })
  // Stands for the engine's own, empty band beneath the plugin.
  on('ui.render', { component: 'AbovePrompt' }, (inner, e) => inner.ui.resolve(e).Box({}))

  const step = $.turn.step({ turnId: 't1', index: 0, model: 'claude-fable-5-1', messageCount: 1 })
  for await (const _ of step) void _
  await step.result
  await clock.advance(8 * MINUTE)

  const props = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} }
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'cache-context', surface, component: 'AbovePrompt', props })
    expect((await ui.find({ type: 'Text', text: '52m' }))?.props.bold).toBe(true)
    expect(await ui.find({ type: 'Text', text: /expires/ })).toBeUndefined()
    expect(await ui.find({ key: 'details' })).toBeDefined()
    // The terminal marks the cache and the two quick toggles with dots; the desktop draws all three.
    expect(await ui.findAll({ type: 'Text', text: '●' })).toHaveLength(surface === 'terminal' ? 3 : 0)
    // The desktop draws the lifetime left as a small ring; the terminal marks it with a dot.
    const drawings = await ui.findAll({ type: 'Svg' })
    expect(drawings).toHaveLength(surface === 'desktop' ? 3 : 0)
    if (surface === 'desktop') {
      expect(drawings[0]!.props.width).toBe(18)
      expect(String(drawings[0]!.props.source)).toContain('stroke-dasharray=')
    }
  }
})

const HOUR_ENV = { CLAUDE_CODE_PROMPT_CACHE_TTL: '1h' }

// Lines the transcript shows; lines sent to the debug log alone are left out.
const logged: string[] = []
const toasted: string[] = []
// Each value the mod's status line took, in order; undefined clears it.
const statuses: (string | undefined)[] = []

// Starts the session as the engine does, so the mod's timer and commands exist.
async function boot($: any, on: any, onInvalidate?: () => void) {
  logged.length = 0
  toasted.length = 0
  statuses.length = 0
  on('ui.status', (_: unknown, e: { text: string | undefined }) => {
    statuses.push(e.text)

    return { value: undefined }
  })
  on('prompt.submit', (_: unknown, e: { text: string }) => ({ text: e.text }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('command.register', (_: unknown, e: { name: string }) => ({ value: { command: e.name } }))
  on('ui.invalidate', () => {
    onInvalidate?.()

    return { value: undefined }
  })
  on('ui.panes', () => ({ value: [] }))
  on('ui.toast', (_: unknown, e: { text: string }) => {
    toasted.push(e.text)

    return { value: undefined }
  })
  on('ui.log', (_: unknown, e: { text: string; to: string }) => {
    if (e.to !== 'debug') logged.push(e.text)

    return { value: undefined }
  })
  on('session.id', () => ({ value: 'session-a' }))
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
}

function forkHit() {
  return { value: { isAnswered: true, text: 'ok', usage: { input_tokens: 40, output_tokens: 200, cache_read_input_tokens: 80_000, cache_creation_input_tokens: 0 } } }
}

// Figures from a real session: the last turn read 90,970 and wrote 1,291 with a 5,257-token reply,
// and every refresh after it read 92,261 and wrote those 5,257 again, as a five-minute entry: a refresh
// 25 seconds later read 97,518 and wrote nothing, one 6.9 minutes after that wrote the 5,257 again.
test('a refresh is priced with the last reply it writes to the cache again', { timeoutMs: 30_000 }, async ($, on) => {
  mock.clock(on, { now: START })
  mock.store(on)
  mock.env(on, HOUR_ENV)
  on('session.usage', usageWith([]))
  const model = 'claude-opus-5-5'
  on('turn.step', async function* (_, e) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: 'hi',
      toolUses: [],
      stopReason: 'end_turn',
      usage: { input_tokens: 2, output_tokens: 5_257, cache_read_input_tokens: 90_970, cache_creation_input_tokens: 1_291, model },
    }
  })
  on('model.fork', () => ({
    value: { isAnswered: true, text: 'ok', usage: { input_tokens: 40, output_tokens: 4, cache_read_input_tokens: 92_261, cache_creation_input_tokens: 5_257 } },
  }))
  await boot($, on)
  const step = $.turn.step({ turnId: 't1', index: 0, model, messageCount: 1 })
  for await (const _ of step) void _
  await step.result

  const ping = await $.command.run({ command: 'cache-ping', args: '' })
  expect(ping.text).toContain('$0.045')
  const status = await $.command.run({ command: 'cache-status', args: '' })
  // 92,261 read at 0.05 + 5,257 written at the five-minute 1.25 + 40 in + 4 out, at $4 / $20 per million.
  expect(status.text).toContain('  One refresh: about $0.045 (token overhead measured). Up to 16 in a row cost less than one rebuild')
})

test('the band and card distinguish a model switch from the lifetime running out', { timeoutMs: 30_000 }, async ($, on) => {
  const clock = mock.clock(on, { now: START })
  mock.store(on)
  mock.env(on, { CLAUDE_CODE_PROMPT_CACHE_TTL: '5m' })
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: 'hi', toolUses: [], stopReason: 'end_turn', usage: usage(0, 80_000) }
  })
  on('classic.PostModelSwitch', (_, e) => e)
  on('ui.render', { component: 'AbovePrompt' }, (inner, e) => inner.ui.resolve(e).Box({}))
  await boot($, on)

  const reply = async (turnId: string) => {
    const step = $.turn.step({ turnId, index: 0, model: 'claude-sonnet-5-5', messageCount: 1 })
    for await (const _ of step) void _
    await step.result
  }
  const bandProps = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} }
  const paneProps = { title: 'Prompt cache', isFocused: true, bodyColumns: 60, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} }
  const displays = async (head: string, other: string) => {
    for (const surface of ['terminal', 'desktop'] as const) {
      const band = await $.ui.mount({ plugin: 'cache-context', surface, component: 'AbovePrompt', props: bandProps })
      expect((await band.find({ type: 'Text', text: head }))?.props.bold).toBe(true)
      expect(await band.find({ type: 'Text', text: other })).toBeUndefined()
      await band.unmount()

      const pane = await $.ui.mount({ plugin: 'cache-context', surface, component: 'Pane', requestId: 'cache', props: paneProps })
      if (surface === 'desktop') {
        const card = String((await pane.findAll({ type: 'Svg' })).find(one => one.props.width === 238)!.props.source)
        expect(card).toContain(`>${head}</text>`)
        expect(card).not.toContain(`>${other}</text>`)
      } else {
        expect((await pane.find({ type: 'Text', text: head }))?.props.bold).toBe(true)
        expect(await pane.find({ type: 'Text', text: other })).toBeUndefined()
      }
      await pane.unmount()
    }
  }

  await reply('t1')
  await $.classic.PostModelSwitch({ from_model: 'claude-sonnet-5-5', to_model: 'claude-opus-5-5' })
  await displays('Unavailable', 'Expired')

  await reply('t2')
  await clock.advance(6 * MINUTE)
  await displays('Expired', 'Unavailable')
})

test('a small cache with no worthwhile refreshes explains the costs and plan', { timeoutMs: 30_000 }, async ($, on) => {
  mock.clock(on, { now: START })
  mock.store(on)
  mock.env(on, { CLAUDE_CODE_PROMPT_CACHE_TTL: '5m' })
  const model = 'claude-sonnet-5-5'
  const size = 1024
  const overhead = { input: 40, output: 600 }
  const costs = economics(priceOf(model)!, '5m', size, overhead)
  expect(costs.maxPings).toBe(0)
  expect(costs.pingUsd > costs.lapseUsd).toBe(true)
  on('model.fork', () => ({
    value: { isAnswered: true, text: 'ok', usage: { input_tokens: overhead.input, output_tokens: overhead.output, cache_read_input_tokens: size, cache_creation_input_tokens: 0 } },
  }))
  let next = usage(0, size, model)
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: 'hi', toolUses: [], stopReason: 'end_turn', usage: next }
  })
  on('ui.render', { component: 'AbovePrompt' }, (inner, e) => inner.ui.resolve(e).Box({}))
  await boot($, on)

  const reply = async (turnId: string) => {
    const step = $.turn.step({ turnId, index: 0, model, messageCount: 1 })
    for await (const _ of step) void _
    await step.result
  }
  await reply('t1')
  await $.command.run({ command: 'cache-ping', args: '' })
  // A new message resets the count while keeping the measured request overhead.
  next = usage(size, 0, model)
  await reply('t2')
  const enabled = await $.command.run({ command: 'cache-auto', args: 'on' })
  expect(enabled.text).toContain('  Auto-refresh: on (limit 12), but not sending: a refresh would cost more than an expiry adds for this cache')

  const bandProps = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} }
  const band = await $.ui.mount({ plugin: 'cache-context', surface: 'desktop', component: 'AbovePrompt', props: bandProps })
  expect(await band.find({ type: 'Text', text: /cached/ })).toBeUndefined()
  expect(JSON.stringify(await band.drawn())).not.toContain('0/0')
  await band.unmount()

  const props = { title: 'Prompt cache', isFocused: true, bodyColumns: 60, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} }
  const term = await $.ui.mount({ plugin: 'cache-context', surface: 'terminal', component: 'Pane', requestId: 'cache', props })
  expect(await term.find({ type: 'Text', text: 'Refreshing costs more than rebuilding here' })).toBeDefined()
  expect(await term.find({ type: 'Text', text: /0 refreshes/ })).toBeUndefined()
  expect(await term.find({ type: 'Text', text: 'Not worth it for this cache' })).toBeDefined()
  expect(await term.find({ type: 'Text', text: 'None left until next message' })).toBeUndefined()
  await term.unmount()

  const desk = await $.ui.mount({ plugin: 'cache-context', surface: 'desktop', component: 'Pane', requestId: 'cache', props })
  const drawings = await desk.findAll({ type: 'Svg' })
  const card = String(drawings.filter(one => one.props.height === 94).at(-1)!.props.source)
  expect(card).toContain('>Refreshing costs more than rebuilding here</text>')
  expect(card).not.toContain('0 refreshes')
  const drawn = drawings.map(one => String(one.props.source)).join('\n')
  expect(drawn).toContain('>Not worth it for this cache</text>')
  expect(drawn).not.toContain('None left until next message')
  await desk.unmount()

  const status = await $.command.run({ command: 'cache-status', args: '' })
  expect(status.text).toContain('  Auto-refresh: on (limit 12), but not sending: a refresh would cost more than an expiry adds for this cache')
  expect(status.text).not.toContain('0 of 0')
  expect(status.text).not.toContain('used up')
  expect(status.text).not.toContain('  Effect:')
  expect(status.text).toContain('  One refresh: about $0.0070 (token overhead measured). That is more than an expiry would add, so refreshing does not pay off')
  expect(status.text).not.toContain('Up to 0 in a row')
  expect(status.text).not.toContain('Rule of thumb')
})

test('auto keep-alive stays off until it is turned on', { timeoutMs: 30_000 }, async ($, on) => {
  const clock = mock.clock(on, { now: START })
  mock.store(on)
  mock.env(on, HOUR_ENV)
  let forks = 0
  on('model.fork', () => {
    forks += 1

    return forkHit()
  })
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: 'hi', toolUses: [], stopReason: 'end_turn', usage: usage(0, 80_000) }
  })

  await boot($, on)
  const step = $.turn.step({ turnId: 't1', index: 0, model: 'claude-sonnet-5-5', messageCount: 1 })
  for await (const _ of step) void _
  await step.result
  await clock.advance(120 * MINUTE)

  expect(forks).toBe(0)
  const status = await $.command.run({ command: 'cache-status', args: '' })
  expect(status.text).toContain('Auto-refresh: off')
})

test('the auto-refresh setting is kept for the next start', async ($, on) => {
  mock.clock(on, { now: START })
  const kept = new Map<string, unknown>()
  on('store.get', (_: unknown, e: { key: string }) => ({ value: kept.get(e.key) }))
  on('store.set', (_: unknown, e: { key: string; value: unknown }) => {
    kept.set(e.key, e.value)

    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...kept.keys()] }))
  mock.env(on, HOUR_ENV)
  on('session.usage', () => ({ value: { startedAt: START, context: { window: 1_000_000 }, rateLimits: [] } }))

  await boot($, on)
  await $.command.run({ command: 'cache-auto', args: 'on 5' })
  expect(kept.get('auto')).toEqual({ isOn: true, cap: 5, trim: false, trimFrom: 2000 })
  await $.command.run({ command: 'cache-auto', args: 'off' })
  expect(kept.get('auto')).toEqual({ isOn: false, cap: 5, trim: false, trimFrom: 2000 })
})

test('a kept auto-refresh setting is in force from the start', async ($, on) => {
  mock.clock(on, { now: START })
  mock.store(on, { auto: { isOn: true, cap: 5 } })
  mock.env(on, HOUR_ENV)
  on('session.usage', () => ({ value: { startedAt: START, context: { window: 1_000_000 }, rateLimits: [] } }))

  await boot($, on)
  const status = await $.command.run({ command: 'cache-auto', args: '' })
  expect(status.text).toContain('Auto-refresh: on, up to 5 per idle period')
})

test('a kept auto-refresh setting of the wrong shape leaves it off', async ($, on) => {
  mock.clock(on, { now: START })
  mock.store(on, { auto: { isOn: 'yes', cap: 500 } })
  mock.env(on, HOUR_ENV)
  on('session.usage', () => ({ value: { startedAt: START, context: { window: 1_000_000 }, rateLimits: [] } }))

  await boot($, on)
  const status = await $.command.run({ command: 'cache-auto', args: '' })
  expect(status.text).toContain('Auto-refresh: off')
})

test('auto sends one ping per idle stretch until a ping is proven to extend the cache', { timeoutMs: 30_000 }, async ($, on) => {
  const clock = mock.clock(on, { now: START })
  mock.store(on)
  mock.env(on, HOUR_ENV)
  on('session.usage', usageWith([]))
  let forks = 0
  on('model.fork', () => {
    forks += 1

    return forkHit()
  })
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: 'hi', toolUses: [], stopReason: 'end_turn', usage: usage(0, 80_000) }
  })

  await boot($, on)
  const step = $.turn.step({ turnId: 't1', index: 0, model: 'claude-sonnet-5-5', messageCount: 1 })
  for await (const _ of step) void _
  await step.result
  const turnedOn = await $.command.run({ command: 'cache-auto', args: 'on' })
  expect(turnedOn.text).toContain('on, 0 of 1 used')
  expect(turnedOn.text).toContain('not confirmed yet')

  await clock.advance(54 * MINUTE)
  expect(forks).toBe(0)
  await clock.advance(2 * MINUTE)
  expect(forks).toBe(1)
  await clock.advance(120 * MINUTE)
  expect(forks).toBe(1)
  // A refresh that worked replaces the status line instead of adding a transcript line each time.
  expect(logged).toHaveLength(0)
  expect(statuses.at(-1)).toContain('Auto-refresh 1/1. Cache refreshed: read 80k')
  // The person's next message clears it.
  await $.prompt.submit({ text: 'back', wait: false, origin: { kind: 'composer' } })
  expect(statuses.at(-1)).toBeUndefined()
})

// A refresh the API refused for the plan's usage.
function forkRateLimited() {
  return { value: { isAnswered: false, reason: 'api-error', error: 'rate_limit', status: 429 } }
}

function usageWith(rateLimits: unknown[]) {
  return () => ({ value: { startedAt: START, context: { window: 1_000_000 }, rateLimits } })
}

async function idleAfterOneTurn($: any, on: any) {
  on('turn.step', async function* (_: unknown, e: any) {
    return { turnId: e.turnId, index: e.index, answer: 'hi', toolUses: [], stopReason: 'end_turn', usage: usage(0, 80_000) }
  })
  await boot($, on)
  const step = $.turn.step({ turnId: 't1', index: 0, model: 'claude-sonnet-5-5', messageCount: 1 })
  for await (const _ of step) void _
  await step.result
  await $.command.run({ command: 'cache-auto', args: 'on 3' })
}

test('a refresh refused at the usage limit is not retried before the limit resets', { timeoutMs: 30_000 }, async ($, on) => {
  const clock = mock.clock(on, { now: START })
  mock.store(on)
  mock.env(on, HOUR_ENV)
  on('session.usage', usageWith([{ kind: 'five_hour', percentUsed: 99.5, resetsAt: new Date(START + 180 * MINUTE).toISOString() }]))
  let forks = 0
  on('model.fork', () => {
    forks += 1

    return forkRateLimited()
  })
  on('ui.render', { component: 'AbovePrompt' }, (inner, e) => inner.ui.resolve(e).Box({}))
  await idleAfterOneTurn($, on)

  await clock.advance(54 * MINUTE)
  expect(forks).toBe(0)
  // The whole lead window and past the cache's end: one try, one line, no toast.
  await clock.advance(10 * MINUTE)
  expect(forks).toBe(1)
  expect(logged).toHaveLength(1)
  expect(toasted).toHaveLength(0)

  // The band's refresh toggle turns amber and names the reset it waits for.
  const props = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} }
  const band = await $.ui.mount({ plugin: 'cache-context', surface: 'desktop', component: 'AbovePrompt', props })
  expect((await band.find({ key: 'quick-refresh' }))?.text).toContain(`Refresh ${fmtClock(START + 180 * MINUTE)}`)
  expect((await band.findAll({ type: 'Svg' })).find((one: any) => one.props.alt === 'busy')).toBeDefined()
})

test('a refresh refused at the usage limit resumes once the limit resets before the cache ends', { timeoutMs: 30_000 }, async ($, on) => {
  const clock = mock.clock(on, { now: START })
  mock.store(on, { pingExtends: { '1h': true } })
  mock.env(on, HOUR_ENV)
  on('session.usage', usageWith([{ kind: 'five_hour', percentUsed: 99.5, resetsAt: new Date(START + 57 * MINUTE).toISOString() }]))
  let forks = 0
  on('model.fork', () => {
    forks += 1

    return forks === 1 ? forkRateLimited() : forkHit()
  })
  await idleAfterOneTurn($, on)

  await clock.advance(56 * MINUTE)
  expect(forks).toBe(1)
  await clock.advance(MINUTE / 2)
  expect(forks).toBe(1)
  await clock.advance(MINUTE)
  expect(forks).toBe(2)
  // The refused try did not use up one of the three.
  const status = await $.command.run({ command: 'cache-status', args: '' })
  expect(status.text).toContain('on, 1 of 3 used')
})

test('a refresh known to be past the usage limit is not sent at all', { timeoutMs: 30_000 }, async ($, on) => {
  const clock = mock.clock(on, { now: START })
  mock.store(on)
  mock.env(on, HOUR_ENV)
  on('session.usage', usageWith([{ kind: 'five_hour', percentUsed: 100, resetsAt: new Date(START + 180 * MINUTE).toISOString() }]))
  let forks = 0
  on('model.fork', () => {
    forks += 1

    return forkHit()
  })
  await idleAfterOneTurn($, on)

  await clock.advance(64 * MINUTE)
  expect(forks).toBe(0)
  expect(logged).toHaveLength(1)
  expect(toasted).toHaveLength(0)
})

test('any other failed refresh counts as one and waits a minute before the next', { timeoutMs: 30_000 }, async ($, on) => {
  const clock = mock.clock(on, { now: START })
  mock.store(on, { pingExtends: { '1h': true } })
  mock.env(on, HOUR_ENV)
  on('session.usage', usageWith([]))
  let forks = 0
  on('model.fork', () => {
    forks += 1

    return { value: { isAnswered: false, reason: 'api-error', error: 'overloaded_error', status: 529 } }
  })
  await idleAfterOneTurn($, on)

  await clock.advance(55 * MINUTE + 1000)
  expect(forks).toBe(1)
  await clock.advance(MINUTE - 5000)
  expect(forks).toBe(1)
  await clock.advance(10_000)
  expect(forks).toBe(2)
  // Three tries spend the cap of three; none follows.
  await clock.advance(2 * MINUTE)
  expect(forks).toBe(3)
  expect(logged).toHaveLength(3)
})

test('a hit past the turn\'s own lifetime proves pings and unlocks the chain up to the cap', { timeoutMs: 60_000 }, async ($, on) => {
  const clock = mock.clock(on, { now: START })
  mock.store(on)
  mock.env(on, HOUR_ENV)
  on('session.usage', usageWith([]))
  let forks = 0
  on('model.fork', () => {
    forks += 1

    return forkHit()
  })
  let next = usage(0, 80_000)
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: 'hi', toolUses: [], stopReason: 'end_turn', usage: next }
  })

  await boot($, on)
  const first = $.turn.step({ turnId: 't1', index: 0, model: 'claude-sonnet-5-5', messageCount: 1 })
  for await (const _ of first) void _
  await first.result
  await $.command.run({ command: 'cache-auto', args: 'on 3' })

  // Idle past the hour: one ping at 55 minutes, then the person returns at 70 and the turn hits.
  await clock.advance(70 * MINUTE)
  expect(forks).toBe(1)
  next = usage(80_000, 500)
  const second = $.turn.step({ turnId: 't2', index: 0, model: 'claude-sonnet-5-5', messageCount: 3 })
  for await (const _ of second) void _
  await second.result
  const proven = await $.command.run({ command: 'cache-status', args: '' })
  expect(proven.text).toContain('confirmed, a refresh restores the full 1h')
  expect(proven.text).toContain('on, 0 of 3 used')

  // Idle again: the chain runs to the cap and stops there.
  for (let hour = 0; hour < 6; hour += 1) await clock.advance(60 * MINUTE)
  expect(forks).toBe(4)
  const spent = await $.command.run({ command: 'cache-status', args: '' })
  expect(spent.text).toContain('Prompt cache: not active')
})

test('the mod speaks Chinese when the person pins it, in the report and the band', { timeoutMs: 30_000 }, async ($, on) => {
  const clock = mock.clock(on, { now: START })
  mock.store(on, { lang: 'zh' })
  mock.env(on, HOUR_ENV)
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: 'hi', toolUses: [], stopReason: 'end_turn', usage: usage(150_000, 30_000, 'claude-fable-5-1') }
  })
  on('ui.render', { component: 'AbovePrompt' }, (inner, e) => inner.ui.resolve(e).Box({}))

  const step = $.turn.step({ turnId: 't1', index: 0, model: 'claude-fable-5-1', messageCount: 1 })
  for await (const _ of step) void _
  await step.result
  await clock.advance(8 * MINUTE)

  const status = await $.command.run({ command: 'cache-status', args: '' })
  expect(status.text).toContain('提示缓存：有效，剩余 52 分钟。')
  expect(status.text).toContain('有效期：1 小时（环境变量）')
  expect(status.text).toContain('自动续期：已关闭')

  const props = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} }
  const ui = await $.ui.mount({ plugin: 'cache-context', surface: 'desktop', component: 'AbovePrompt', props })
  expect((await ui.find({ type: 'Text', text: '52m' }))?.props.bold).toBe(true)
  expect(await ui.find({ type: 'Text', text: /过期/ })).toBeUndefined()
  expect((await ui.find({ key: 'details' }))?.text).toContain('详情')
})

test('the language follows the locale until /cache-lang pins another', async ($, on) => {
  mock.clock(on, { now: START })
  mock.store(on)
  mock.env(on, { LANG: 'zh_CN.UTF-8' })
  on('ui.invalidate', () => ({ value: undefined }))

  const detected = await $.command.run({ command: 'cache-lang', args: '' })
  expect(detected.text).toBe('显示语言：中文（跟随系统）。')
  const pinned = await $.command.run({ command: 'cache-lang', args: 'en' })
  expect(pinned.text).toBe('Language: English (manual).')
  const status = await $.command.run({ command: 'cache-status', args: '' })
  expect(status.text).toContain('Prompt cache: nothing cached yet')
  const back = await $.command.run({ command: 'cache-lang', args: 'auto' })
  expect(back.text).toBe('显示语言：中文（跟随系统）。')
})

test('the panel draws the dial, sets a lapse against a ping, and its buttons drive the keep-alive', { timeoutMs: 30_000 }, async ($, on) => {
  const clock = mock.clock(on, { now: START })
  mock.store(on)
  mock.env(on, HOUR_ENV)
  on('ui.invalidate', () => ({ value: undefined }))
  on('model.fork', () => ({
    value: { isAnswered: true, text: 'ok', usage: { input_tokens: 40, output_tokens: 200, cache_read_input_tokens: 180_000, cache_creation_input_tokens: 0 } },
  }))
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: 'hi', toolUses: [], stopReason: 'end_turn', usage: usage(150_000, 30_000, 'claude-fable-5-1') }
  })

  const step = $.turn.step({ turnId: 't1', index: 0, model: 'claude-fable-5-1', messageCount: 1 })
  for await (const _ of step) void _
  await step.result
  await clock.advance(8 * MINUTE)

  const props = { title: 'Prompt cache', isFocused: true, bodyColumns: 60, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} }

  // The terminal: words and rules of cells, no drawings.
  const term = await $.ui.mount({ plugin: 'cache-context', surface: 'terminal', component: 'Pane', requestId: 'cache', props })
  expect(await term.findAll({ type: 'Svg' })).toHaveLength(0)
  expect((await term.find({ type: 'Text', text: '52m' }))?.props.bold).toBe(true)
  expect(await term.find({ type: 'Text', text: 'left · 180k tokens cached' })).toBeDefined()
  expect(await term.find({ type: 'Text', text: '$3.60' })).toBeDefined()
  // A ping also writes the 300-token last reply again, as a five-minute entry.
  expect(await term.find({ type: 'Text', text: '$0.052' })).toBeDefined()
  expect(await term.find({ type: 'Text', text: '68 refreshes ≈ 1 rebuild' })).toBeDefined()
  // Until a ping is proven to buy a full hour, the plan is one trial ping, then the cap beside it.
  expect(await term.find({ type: 'Text', text: '1 trial, up to 12 if it works' })).toBeDefined()

  // Switched on, the caption turns from what is cached to what the plan will do.
  await term.press({ key: 'auto-toggle' })
  expect((await term.find({ key: 'auto-toggle' }))?.text).toContain('Turn off')
  expect(await term.find({ type: 'Text', text: 'refreshes in 47m · up to ~1.8h' })).toBeDefined()
  expect(await term.find({ type: 'Text', text: 'Trial 0/1, up to 12 if it works' })).toBeDefined()
  await term.press({ key: 'cap-up' })
  expect(await term.find({ type: 'Text', text: '13' })).toBeDefined()
  // Beneath it, the long-reply switch with its threshold, off until pressed.
  expect(await term.find({ type: 'Text', text: 'Message if reply ≥ 2k (300)' })).toBeDefined()
  expect((await term.find({ key: 'trim-toggle' }))?.text).toContain('Turn on')
  await term.press({ key: 'trim-toggle' })
  expect((await term.find({ key: 'trim-toggle' }))?.text).toContain('Turn off')
  await term.press({ key: 'trim-toggle' })

  // A ping from the panel restarts the hour and spends the one unproven ping.
  await term.press({ key: 'ping' })
  expect((await term.find({ type: 'Text', text: /Cache refreshed/ }))?.text).toContain('Cache refreshed: read 180k, wrote 0, 40 in, 200 out.')
  expect(await term.find({ type: 'Text', text: 'Last request hit' })).toBeDefined()
  expect((await term.find({ type: 'Text', text: '60m' }))?.props.bold).toBe(true)
  expect(await term.find({ type: 'Text', text: 'None left until next message' })).toBeDefined()
  await term.press({ key: 'auto-toggle' })
  await term.press({ key: 'cap-down' })

  // The desktop: everything that is read is drawn in one type, at the sizes measured on the app; only buttons are the app's own.
  const desk = await $.ui.mount({ plugin: 'cache-context', surface: 'desktop', component: 'Pane', requestId: 'cache', props })
  const drawings = await desk.findAll({ type: 'Svg' })
  // Three drawings for the card instead of one, the same seven for the controls and footer, then the usage guard's rule and title.
  expect(drawings).toHaveLength(12)
  expect(drawings[0]!.props.width).toBe(60)
  expect(drawings[0]!.props.height).toBe(60)
  expect(String(drawings[0]!.props.source)).not.toContain('<text')
  const card = String(drawings[1]!.props.source)
  expect(drawings[1]!.props.width).toBe(238)
  expect(drawings[1]!.props.height).toBe(62)
  expect(card).toContain('>60m</text>')
  expect(card).toContain('>left · 180k tokens cached</text>')
  expect(card).toContain('<text x="0" y="31"')
  expect(card).toContain('<text x="0" y="56"')
  const comparison = String(drawings[2]!.props.source)
  expect(drawings[2]!.props.width).toBe(314)
  expect(drawings[2]!.props.height).toBe(94)
  expect(comparison).toContain('>$3.60</text>')
  // The terminal's ping measured what a ping really adds, so the figures now use that.
  expect(comparison).toContain('>$0.059</text>')
  expect(comparison).toContain('>60 refreshes ≈ 1 rebuild</text>')
  expect(comparison).toContain('<text x="0" y="35"')
  expect(comparison).toContain('<text x="0" y="63"')
  expect(comparison).toContain('<text x="0" y="88"')
  // The words follow the person's light or dark appearance from inside the drawing.
  expect(card).toContain('@media (prefers-color-scheme: dark)')
  const drawn = drawings.map(one => String(one.props.source)).join('\n')
  expect(drawn).toContain('>Auto-refresh while away</text>')
  expect(drawn).toContain('>None left until next message</text>')
  expect(drawn).toContain('>12</text>')
  expect(drawn).toContain('>Message if reply ≥ 2k (300)</text>')
  expect(drawn).toContain('>Last request hit</text>')
  expect(drawn).toContain('>Estimates at API list prices</text>')
  // Every drawing says what it is: one without an alt is not drawn.
  expect(drawings.every(one => String(one.props.alt).length > 0)).toBe(true)
  // Every drawing is an image: the desktop rebuilds a site at each change, and a sandboxed frame would blink.
  expect(drawings.every(one => one.props.isInteractive !== true)).toBe(true)
  // The panel keeps a docked pane's width however wide the pane is.
  expect((await desk.drawn()).props.width).toBe(42)
  expect((await desk.find({ key: 'auto-toggle' }))?.text).toContain('Turn on')
  expect((await desk.find({ key: 'cap-down' }))?.props.variant).toBe('secondary')
})

test('with nothing pinned, the mod follows the language Claude replies in', async ($, on) => {
  mock.clock(on, { now: START })
  mock.store(on)
  mock.env(on, { ...HOUR_ENV, LANG: 'en_US.UTF-8' })
  on('ui.invalidate', () => ({ value: undefined }))
  let answer = ''
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer, toolUses: [], stopReason: 'end_turn', usage: usage(150_000, 30_000, 'claude-fable-5-1') }
  })
  let turns = 0
  const reply = async (text: string) => {
    answer = text
    turns += 1
    const step = $.turn.step({ turnId: `t${turns}`, index: 0, model: 'claude-fable-5-1', messageCount: turns })
    for await (const _ of step) void _
    await step.result
  }
  const lang = async () => (await $.command.run({ command: 'cache-lang', args: '' })).text

  // Before Claude has said anything there is only the locale to go on.
  expect(await lang()).toBe('Language: English (matches your system).')

  // One reply in Chinese is enough, file names and all.
  await reply('新版本已经在跑了：它刚刚记录了你这条消息触发的请求，说明重载后的代码在正常工作。界面我这边看不到，需要你看 register.tsx 和 views.ts 的效果。')
  expect(await lang()).toBe('显示语言：中文（跟随对话）。')
  expect((await $.command.run({ command: 'cache-status', args: '' })).text).toContain('提示缓存：有效')

  // Code says nothing about the language, and neither does a reply of a few words.
  await reply('```ts\nconst remaining = held.touchedAt + TTL_MS[held.ttl] - now\nif (remaining <= PING_MARGIN_MS) return refuse(held)\n```\n好了。')
  await reply('ok')
  expect(await lang()).toBe('显示语言：中文（跟随对话）。')

  // One reply in English does not turn a Chinese conversation; a second one does.
  const english = 'Each request that hits the cache restarts its lifetime, so the countdown starts over after every message you send.'
  await reply(english)
  expect(await lang()).toBe('显示语言：中文（跟随对话）。')
  await reply(english)
  expect(await lang()).toBe('Language: English (matches the conversation).')

  // A pin outranks what is heard, and going back to auto picks up where the conversation is.
  expect((await $.command.run({ command: 'cache-lang', args: 'zh' })).text).toBe('显示语言：中文（手动设置）。')
  await reply(english)
  expect(await lang()).toBe('显示语言：中文（手动设置）。')
  expect((await $.command.run({ command: 'cache-lang', args: 'auto' })).text).toBe('Language: English (matches the conversation).')
})

test('a new session starts in the language the last one was following', async ($, on) => {
  mock.clock(on, { now: START })
  mock.store(on, { langHeard: 'zh' })
  mock.env(on, { LANG: 'en_US.UTF-8' })
  on('ui.invalidate', () => ({ value: undefined }))

  expect((await $.command.run({ command: 'cache-lang', args: '' })).text).toBe('显示语言：中文（跟随对话）。')
})

test('the drawings move when the cache\'s state does, and a redraw carries a movement on', { timeoutMs: 30_000 }, async ($, on) => {
  const clock = mock.clock(on, { now: START })
  mock.store(on)
  mock.env(on, HOUR_ENV)
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.open', () => ({ value: undefined }))
  let answer: (() => void) | undefined
  on('model.fork', async () => {
    await new Promise<void>(resolve => {
      answer = resolve
    })

    return { value: { isAnswered: true, text: 'ok', usage: { input_tokens: 40, output_tokens: 200, cache_read_input_tokens: 180_000, cache_creation_input_tokens: 0 } } }
  })
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: 'hi', toolUses: [], stopReason: 'end_turn', usage: usage(150_000, 30_000, 'claude-fable-5-1') }
  })
  on('ui.render', { component: 'AbovePrompt' }, (inner, e) => inner.ui.resolve(e).Box({}))

  const props = { title: 'Prompt cache', isFocused: true, bodyColumns: 60, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} }
  const card = async () => {
    const pane = await $.ui.mount({ plugin: 'cache-context', surface: 'desktop', component: 'Pane', requestId: 'cache', props })
    const drawings = await pane.findAll({ type: 'Svg' })
    const source = {
      ring: String(drawings.filter(one => one.props.width === 60).at(-1)!.props.source),
      figure: String(drawings.find(one => one.props.width === 238)!.props.source),
      costs: String(drawings.filter(one => one.props.height === 94).at(-1)!.props.source),
    }
    await pane.unmount()

    return source
  }
  const bandProps = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} }
  // What the band draws at this moment: its head's color, its ring, and what sits before the way into the panel.
  const band = async (head: string) => {
    const ui = await $.ui.mount({ plugin: 'cache-context', surface: 'desktop', component: 'AbovePrompt', props: bandProps })
    // The row that wraps the band's parts, wherever the engine nests the hooks' trees around it.
    const stripOf = (node: any): any => (node?.props?.flexWrap !== undefined ? node : (node?.children ?? []).map(stripOf).find(Boolean))
    const strip = stripOf(await ui.drawn())
    const seen = {
      color: (await ui.find({ type: 'Text', text: head }))?.props.color,
      ring: String((await ui.findAll({ type: 'Svg' })).filter(one => one.props.width === 18).at(-1)!.props.source),
      beforeDetails: strip?.children.at(-2)?.props.flexGrow,
    }
    await ui.unmount()

    return seen
  }

  const step = $.turn.step({ turnId: 't1', index: 0, model: 'claude-fable-5-1', messageCount: 1 })
  for await (const _ of step) void _
  await step.result

  // A response has just filled the cache: the ring sweeps up from empty and lets one ripple go.
  let drawn = await card()
  expect(drawn.ring).toContain('<animate attributeName="stroke-dasharray" values="0.00 144.51;144.49 144.51;0.00 144.51"')
  expect(drawn.ring).toContain('<animate attributeName="r" values="23;23;26.90"')
  const firstCard = drawn

  // Nothing has changed since: each draw shows the arc where it now stands, burning down, and nothing else moves.
  await clock.advance(8 * MINUTE)
  drawn = await card()
  expect(drawn.ring).toContain('from="125.24 144.51" to="0.00 144.51" dur="3120.000s" begin="0s" calcMode="linear"')
  expect(drawn.ring).not.toContain('values="0.00 144.51;')
  expect(drawn.ring).not.toContain('<animate attributeName="r"')
  expect(drawn.costs).toBe(firstCard.costs)
  expect(drawn.figure).not.toBe(firstCard.figure)
  expect(drawn.figure).toContain('>52m</text>')
  expect((await band('52m')).ring).toContain('dur="3120.000s" begin="0s" calcMode="linear"')

  // Opening the panel draws the ring from nothing and grows the two bars one after the other.
  await $.command.run({ command: 'cache-panel', args: '' })
  await clock.advance(200)
  drawn = await card()
  expect(drawn.ring).toContain('<animate attributeName="stroke-dasharray" values="0.00 144.51;')
  expect(drawn.ring).not.toContain('<animate attributeName="r"')
  expect(drawn.costs.match(/<animate attributeName="width"/g)).toHaveLength(2)
  // The entrance runs from the draw that first shows it, however long the panel took to appear.
  expect(drawn.ring).not.toContain('begin="-')
  expect(drawn.costs).not.toContain('begin="-')
  // A redraw partway through carries the entrance on from where it stands.
  await clock.advance(300)
  drawn = await card()
  expect(drawn.ring).toContain('<animate attributeName="stroke-dasharray" values="0.00 144.51;')
  expect(drawn.ring).toContain('begin="-0.300s" calcMode="spline"')
  expect(drawn.costs.match(/<animate attributeName="width"[^>]*begin="-0.300s"/g)).toHaveLength(2)
  // Once it has played, the drawings are still again.
  await clock.advance(2000)
  drawn = await card()
  expect(drawn.ring).not.toContain('values="0.00 144.51;')
  expect(drawn.costs).toBe(firstCard.costs)

  // In its last fifth with no keep-alive to come, the ring is two minutes into its breath and the band's words warn.
  await clock.advance(42 * MINUTE - 2500)
  drawn = await card()
  expect(drawn.ring).toContain('<animate attributeName="opacity" values="1;0.45;1"')
  expect(drawn.ring).toContain('dur="1.800s" begin="-120.000s" end="600.000s"')
  expect((await band('10m')).color).toBe('warning')

  // With a keep-alive to come it is calm, and a stud marks where the arc will stand when the ping goes out.
  await $.command.run({ command: 'cache-auto', args: 'on' })
  drawn = await card()
  expect(drawn.ring).not.toContain('values="1;0.45;1"')
  expect(drawn.ring).toContain('fill="#FFFFFF"')
  expect(drawn.costs).toBe(firstCard.costs)
  const savedBand = await band('10m')
  expect(savedBand.ring).not.toContain('values="1;0.45;1"')
  expect(savedBand.color).toBeUndefined()
  await $.command.run({ command: 'cache-auto', args: 'off' })

  // While a ping is out a lit stretch travels the ring; when it lands the arc sweeps back from where it stood.
  const sent = $.command.run({ command: 'cache-ping', args: '' })
  while (answer === undefined) await new Promise(resolve => setTimeout(resolve, 1))
  drawn = await card()
  expect(drawn.ring).toContain('<animateTransform attributeName="transform" type="rotate"')
  expect(drawn.figure).toContain('>Refreshing…</text>')
  expect(drawn.ring).not.toContain('values="1;0.45;1"')
  expect((await band('10m')).ring).toContain('<animateTransform')
  // A redraw while it is out finds the lit stretch where it has got to.
  await clock.advance(400)
  expect((await card()).ring).toContain('dur="1.100s" begin="-0.400s" repeatCount="indefinite"')
  answer()
  await sent
  drawn = await card()
  expect(drawn.ring).not.toContain('<animateTransform')
  expect(drawn.ring).toContain('<animate attributeName="stroke-dasharray" values="24.07 144.51;144.47 144.51;0.00 144.51"')
  expect(drawn.ring).toContain('<animate attributeName="r" values="23;23;26.90"')
  const after = await band('60m')
  expect(after.ring).not.toContain('<animateTransform')
  expect(after.ring).toContain('<animate attributeName="stroke-dasharray" values="')

  // The way into the panel sits at the band's far edge: a spacer takes the room before it.
  expect(after.beforeDetails).toBe(1)

  // A new main-thread turn sweeps the little it had burnt back, in both sites; that buys too little to ripple.
  await clock.advance(MINUTE)
  const next = $.turn.step({ turnId: 't2', index: 0, model: 'claude-fable-5-1', messageCount: 2 })
  for await (const _ of next) void _
  await next.result
  drawn = await card()
  expect(drawn.ring).toContain('<animate attributeName="stroke-dasharray" values="142.09 144.51;144.49 144.51;0.00 144.51"')
  expect(drawn.ring).not.toContain('<animate attributeName="r"')
  expect((await band('60m')).ring).toContain('values="40.16 40.84;40.83 40.84;0.00 40.84"')
})

// The two drawing sites with a real snapshot, and mounts that expose the host's plain-data tree.
async function drawingSession($: any, on: any, ttl = '1h', options: { model?: string } = {}) {
  const clock = mock.clock(on, { now: START })
  mock.store(on)
  mock.env(on, { CLAUDE_CODE_PROMPT_CACHE_TTL: ttl })
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.open', () => ({ value: undefined }))
  on('ui.render', { component: 'AbovePrompt' }, (inner: any, e: any) => inner.ui.resolve(e).Box({}))
  let size = 180_000
  const model = options.model ?? 'claude-fable-5-1'
  on('turn.step', async function* (_: unknown, e: any) {
    return { turnId: e.turnId, index: e.index, answer: 'hi', toolUses: [], stopReason: 'end_turn', usage: usage(0, size, model) }
  })
  let turns = 0
  const turn = async (tokens = size) => {
    size = tokens
    turns += 1
    const step = $.turn.step({ turnId: `t${turns}`, index: 0, model, messageCount: turns })
    for await (const _ of step) void _
    await step.result
  }
  const band = (hasSurvey = false) => $.ui.mount({
    plugin: 'cache-context', surface: 'desktop', component: 'AbovePrompt',
    props: { hasSurvey, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} },
  })
  const card = () => $.ui.mount({
    plugin: 'cache-context', surface: 'desktop', component: 'Pane', requestId: 'cache',
    props: { title: 'Prompt cache', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  })
  // What a site draws at this moment: its ring, and for the panel its bars, as sources; and every drawing it has.
  const drawn = async (site: 'band' | 'card') => {
    const ui = await (site === 'band' ? band() : card())
    const drawings = await ui.findAll({ type: 'Svg' })
    const seen = {
      drawings,
      ring: String(drawings.find((one: any) => one.props.width === (site === 'band' ? 18 : 60))?.props.source ?? ''),
      costs: String(drawings.find((one: any) => one.props.height === 94)?.props.source ?? ''),
      tree: await ui.drawn(),
    }
    await ui.unmount()

    return seen
  }

  return { clock, turn, band, card, drawn }
}

/** Every Box in a tree. */
function boxes(tree: any): any[] {
  const children = (tree.children ?? []).filter((child: any) => typeof child !== 'string')

  return [...(tree.type === 'Box' ? [tree] : []), ...children.flatMap((child: any) => boxes(child))]
}

test('a ring is drawn where its lifetime stands: counting down, breathing only unprotected, cold once expired', { timeoutMs: 30_000 }, async ($, on) => {
  const { clock, turn, drawn } = await drawingSession($, on, '5m')
  await turn()
  await clock.advance(MINUTE)
  const source = (await drawn('card')).ring
  const dial = (await drawn('band')).ring
  expect(source).toContain('<animate attributeName="stroke-dasharray" from="115.61 144.51" to="0.00 144.51" dur="240.000s" begin="0s" calcMode="linear" fill="freeze"/>')
  // Expiry is part of the drawing: it turns cold by itself if nothing redraws it first.
  expect(source).toContain('<set attributeName="visibility" to="hidden" begin="240.000s" fill="freeze"/>')
  expect(source).toContain('stroke="#5F7D95" stroke-width="3.5999999999999996" stroke-dasharray="9.03 9.03" visibility="hidden"><set attributeName="visibility" to="visible" begin="240.000s"')
  expect(source).toContain('dur="1.800s" begin="180.000s" end="240.000s"')
  expect(dial).toContain('dur="240.000s" begin="0s" calcMode="linear" fill="freeze"')
  expect(dial).toContain('begin="180.000s" end="240.000s"')
  expect(source).not.toContain('<text')
  expect(dial).not.toContain('<text')

  await $.command.run({ command: 'cache-auto', args: 'on', ...COMMAND_SITE })
  const protectedRing = (await drawn('card')).ring
  expect(protectedRing).not.toContain('values="1;0.45;1"')
  expect((await drawn('band')).ring).not.toContain('values="1;0.45;1"')
  expect(protectedRing).toContain('fill="#FFFFFF"')

  // Past expiry a draw shows the cold ring outright.
  await clock.advance(5 * MINUTE)
  const expired = await drawn('card')
  expect(expired.ring).toContain('stroke="#5F7D95" stroke-width="3.5999999999999996" stroke-dasharray="9.03 9.03"/>')
  expect(expired.ring).not.toContain('<animate')
  expect((await drawn('band')).ring).not.toContain('<animate')
  const figure = String(expired.drawings.find((one: any) => one.props.width === 238)!.props.source)
  expect(figure).toContain('fill="#5F7D95">Expired</text>')

  // A ring drawn while already closing joins its breath in step: ten seconds in, fifty to go.
  await turn()
  await clock.advance(4 * MINUTE + 10_000)
  await $.command.run({ command: 'cache-auto', args: 'off', ...COMMAND_SITE })
  expect((await drawn('card')).ring).toContain('dur="1.800s" begin="-10.000s" end="50.000s"')
})

test('the band draws its ring as it stands when it returns from a survey', { timeoutMs: 30_000 }, async ($, on) => {
  const { clock, turn, band, drawn } = await drawingSession($, on)
  await turn()
  await clock.advance(MINUTE)
  expect((await drawn('band')).ring).toContain('dur="3540.000s"')
  const hidden = await band(true)
  expect(await hidden.findAll({ type: 'Svg' })).toHaveLength(0)
  await hidden.unmount()
  await clock.advance(2 * MINUTE)
  const after = await drawn('band')
  // The ring, and the two quick toggles' dots.
  expect(after.drawings).toHaveLength(3)
  expect(after.ring).toContain('dur="3420.000s"')
})

test('every drawing is an image in the flow, and a redraw carries a refill or an entrance on', { timeoutMs: 30_000 }, async ($, on) => {
  const { clock, turn, drawn } = await drawingSession($, on)
  await turn()
  await clock.advance(2 * MINUTE)

  // New numbers and a refill: the arc sweeps back from where it stood, timed from this first draw.
  await turn(160_000)
  for (const site of ['band', 'card'] as const) {
    const seen = await drawn(site)
    // Nothing is a sandboxed frame, and nothing is laid over anything else: there is nothing to load or to cover.
    expect(seen.drawings.every((one: any) => one.props.isInteractive !== true)).toBe(true)
    expect(boxes(seen.tree).some(box => box.props?.position !== undefined || box.props?.key !== undefined)).toBe(false)
    expect(seen.drawings.filter((one: any) => one.props.width === (site === 'band' ? 18 : 60))).toHaveLength(1)
  }
  let card = await drawn('card')
  expect(card.ring).toContain('values="139.70 144.51;144.49 144.51;0.00 144.51" keyTimes="0;0.000194;1"')
  expect(card.ring).toContain('dur="3600.000s" begin="0.000s" calcMode="spline"')
  expect(card.costs).not.toContain('<animate attributeName="width"')

  // A redraw 300ms on tells the same movement from the same start, 300ms in.
  await clock.advance(300)
  card = await drawn('card')
  expect(card.ring).toContain('values="139.70 144.51;144.49 144.51;0.00 144.51" keyTimes="0;0.000194;1"')
  expect(card.ring).toContain('dur="3600.000s" begin="-0.300s" calcMode="spline"')
  expect((await drawn('band')).ring).toContain('dur="3600.000s" begin="-0.300s" calcMode="spline"')

  // Once the sweep and its ripple have had their time, a draw shows only the lifetime burning down.
  await clock.advance(1000)
  card = await drawn('card')
  expect(card.ring).not.toContain('values="139.70 144.51;')
  expect(card.ring).toContain('dur="3598.700s" begin="0s" calcMode="linear"')

  // Opening the panel draws the ring from nothing and grows the bars, from the first draw of the open panel.
  await $.command.run({ command: 'cache-panel', args: '', ...COMMAND_SITE })
  await clock.advance(150)
  const opened = await drawn('card')
  expect(opened.ring).toContain('values="0.00 144.51;')
  expect(opened.ring).not.toContain('begin="-')
  expect(opened.costs.match(/<animate attributeName="width"[^>]*begin="0.000s"/g)).toHaveLength(2)
  expect(opened.tree.children[0].children[0].props.columnGap).toBe(2)
  // The band has no entrance.
  expect((await drawn('band')).ring).not.toContain('values="0.00 40.84;')

  // Numbers arriving during the entrance: the refill takes the ring over, and the bars go on growing to their new lengths.
  await clock.advance(200)
  await turn(140_000)
  const changed = await drawn('card')
  expect(changed.ring).not.toContain('values="0.00 144.51;')
  expect(changed.ring).toContain('begin="0.000s" calcMode="spline"')
  expect(changed.costs.match(/<animate attributeName="width"[^>]*begin="-0.200s"/g)).toHaveLength(2)
  expect(changed.costs).not.toBe(opened.costs)

  // An opening seen too late is not played after the fact.
  await $.command.run({ command: 'cache-panel', args: '', ...COMMAND_SITE })
  await clock.advance(5000)
  const late = await drawn('card')
  expect(late.ring).not.toContain('values="0.00 144.51;')
  expect(late.costs).not.toContain('<animate attributeName="width"')
})

test('an unpriced cache keeps its figure and ring without the costs drawing', { timeoutMs: 30_000 }, async ($, on) => {
  const { clock, turn, card } = await drawingSession($, on, '1h', { model: 'unknown-model' })
  await turn(80_000)
  await clock.advance(MINUTE)
  const pane = await card()
  const drawings = await pane.findAll({ type: 'Svg' })
  expect(drawings.filter((one: any) => one.props.width === 60)).toHaveLength(1)
  expect(drawings.filter((one: any) => one.props.height === 94)).toHaveLength(0)
  expect(drawings.filter((one: any) => one.props.width === 238)).toHaveLength(1)
  expect(await pane.find({ type: 'Text', text: 'Pricing unavailable for this model' })).toBeDefined()
  await pane.unmount()
})

// A /config with an Idle compaction row, and the writes the mod makes to it.
function idleConfig(on: any, initial = true) {
  const config = { idle: initial, written: [] as boolean[] }
  on('config.list', () => ({
    value: [{ key: 'idleCompaction', label: 'Idle compaction', kind: 'boolean', value: config.idle, provider: { plugin: 'engine', tier: 'core' }, isLocked: false }],
  }))
  on('config.set', (_: unknown, e: { key: string; value: boolean }) => {
    if (e.key !== 'idleCompaction') return { deny: `unexpected key ${e.key}` }
    config.idle = e.value
    config.written.push(e.value)

    return { value: e.value }
  })
  on('session.end', (_: unknown, e: { sessionId: string }) => ({ sessionId: e.sessionId }))

  return config
}

test('auto-refresh turns idle compaction off while it is on, and only what it turned off back on', async ($, on) => {
  mock.clock(on, { now: START })
  mock.store(on)
  mock.env(on, {})
  const config = idleConfig(on)
  await boot($, on)

  const enabled = await $.command.run({ command: 'cache-auto', args: 'on' })
  expect(enabled.text).toContain('Idle compaction is off while auto-refresh is on')
  expect(config.idle).toBe(false)
  // Changing the limit changes nothing more.
  await $.command.run({ command: 'cache-auto', args: '5' })
  expect(config.written).toEqual([false])

  const disabled = await $.command.run({ command: 'cache-auto', args: 'off' })
  expect(disabled.text).toContain('Idle compaction is back on.')
  expect(config.idle).toBe(true)

  // A setting that was off already is left as it is.
  config.idle = false
  config.written.length = 0
  await $.command.run({ command: 'cache-auto', args: 'on' })
  await $.command.run({ command: 'cache-auto', args: 'off' })
  expect(config.written).toEqual([])
  expect(config.idle).toBe(false)
})

test('ending a conversation with auto-refresh on turns it off and idle compaction back on', async ($, on) => {
  mock.clock(on, { now: START })
  mock.store(on)
  mock.env(on, {})
  const config = idleConfig(on)
  await boot($, on)
  await $.command.run({ command: 'cache-auto', args: 'on' })
  expect(config.idle).toBe(false)
  await $.session.end({ reason: 'clear', sessionId: 'session-a' })
  expect(config.idle).toBe(true)
  // The next conversation starts with auto-refresh off.
  expect((await $.command.run({ command: 'cache-auto', args: '' })).text).toContain('Auto-refresh: off')
})

test('idle compaction stays off while another session still has auto-refresh on', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  // Session B turned it off a minute ago and is still running.
  mock.store(on, { idleCompactionPaused: true, idleCompactionHolders: { 'session-b': START - MINUTE } })
  mock.env(on, {})
  const config = idleConfig(on, false)
  await boot($, on)
  await $.command.run({ command: 'cache-auto', args: 'on' })
  await $.command.run({ command: 'cache-auto', args: 'off' })
  expect(config.written).toEqual([])

  // Once B has not been heard from for five minutes it is taken to have ended, and the setting comes back.
  await clock.advance(5 * MINUTE)
  await $.command.run({ command: 'cache-auto', args: 'off' })
  expect(config.idle).toBe(true)
})

test('a session that crashed with auto-refresh on has idle compaction turned back on by the next one', async ($, on) => {
  mock.clock(on, { now: START })
  mock.store(on, { idleCompactionPaused: true, idleCompactionHolders: { 'session-b': START - 10 * MINUTE } })
  mock.env(on, {})
  const config = idleConfig(on, false)
  await boot($, on)
  await $.command.run({ command: 'cache-auto', args: '' })
  expect(config.idle).toBe(true)
})

test('a kept auto-refresh switch that comes back on holds idle compaction off', async ($, on) => {
  mock.clock(on, { now: START })
  mock.store(on, { auto: { isOn: true, cap: 5 } })
  mock.env(on, {})
  const config = idleConfig(on)
  await boot($, on)
  await $.command.run({ command: 'cache-auto', args: '' })
  expect(config.written).toEqual([false])
})

test('a kept auto-refresh switch that comes back off leaves idle compaction alone', async ($, on) => {
  mock.clock(on, { now: START })
  mock.store(on, { auto: { isOn: false, cap: 5 } })
  mock.env(on, {})
  const config = idleConfig(on)
  await boot($, on)
  await $.command.run({ command: 'cache-auto', args: '' })
  expect(config.written).toEqual([])
  expect(config.idle).toBe(true)
})

test('a conversation ending turns its own auto-refresh off but keeps the chosen switch for the next start', async ($, on) => {
  mock.clock(on, { now: START })
  const kept = new Map<string, unknown>()
  on('store.get', (_: unknown, e: { key: string }) => ({ value: kept.get(e.key) }))
  on('store.set', (_: unknown, e: { key: string; value: unknown }) => {
    kept.set(e.key, e.value)

    return { value: undefined }
  })
  on('store.delete', (_: unknown, e: { key: string }) => {
    kept.delete(e.key)

    return { value: undefined }
  })
  mock.env(on, {})
  const config = idleConfig(on)
  await boot($, on)
  await $.command.run({ command: 'cache-auto', args: 'on 5' })
  await $.session.end({ reason: 'clear', sessionId: 'session-a' })
  expect(config.idle).toBe(true)
  expect((await $.command.run({ command: 'cache-auto', args: '' })).text).toContain('Auto-refresh: off')
  expect(kept.get('auto')).toEqual({ isOn: true, cap: 5, trim: false, trimFrom: 2000 })
})
