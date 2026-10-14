import type { ContextMeter, Segment } from '../types'

// The context window, added beside the cache: its fill as a second ring on the band, and in the panel
// a segmented bar with a legend, like the desktop app's own usage popover. Its words are kept here in
// three languages rather than in the 43 catalogs, which this fork leaves as they came.

export type ContextWords = {
  label: string
  title: string
  toAuto: (left: string) => string
  compact: string
  compacting: string
  legendShow: string
  legendHide: string
  deferred: string
  waiting: string
  skipped: (why: string) => string
  failed: (why: string) => string
}

const ZH_HANT: ContextWords = {
  label: '上下文',
  title: '背景資訊視窗',
  toAuto: left => `距自動壓縮剩 ${left} Token`,
  compact: '壓縮工作階段',
  compacting: '壓縮中…',
  legendShow: '顏色說明 ▾',
  legendHide: '收起說明 ▴',
  deferred: '按需載入，不計入',
  waiting: '等下次回應',
  skipped: why => `壓縮未執行：${why}`,
  failed: why => `無法壓縮：${why}`,
}

const ZH: ContextWords = {
  label: '上下文',
  title: '上下文窗口',
  toAuto: left => `距自动压缩剩 ${left} Token`,
  compact: '压缩会话',
  compacting: '压缩中…',
  legendShow: '颜色说明 ▾',
  legendHide: '收起说明 ▴',
  deferred: '按需加载，不计入',
  waiting: '等下次回复',
  skipped: why => `压缩未执行：${why}`,
  failed: why => `无法压缩：${why}`,
}

const EN: ContextWords = {
  label: 'Context',
  title: 'Context window',
  toAuto: left => `${left} tokens until auto-compact`,
  compact: 'Compact session',
  compacting: 'Compacting…',
  legendShow: 'Legend ▾',
  legendHide: 'Hide legend ▴',
  deferred: 'loaded on demand, not counted',
  waiting: 'until the next reply',
  skipped: why => `Compaction skipped: ${why}`,
  failed: why => `Could not compact: ${why}`,
}

export function contextWords(tag: string): ContextWords {
  if (tag === 'zh-Hant') return ZH_HANT

  return tag.startsWith('zh') ? ZH : EN
}

// The ring and the bar's first colour: the blue of the app's own context bar.
export const CONTEXT_BLUE = '#4C8BF5'
// The bar can only take fixed colours, so categories are coloured by their order; the legend uses the same.
const PALETTE = ['#4C8BF5', '#E0703A', '#2EA36B', '#D9B83A', '#8A7FD4', '#3A9CB0', '#C8577E']
const BUFFER_HEX = '#9A9993'

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

  return percent === null ? `—/${fmtK(meter.max)}（${w.waiting}）` : `${fmtK(meter.tokens!)}/${fmtK(meter.max)} (${percent}%)`
}

export function toAutoText(meter: ContextMeter, w: ContextWords): string | null {
  if (meter.tokens === undefined || meter.threshold === undefined) return null

  return w.toAuto(fmtK(Math.max(0, meter.threshold - meter.tokens)))
}

/** The categories the bar draws, in order: what takes room, then the auto-compact buffer. */
export function drawn(meter: ContextMeter): Segment[] {
  return meter.segments.filter(s => s.kind === 'used' || s.kind === 'buffer')
}

/** Each drawn category's fixed colour: by order for what is used, gray for the buffer. */
export function hexOf(meter: ContextMeter): Map<Segment, string> {
  const hex = new Map<Segment, string>()
  let i = 0
  for (const s of drawn(meter)) hex.set(s, s.kind === 'buffer' ? BUFFER_HEX : PALETTE[i++ % PALETTE.length]!)

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

/** The panel's bar: rounded, each drawn category in its colour over a gray track. */
export function barSvg(meter: ContextMeter, width: number, tag: string): string {
  const height = 6
  const hex = hexOf(meter)
  let x = 0
  const parts: string[] = []
  for (const s of drawn(meter)) {
    const w = Math.min(width - x, (s.tokens / meter.max) * width)
    if (w <= 0) continue
    parts.push(`<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="${height}" fill="${hex.get(s)}"/>`)
    x += w
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" lang="${tag}" viewBox="0 0 ${width} ${height}"><clipPath id="r"><rect width="${width}" height="${height}" rx="3"/></clipPath><g clip-path="url(#r)"><rect width="${width}" height="${height}" fill="rgba(128,128,128,0.3)"/>${parts.join('')}</g></svg>`
}
