import { expect, mock, test } from 'claude-code/testing'

import { TRIM_PROMPT } from '../hooks/trim'

const SECOND = 1000
const MINUTE = 60_000
const START = 1_700_000_000_000
const MODEL = 'claude-opus-5-5'

type Setup = { auto: Record<string, unknown>; tail: number; drop?: boolean }

/** A session on the one-hour cache whose refreshes are known to extend it, after one turn with a `tail`-token reply. */
async function idle($: any, on: any, setup: Setup) {
  const clock = mock.clock(on, { now: START })
  const kept = new Map<string, unknown>(Object.entries({ auto: setup.auto, pingExtends: { '1h': true } }))
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
  mock.env(on, { CLAUDE_CODE_PROMPT_CACHE_TTL: '1h' })
  const world = { kept, tail: setup.tail, forks: 0, submitted: [] as string[], statuses: [] as (string | undefined)[] }
  on('session.usage', () => ({ value: { startedAt: START, context: { window: 1_000_000 }, rateLimits: [] } }))
  on('model.fork', () => {
    world.forks += 1

    return { value: { isAnswered: true, text: 'ok', usage: { input_tokens: 40, output_tokens: 4, cache_read_input_tokens: 92_261, cache_creation_input_tokens: 0 } } }
  })
  on('turn.step', async function* (_: unknown, e: any) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: 'ok',
      toolUses: [],
      stopReason: 'end_turn',
      usage: { input_tokens: 2, output_tokens: world.tail, cache_read_input_tokens: 90_970, cache_creation_input_tokens: 1_291, model: MODEL },
    }
  })
  on('turn.start', (_: unknown, e: { turnId: string }) => ({ turnId: e.turnId }))
  on('turn.complete', (_: unknown, e: { answer: string }) => ({ text: e.answer }))
  on('tool.call', () => ({ result: { stdout: 'ok', stderr: '', interrupted: false } }))
  on('prompt.submit', (_: unknown, e: { text: string }) => {
    world.submitted.push(e.text)

    return setup.drop ? { drop: 'busy' } : { text: e.text }
  })
  on('ui.status', (_: unknown, e: { text: string | undefined }) => {
    world.statuses.push(e.text)

    return { value: undefined }
  })
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('command.register', (_: unknown, e: { name: string }) => ({ value: { command: e.name } }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('session.id', () => ({ value: 'session-a' }))
  on('config.list', () => ({ value: [] }))
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await turn($, 't1')

  return { clock, world }
}

async function turn($: any, turnId: string) {
  await $.turn.start({ text: '', turnId })
  const step = $.turn.step({ turnId, index: 0, model: MODEL, messageCount: 1 })
  for await (const _ of step) void _
  await step.result
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId, reason: 'answer' })
}

const TRIM_ON = { isOn: true, cap: 3, trim: true, trimFrom: 2000 }

test('a long last reply is cached by one short message, and the refreshes after it fork as usual', { timeoutMs: 30_000 }, async ($, on) => {
  const { clock, world } = await idle($, on, { auto: TRIM_ON, tail: 5_257 })

  await clock.advance(54 * MINUTE)
  expect(world.submitted).toHaveLength(0)
  await clock.advance(2 * MINUTE)
  // In place of the first refresh: one message, and no fork.
  expect(world.submitted).toEqual([TRIM_PROMPT])
  expect(world.forks).toBe(0)
  expect(world.statuses.at(-1)).toContain('5,257')
  // Waiting for its turn sends nothing more.
  await clock.advance(30 * SECOND)
  expect(world.submitted).toHaveLength(1)
  expect(world.forks).toBe(0)

  // Its turn may not use tools; it answers with a short reply.
  await $.turn.start({ text: '', turnId: 't2' })
  const refused = await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(refused.deny).toBeDefined()
  world.tail = 3
  const step = $.turn.step({ turnId: 't2', index: 0, model: MODEL, messageCount: 3 })
  for await (const _ of step) void _
  await step.result
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer' })
  // The person's own turns use tools again.
  await $.turn.start({ text: '', turnId: 't3' })
  expect((await $.tool.call({ tool: 'Bash', command: 'ls' })).deny).toBeUndefined()
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't3', reason: 'aborted' })

  // The next refresh, with the short reply last, forks; one message per idle period.
  await clock.advance(56 * MINUTE)
  expect(world.forks).toBe(1)
  expect(world.submitted).toHaveLength(1)
})

test('a reply under the threshold, or the switch off, refreshes by fork alone', { timeoutMs: 30_000 }, async ($, on) => {
  const short = await idle($, on, { auto: TRIM_ON, tail: 1_999 })
  await short.clock.advance(56 * MINUTE)
  expect(short.world.forks).toBe(1)
  expect(short.world.submitted).toHaveLength(0)
})

test('a setting kept before the switch existed leaves it off', { timeoutMs: 30_000 }, async ($, on) => {
  const { clock, world } = await idle($, on, { auto: { isOn: true, cap: 3 }, tail: 5_257 })
  await clock.advance(56 * MINUTE)
  expect(world.forks).toBe(1)
  expect(world.submitted).toHaveLength(0)
})

test('a message the engine drops falls back to a fork', { timeoutMs: 30_000 }, async ($, on) => {
  const { clock, world } = await idle($, on, { auto: TRIM_ON, tail: 5_257, drop: true })
  await clock.advance(56 * MINUTE)
  expect(world.submitted).toHaveLength(1)
  expect(world.forks).toBe(1)
})

test('/cache-auto trim switches it and takes a threshold', { timeoutMs: 30_000 }, async ($, on) => {
  const { world } = await idle($, on, { auto: { isOn: false, cap: 12 }, tail: 300 })
  const shown = await $.command.run({ command: 'cache-auto', args: '' })
  expect(shown.text).toContain('Long replies: off')

  const set = await $.command.run({ command: 'cache-auto', args: 'trim 3000' })
  expect(set.text).toContain('3k')
  expect(world.kept.get('auto')).toEqual({ isOn: false, cap: 12, trim: true, trimFrom: 3000 })

  await $.command.run({ command: 'cache-auto', args: 'trim off' })
  expect(world.kept.get('auto')).toEqual({ isOn: false, cap: 12, trim: false, trimFrom: 3000 })

  await $.command.run({ command: 'cache-auto', args: 'trim' })
  expect(world.kept.get('auto')).toEqual({ isOn: false, cap: 12, trim: true, trimFrom: 3000 })

  // A threshold off the thousands is shown exact, never rounded up or down.
  expect((await $.command.run({ command: 'cache-auto', args: 'trim 2500' })).text).toContain('2,500')
  await $.command.run({ command: 'cache-auto', args: 'trim 3000' })

  const bad = await $.command.run({ command: 'cache-auto', args: 'trim 10' })
  expect(bad.text).toContain('Usage: /cache-auto trim')
  expect(world.kept.get('auto')).toEqual({ isOn: false, cap: 12, trim: true, trimFrom: 3000 })
})
