import { expect, mock, test } from 'claude-code/testing'

const MINUTE = 60_000
const START = 1_700_000_000_000
const HOUR_ENV = { CLAUDE_CODE_PROMPT_CACHE_TTL: '1h' }

// A one-hour cache the conversation itself last touched `agoMs` before the start.
function warm(agoMs: number) {
  return {
    touchedAt: START - agoMs,
    touchedBy: 'turn',
    turnAt: START - agoMs,
    pingsSinceTurn: 0,
    cachedTokens: 80_000,
    model: 'claude-sonnet-5-5',
    ttl: '1h',
    ttlSource: 'env',
    coldReason: null,
    lastPing: null,
  }
}

/** A session started as the engine starts one after a restart: its state empty, the store as kept. */
async function restart($: any, on: any, store: Record<string, unknown>) {
  const clock = mock.clock(on, { now: START })
  const kept = new Map<string, unknown>(Object.entries(store))
  on('store.get', (_: unknown, e: { key: string }) => ({ value: kept.get(e.key) }))
  on('store.set', (_: unknown, e: { key: string; value: unknown }) => {
    kept.set(e.key, e.value)

    return { value: undefined }
  })
  on('store.delete', (_: unknown, e: { key: string }) => {
    kept.delete(e.key)

    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...kept.keys()] }))
  mock.env(on, HOUR_ENV)
  const world = { forks: 0, panes: [] as { id: string; title: string }[], opened: [] as unknown[] }
  on('session.id', () => ({ value: 'session-a' }))
  on('session.usage', () => ({ value: { startedAt: START, context: { window: 1_000_000 }, rateLimits: [] } }))
  on('model.fork', () => {
    world.forks += 1

    return { value: { isAnswered: true, text: 'ok', usage: { input_tokens: 40, output_tokens: 200, cache_read_input_tokens: 80_000, cache_creation_input_tokens: 0 } } }
  })
  on('turn.step', async function* (_: unknown, e: any) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: 'hi',
      toolUses: [],
      stopReason: 'end_turn',
      usage: { input_tokens: 12, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 80_000, model: 'claude-sonnet-5-5' },
    }
  })
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('command.register', (_: unknown, e: { name: string }) => ({ value: { command: e.name } }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.panes', () => ({ value: world.panes.map(pane => ({ ...pane, isPlaced: true })) }))
  on('ui.open', (_: unknown, e: { id: string; title: string }) => {
    world.opened.push(e)
    if (!world.panes.some(pane => pane.id === e.id)) world.panes.push({ id: e.id, title: e.title })

    return { value: { isPlaced: true } }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('config.list', () => ({ value: [] }))
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })

  return { clock, kept, world }
}

test('a cache the last run left warm is carried over a restart and auto-refresh keeps it', { timeoutMs: 30_000 }, async ($, on) => {
  const { clock, world } = await restart($, on, {
    auto: { isOn: true, cap: 5 },
    'session:session-a': { snap: warm(56 * MINUTE), isPaneOpen: false, savedAt: START - 56 * MINUTE },
  })

  const status = await $.command.run({ command: 'cache-status', args: '' })
  expect(status.text).not.toContain('empty')
  // Four minutes are left at the start, inside the hour's five-minute lead: the refresh goes out at once.
  await clock.advance(2_000)
  expect(world.forks).toBe(1)
})

test('a cache that ran out while Claude Code was down is not carried over', { timeoutMs: 30_000 }, async ($, on) => {
  const { clock, world } = await restart($, on, {
    auto: { isOn: true, cap: 5 },
    'session:session-a': { snap: warm(70 * MINUTE), isPaneOpen: false, savedAt: START - 70 * MINUTE },
  })

  await clock.advance(2_000)
  expect(world.forks).toBe(0)
})

test('another session\'s record does not carry over, and a stale one is dropped', { timeoutMs: 30_000 }, async ($, on) => {
  const { clock, kept, world } = await restart($, on, {
    auto: { isOn: true, cap: 5 },
    'session:session-b': { snap: warm(50 * MINUTE), isPaneOpen: true, savedAt: START - 50 * MINUTE },
    'session:session-old': { snap: null, isPaneOpen: true, savedAt: START - 8 * 24 * 60 * MINUTE },
  })

  await clock.advance(2_000)
  expect(world.forks).toBe(0)
  expect(world.opened).toHaveLength(0)
  expect(kept.has('session:session-b')).toBe(true)
  expect(kept.has('session:session-old')).toBe(false)
})

test('the panel opens again after a restart when it was open', { timeoutMs: 30_000 }, async ($, on) => {
  const { world } = await restart($, on, {
    'session:session-a': { snap: null, isPaneOpen: true, savedAt: START - 10 * MINUTE },
  })

  expect(world.opened).toHaveLength(1)
  expect(world.opened[0]).toMatchObject({ id: 'cache' })
})

test('a reply and the open panel are written for the next start', { timeoutMs: 30_000 }, async ($, on) => {
  const { clock, kept } = await restart($, on, {})

  const step = $.turn.step({ turnId: 't1', index: 0, model: 'claude-sonnet-5-5', messageCount: 1 })
  for await (const _ of step) void _
  await step.result
  await $.command.run({ command: 'cache-panel', args: '' })
  await clock.advance(1_000)

  expect(kept.get('session:session-a')).toMatchObject({ snap: { cachedTokens: 80_000, ttl: '1h' }, isPaneOpen: true })
})

test('/cache-guard turns the guard on and off and sets its threshold', { timeoutMs: 30_000 }, async ($, on) => {
  const { kept } = await restart($, on, {})

  const shown = await $.command.run({ command: 'cache-guard', args: '' })
  expect(shown.text).toContain('Usage guard: off')
  const on90 = await $.command.run({ command: 'cache-guard', args: '90' })
  expect(on90.text).toContain('Usage guard: on · wraps up at 90%')
  expect(kept.get('usageGuard')).toMatchObject({ isOn: true, threshold: 90 })
  await $.command.run({ command: 'cache-guard', args: 'off' })
  expect(kept.get('usageGuard')).toMatchObject({ isOn: false, threshold: 90 })
  const wrong = await $.command.run({ command: 'cache-guard', args: '120' })
  expect(wrong.text).toContain('Usage: /cache-guard')
  expect(kept.get('usageGuard')).toMatchObject({ isOn: false, threshold: 90 })
})
