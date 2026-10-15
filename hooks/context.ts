import type { ContextListKey, ContextMeter, Segment } from '../types'

// The context window, added beside the cache: its fill as a second ring on the band, and in the panel
// a segmented bar with a legend, like the desktop app's own usage popover. Its words are kept here in
// three languages rather than in the 43 catalogs, which this fork leaves as they came.

export type ContextWords = {
  label: string
  title: string
  /** The share in use, as the app's own popover leads with it; null until a response reports it. */
  used: (percent: number | null) => string
  toAuto: (left: string) => string
  compact: string
  compacting: string
  legendShow: string
  legendHide: string
  lists: Record<ContextListKey, string>
  waiting: string
  /** An aside in the language's own brackets. */
  aside: (text: string) => string
  skipped: (why: string) => string
  failed: (why: string) => string
  openFailed: (path: string) => string
}

const ZH_HANT: ContextWords = {
  label: '上下文',
  title: '背景資訊',
  used: percent => `已使用 ${percent ?? '—'}%`,
  toAuto: left => `距自動壓縮剩 ${left} Token`,
  compact: '壓縮工作階段',
  compacting: '壓縮中…',
  legendShow: '顏色說明 ▾',
  legendHide: '收起說明 ▴',
  lists: { mcp: 'MCP 工具', memory: '記憶檔案', agents: '自訂代理' },
  waiting: '等下次回應',
  aside: text => `（${text}）`,
  skipped: why => `壓縮未執行：${why}`,
  failed: why => `無法壓縮：${why}`,
  openFailed: path => `無法開啟 ${path}`,
}

const ZH: ContextWords = {
  label: '上下文',
  title: '上下文',
  used: percent => `已使用 ${percent ?? '—'}%`,
  toAuto: left => `距自动压缩剩 ${left} Token`,
  compact: '压缩会话',
  compacting: '压缩中…',
  legendShow: '颜色说明 ▾',
  legendHide: '收起说明 ▴',
  lists: { mcp: 'MCP 工具', memory: '记忆文件', agents: '自定义代理' },
  waiting: '等下次回复',
  aside: text => `（${text}）`,
  skipped: why => `压缩未执行：${why}`,
  failed: why => `无法压缩：${why}`,
  openFailed: path => `无法打开 ${path}`,
}

const EN: ContextWords = {
  label: 'Context',
  title: 'Context',
  used: percent => `${percent ?? '—'}% used`,
  toAuto: left => `${left} to auto-compact`,
  compact: 'Compact session',
  compacting: 'Compacting…',
  legendShow: 'Legend ▾',
  legendHide: 'Hide legend ▴',
  lists: { mcp: 'MCP tools', memory: 'Memory files', agents: 'Custom agents' },
  waiting: 'until the next reply',
  aside: text => ` (${text})`,
  skipped: why => `Compaction skipped: ${why}`,
  failed: why => `Could not compact: ${why}`,
  openFailed: path => `Could not open ${path}`,
}

export function contextWords(tag: string): ContextWords {
  if (tag === 'zh-Hant') return ZH_HANT

  return tag.startsWith('zh') ? ZH : EN
}

// The ring and the bar's first colour: the blue of the app's own context bar.
export const CONTEXT_BLUE = '#4C8BF5'
// The bar can only take fixed colours. As in the app's own popover, the four largest categories in use
// take a colour each and the rest share one gray; the legend uses the same.
const PALETTE = ['#4C8BF5', '#E0703A', '#2EA36B', '#D9B83A']
const OTHER_HEX = '#9A9993'
const BUFFER_HEX = '#5F5E5A'
export function fmtK(tokens: number): string {
  if (tokens >= 1e6) return `${(tokens / 1e6).toFixed(2)}M`

  return tokens >= 1000 ? `${(tokens / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(tokens)
}

export function percentOf(meter: ContextMeter): number | null {
  return meter.tokens === undefined ? null : Math.round((meter.tokens / meter.max) * 100)
}

/** `182.6k/350k (52%)`, or the window alone until a response reports the fill. */
export function fillText(meter: ContextMeter, w: ContextWords): string {
  const percent = percentOf(meter)

  return percent === null ? `—/${fmtK(meter.max)}${w.aside(w.waiting)}` : `${fmtK(meter.tokens!)}/${fmtK(meter.max)} (${percent}%)`
}

/** `182.6k / 350k`, the panel's figure beside the share; the window alone until a response reports the fill. */
export function amountText(meter: ContextMeter, w: ContextWords): string {
  return meter.tokens === undefined ? `— / ${fmtK(meter.max)}${w.aside(w.waiting)}` : `${fmtK(meter.tokens)} / ${fmtK(meter.max)}`
}

export function toAutoText(meter: ContextMeter, w: ContextWords): string | null {
  if (meter.tokens === undefined || meter.threshold === undefined) return null

  return w.toAuto(fmtK(Math.max(0, meter.threshold - meter.tokens)))
}

const bySize = (a: Segment, b: Segment) => b.tokens - a.tokens

/** The categories the bar draws, in order: what takes room, largest first, then the auto-compact buffer. */
export function drawn(meter: ContextMeter): Segment[] {
  return [...meter.segments.filter(s => s.kind === 'used').sort(bySize), ...meter.segments.filter(s => s.kind === 'buffer')]
}

/** The legend's two groups: what the bar draws then the free space, and apart what loads on demand. */
export function legendGroups(meter: ContextMeter): { inWindow: Segment[]; deferred: Segment[] } {
  return {
    inWindow: [...drawn(meter), ...meter.segments.filter(s => s.kind === 'free')],
    deferred: meter.segments.filter(s => s.kind === 'deferred').sort(bySize),
  }
}

/** Each drawn category's fixed colour: the four largest in use by order, gray for the rest and the buffer. */
export function hexOf(meter: ContextMeter): Map<Segment, string> {
  const hex = new Map<Segment, string>()
  let i = 0
  for (const s of drawn(meter)) hex.set(s, s.kind === 'buffer' ? BUFFER_HEX : PALETTE[i++] ?? OTHER_HEX)

  return hex
}

/** The bar's runs in whole cells, each drawn category in order and the empty rest; for the terminal. */
export function barRuns(meter: ContextMeter, cells: number): { segment?: Segment; cells: number }[] {
  const runs: { segment?: Segment; cells: number }[] = []
  let used = 0
  for (const s of drawn(meter)) {
    const n = Math.min(cells - used, Math.round((s.tokens / meter.max) * cells))
    if (n > 0) runs.push({ segment: s, cells: n })
    used += Math.max(0, n)
  }
  if (cells - used > 0) runs.push({ cells: cells - used })

  return runs
}

/** The band's second ring: the share of the window in use, clockwise from the top. */
export function fillRingSvg(share: number | null, tag: string): string {
  const c = 9
  const r = 6.5
  const around = 2 * Math.PI * r
  const lit = Math.min(1, Math.max(0, share ?? 0))
  const circle = `cx="${c}" cy="${c}" r="${r}" fill="none" stroke-width="3"`
  const arc = lit > 0
    ? `<circle ${circle} stroke="${CONTEXT_BLUE}" stroke-linecap="round" stroke-dasharray="${(around * lit).toFixed(2)} ${around.toFixed(2)}" transform="rotate(-90 ${c} ${c})"/>`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" lang="${tag}" viewBox="0 0 18 18"><circle ${circle} stroke="rgba(128,128,128,0.3)"/>${arc}</svg>`
}

/** The panel's bar: rounded, each drawn category in its colour a hairline gap between them, then a gray track for the rest. */
export function barSvg(meter: ContextMeter, width: number, tag: string): string {
  const height = 6
  const gap = 1.5
  const hex = hexOf(meter)
  let x = 0
  const parts: string[] = []
  for (const s of drawn(meter)) {
    const w = Math.min(width - x, (s.tokens / meter.max) * width)
    if (w <= 0) continue
    // A category narrower than the gap keeps a sliver rather than vanishing.
    const shown = w > gap * 2 ? w - gap : w
    parts.push(`<rect x="${x.toFixed(2)}" y="0" width="${shown.toFixed(2)}" height="${height}" fill="${hex.get(s)}"/>`)
    x += w
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" lang="${tag}" viewBox="0 0 ${width} ${height}"><clipPath id="r"><rect width="${width}" height="${height}" rx="3"/></clipPath><g clip-path="url(#r)">${parts.join('')}<rect x="${x.toFixed(2)}" width="${(width - x).toFixed(2)}" height="${height}" fill="rgba(128,128,128,0.3)"/></g></svg>`
}
