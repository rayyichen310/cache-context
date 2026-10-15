import { expect, mock, test } from 'claude-code/testing'

import { amountText, barRuns, fillText, fmtK, hexOf, legendGroups, toAutoText, contextWords } from '../hooks/context'

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
      memoryFiles: [
        { path: 'C:\\Users\\ray\\.claude\\CLAUDE.md', type: 'User', tokens: 900 },
      ],
      mcpTools: [
        { name: 'mcp__linear__create_issue', serverName: 'linear', tokens: 500, isLoaded: true },
        { name: 'mcp__linear__list_issues', serverName: 'linear', tokens: 400, isLoaded: false },
        { name: 'mcp__slack__post', serverName: 'slack', tokens: 300, isLoaded: true },
      ],
      agents: [
        { agentType: 'scout', source: 'userSettings', tokens: 60 },
        { agentType: 'gone', source: 'userSettings', tokens: 40 },
        { agentType: 'helper', source: 'plugin', tokens: 30 },
      ],
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
  expect(amountText(meter, W)).toBe('182.6k / 350k')
  expect(W.used(52)).toBe('已使用 52%')
  expect(amountText({ max: 350_000, segments: [] }, W)).toBe('— / 350k（等下次回應）')
  expect(toAutoText({ tokens: 1, max: 350_000, segments: [] }, W)).toBeNull()
})

test('the bar draws what is used largest first and then the buffer, never what is deferred or free', () => {
  const runs = barRuns({ tokens: 182_600, max: 350_000, segments: CATEGORIES }, 20)
  expect(runs.map(r => [r.segment?.name, r.cells])).toEqual([
    ['Messages', 4],
    ['System prompt', 2],
    ['Autocompact buffer', 2],
    [undefined, 12],
  ])
})

test('only the four largest categories in use take a colour, as in the app; the legend keeps on-demand rows apart', () => {
  const used = (name: string, tokens: number) => ({ name, tokens, color: 'x', kind: 'used' as const })
  const meter = {
    max: 350_000,
    segments: [used('a', 10), used('b', 50), used('c', 40), used('d', 30), used('e', 20), ...CATEGORIES.slice(2)],
  }
  const hex = [...hexOf(meter)].map(([s, colour]) => [s.name, colour])
  expect(hex.map(([name]) => name)).toEqual(['b', 'c', 'd', 'e', 'a', 'Autocompact buffer'])
  expect(new Set(hex.slice(0, 4).map(([, colour]) => colour)).size).toBe(4)
  expect(hex[4]![1]).not.toBe(hex[5]![1])
  const { inWindow, deferred } = legendGroups(meter)
  expect(inWindow.map(s => s.name)).toEqual(['b', 'c', 'd', 'e', 'a', 'Autocompact buffer', 'Free space'])
  expect(deferred.map(s => s.name)).toEqual(['MCP tools (deferred)'])
})

async function setUp($: Parameters<Parameters<typeof test>[1]>[0], on: Parameters<Parameters<typeof test>[1]>[1], lang = 'zh-Hant', isHeadless = false) {
  mock.clock(on, { now: 1_700_000_000_000 })
  mock.store(on)
  mock.env(on, { LANG: lang === 'en' ? 'en_US.UTF-8' : 'zh_TW.UTF-8', USERPROFILE: 'C:\\Users\\ray' })
  const calls = { compacted: 0, toasts: [] as string[], commands: [] as string[], ran: [] as string[][], stats: [] as string[], breakdowns: [] as string[] }
  // Of the agents' files, only scout's is on disk.
  on('fs.stat', (_, e) => {
    calls.stats.push(e.path)
    if (e.path !== 'C:\\Users\\ray\\.claude\\agents\\scout.md') return { deny: 'ENOENT' }
    return { value: { kind: 'file' as const, size: 1, mtimeMs: 0, isLink: false } }
  })
  on('process.run', (_, e) => {
    calls.ran.push([...e.argv])
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('session.usage', (_, e) => {
    if (e.breakdown !== undefined) calls.breakdowns.push(e.breakdown)
    return { value: USAGE }
  })
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
    expect(await has('背景資訊')).toBe(true)
    expect(await has('已使用 52%')).toBe(true)
    expect(await has('182.6k / 350k')).toBe(true)
    expect(await has('距自動壓縮剩 134.4k Token')).toBe(true)
    expect(await pane.find({ key: 'compact' })).toBeDefined()
    expect(await has('Messages')).toBe(false)
    expect(await pane.find({ key: 'list-mcp' })).toBeUndefined()

    await pane.press({ key: 'legend' })
    // Opening the details leaves the share, the room to auto-compact and compact where they were.
    expect(await has('已使用 52%')).toBe(true)
    expect(await pane.find({ key: 'compact' })).toBeDefined()
    expect(await has('Messages')).toBe(true)
    expect(await has(surface === 'desktop' ? 'Messages 70k 20.0%' : '20.0%')).toBe(true)
    expect(await has(surface === 'desktop' ? 'MCP tools (deferred) 62.6k —' : '—')).toBe(true)
    // Largest first, the free space after the buffer, and what loads on demand after both.
    const rows = await shown()
    const at = (name: string) => rows.findIndex(one => one.includes(name))
    expect(at('Messages')).toBeLessThan(at('System prompt'))
    expect(at('Autocompact buffer')).toBeLessThan(at('Free space'))
    expect(at('MCP tools (deferred)')).toBeGreaterThan(at('Free space'))

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
  expect(alts).toContain('MCP tools (deferred) 62.6k —')
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

test('the lists beneath the legend open, and a file found on disk opens with the app the system gives it', { timeoutMs: 30_000 }, async ($, on) => {
  const calls = await setUp($, on)
  for (const surface of SURFACES) {
    const pane = await $.ui.mount({ plugin: 'cache-context', surface, component: 'Pane', requestId: 'cache', props: paneProps })
    await pane.press({ key: 'legend' })
    const shown = async () =>
      surface === 'desktop'
        ? (await pane.findAll({ type: 'Svg' })).map(one => String(one.props.alt))
        : (await pane.findAll({ type: 'Text' })).map(one => one.text ?? '')
    // Each list with its count: every MCP tool counts, loaded or on demand.
    expect(await shown()).toContain('3')
    expect(await pane.find({ key: 'agent-0' })).toBeUndefined()

    await pane.press({ key: 'list-mcp' })
    expect((await shown()).some(one => one.includes('linear'))).toBe(true)

    await pane.press({ key: 'list-memory' })
    await pane.press({ key: 'memory-0' })
    await pane.press({ key: 'list-agents' })
    // scout's file is there; gone's is not, and a plugin's agent names no file, so neither is a press.
    expect(await pane.find({ key: 'agent-0' })).toBeDefined()
    expect(await pane.find({ key: 'agent-1' })).toBeUndefined()
    expect(await pane.find({ key: 'agent-2' })).toBeUndefined()
    expect((await shown()).some(one => one.includes('helper'))).toBe(true)
    await pane.press({ key: 'agent-0' })

    // What is open is the session's, so each surface is left as it began.
    for (const key of ['list-mcp', 'list-memory', 'list-agents', 'legend']) await pane.press({ key })
    await pane.unmount()
  }
  const memory = ['cmd', '/c', 'start', '', 'C:\\Users\\ray\\.claude\\CLAUDE.md']
  const scout = ['cmd', '/c', 'start', '', 'C:\\Users\\ray\\.claude\\agents\\scout.md']
  expect(calls.ran).toEqual([memory, scout, memory, scout])
  // A plugin's agent is never looked for.
  expect(calls.stats.some(path => path.includes('helper'))).toBe(false)
  expect(calls.toasts).toEqual([])
  // Counted as the app's own popover counts, so the rows read the same figures.
  expect(new Set(calls.breakdowns)).toEqual(new Set(['full']))
})
