import { expect, mock, test } from 'claude-code/testing'

import { barRuns, fillText, fmtK, toAutoText, contextWords } from '../hooks/context'

const SURFACES = ['terminal', 'desktop'] as const
const W = contextWords('zh-Hant')

const CATEGORIES = [
  { name: 'System prompt', tokens: 35_000, color: 'promptBorder', isDeferred: false, kind: 'used' as const },
  { name: 'Messages', tokens: 70_000, color: 'permission', isDeferred: false, kind: 'used' as const },
  { name: 'MCP tools (deferred)', tokens: 62_600, color: 'inactive', isDeferred: true, kind: 'deferred' as const },
  { name: 'Free space', tokens: 210_000, color: 'inactive', isDeferred: false, kind: 'free' as const },
  { name: 'Autocompact buffer', tokens: 35_000, color: 'inactive', isDeferred: false, kind: 'buffer' as const },
]

const USAGE = {
  startedAt: 0,
  rateLimits: [],
  context: {
    tokens: 182_600,
    window: 1_000_000,
    percent: 18,
    breakdown: {
      categories: CATEGORIES,
      totalTokens: 140_000,
      maxTokens: 350_000,
      rawMaxTokens: 350_000,
      autocompactSource: 'settings' as const,
      percentage: 40,
      gridRows: [],
      model: 'claude-opus-5-5',
      memoryFiles: [],
      mcpTools: [],
      agents: [],
      autoCompactThreshold: 317_000,
      isAutoCompactEnabled: true,
      apiUsage: null,
    },
  },
}

const bandProps = (isWorking: boolean) => ({
  hasSurvey: false, isWorking, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {},
})
const paneProps = { title: '提示快取', isFocused: true, bodyColumns: 60, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} }

test('the fill reads as tokens over the window with its share, and the room left to auto-compact', () => {
  const meter = { tokens: 182_600, max: 350_000, threshold: 317_000, segments: [] }
  expect(fmtK(350_000)).toBe('350k')
  expect(fillText(meter, W)).toBe('182.6k/350k (52%)')
  expect(toAutoText(meter, W)).toBe('距自動壓縮剩 134.4k Token')
  expect(fillText({ max: 350_000, segments: [] }, W)).toBe('—/350k（等下次回應）')
  expect(toAutoText({ tokens: 1, max: 350_000, segments: [] }, W)).toBeNull()
})

test('the bar draws what is used and the buffer, never what is deferred or free', () => {
  const runs = barRuns({ tokens: 182_600, max: 350_000, segments: CATEGORIES }, 20)
  expect(runs.map(r => [r.segment?.name, r.cells])).toEqual([
    ['System prompt', 2],
    ['Messages', 4],
    ['Autocompact buffer', 2],
    [undefined, 12],
  ])
})

async function setUp($: Parameters<Parameters<typeof test>[1]>[0], on: Parameters<Parameters<typeof test>[1]>[1], lang = 'zh-Hant', isHeadless = false) {
  mock.clock(on, { now: 1_700_000_000_000 })
  mock.store(on)
  mock.env(on, { LANG: lang === 'en' ? 'en_US.UTF-8' : 'zh_TW.UTF-8' })
  const calls = { compacted: 0, toasts: [] as string[], commands: [] as string[] }
  on('session.usage', () => ({ value: USAGE }))
  on('session.measure', () => ({ changed: [] }))
  on('session.compact', () => {
    calls.compacted += 1
    return { skip: 'test' }
  })
  // Stands for the engine's own /compact, run as the person would type it.
  on('command.run', { command: 'compact' }, (_, e) => {
    calls.commands.push(e.command)
    return { text: '' }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.toast', (_, e) => {
    calls.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  // Stands for the engine's own, empty band beneath the plugin.
  on('ui.render', { component: 'AbovePrompt' }, (inner, e) => inner.ui.resolve(e).Box({}))
  // The desktop app's local sessions run headless: no person at a prompt of the engine's own.
  if (isHeadless) await $.session.start({ cwd: '/tmp', surface: null, isInteractive: false })
  await $.command.run({ command: 'cache-lang', args: lang }).catch(() => undefined)
  await $.session.measure({ context: { window: 1_000_000 }, rateLimits: [] })

  return calls
}

test('the band shows the context ring, its fill and compact on one line', { timeoutMs: 30_000 }, async ($, on) => {
  const calls = await setUp($, on)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'cache-context', surface, component: 'AbovePrompt', props: bandProps(false) })
    expect(await ui.find({ type: 'Text', text: '上下文 182.6k/350k (52%)' })).toBeDefined()
    expect((await ui.findAll({ type: 'Svg' })).length).toBe(surface === 'desktop' ? 1 : 0)
    expect((await ui.find({ type: 'Text', text: '◔' })) !== undefined).toBe(surface === 'terminal')
    expect(await ui.find({ key: 'details' })).toBeDefined()
    await ui.press({ key: 'compact' })
    await ui.unmount()
  }
  expect(calls.compacted).toBe(2)
  expect(calls.toasts).toEqual(['壓縮未執行：test', '壓縮未執行：test'])
})

test('no compact on the band while a turn runs', { timeoutMs: 30_000 }, async ($, on) => {
  await setUp($, on)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'cache-context', surface, component: 'AbovePrompt', props: bandProps(true) })
    expect(await ui.find({ type: 'Text', text: '上下文 182.6k/350k (52%)' })).toBeDefined()
    expect(await ui.find({ key: 'compact' })).toBeUndefined()
    await ui.unmount()
  }
})

test('the panel leads with the context window, and its legend opens and closes', { timeoutMs: 30_000 }, async ($, on) => {
  await setUp($, on)
  for (const surface of SURFACES) {
    const pane = await $.ui.mount({ plugin: 'cache-context', surface, component: 'Pane', requestId: 'cache', props: paneProps })
    // The desktop draws these words in the panel's own type, so they are read from each drawing's alt.
    const shown = async () =>
      surface === 'desktop'
        ? (await pane.findAll({ type: 'Svg' })).map(one => String(one.props.alt))
        : (await pane.findAll({ type: 'Text' })).map(one => one.text ?? '')
    const has = async (text: string) => (await shown()).some(one => one.includes(text))
    expect(await has('背景資訊視窗')).toBe(true)
    expect(await has('距自動壓縮剩 134.4k Token')).toBe(true)
    expect(await pane.find({ key: 'compact' })).toBeDefined()
    expect(await has('Messages')).toBe(false)

    await pane.press({ key: 'legend' })
    expect(await has('Messages')).toBe(true)
    expect(await has('70k · 20.0%')).toBe(true)
    expect(await has('62.6k（按需載入，不計入）')).toBe(true)
    // On-demand rows come last, and no estimate note follows them.
    const rows = await shown()
    expect(rows.findIndex(one => one.includes('MCP tools (deferred)'))).toBeGreaterThan(rows.findIndex(one => one.includes('Autocompact buffer')))
    expect(rows.some(one => one.includes('估算'))).toBe(false)

    await pane.press({ key: 'legend' })
    expect(await has('Messages')).toBe(false)
    await pane.unmount()
  }
})

test('in English the panel keeps its rows inside the column, in ordinary brackets', { timeoutMs: 30_000 }, async ($, on) => {
  await setUp($, on, 'en')
  const pane = await $.ui.mount({ plugin: 'cache-context', surface: 'desktop', component: 'Pane', requestId: 'cache', props: paneProps })
  await pane.press({ key: 'legend' })
  const alts = (await pane.findAll({ type: 'Svg' })).map(one => String(one.props.alt))
  // Short enough that the compact button keeps its room beside it.
  expect(alts).toContain('134.4k to auto-compact')
  expect(alts).toContain('MCP tools (deferred) 62.6k (on demand)')
  expect(alts.some(one => one.includes('（'))).toBe(false)
  // The words are drawn only as wide as they are, leaving the rest of the row to the button.
  const label = (await pane.findAll({ type: 'Svg' })).find(one => one.props.alt === '134.4k to auto-compact')
  expect(Number(label!.props.width)).toBeLessThan(200)
  await pane.unmount()
})

test('where compaction cannot be called, as in the desktop app, compact runs /compact instead', { timeoutMs: 30_000 }, async ($, on) => {
  const calls = await setUp($, on, 'zh-Hant', true)
  const ui = await $.ui.mount({ plugin: 'cache-context', surface: 'desktop', component: 'AbovePrompt', props: bandProps(false) })
  await ui.press({ key: 'compact' })
  expect(calls.commands).toEqual(['compact'])
  expect(calls.compacted).toBe(0)
  expect(calls.toasts).toEqual([])
  await ui.unmount()
})
