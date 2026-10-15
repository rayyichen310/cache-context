import type { Elements, RenderElement, RenderNode } from 'claude-code'

import type { ContextFile, ContextListKey, ContextLists, ContextMeter, Segment, Snapshot } from '../types'
import { CONTEXT_BLUE, amountText, barRuns, barSvg, contextWords, fillRingSvg, fillText, fmtK, hexOf, legendGroups, percentOf, toAutoText } from './context'
import type { ContextWords } from './context'
import { TTL_MS, fmtRemaining, fmtSpan, fmtTokens, fmtUsd } from './economics'
import { MESSAGES } from './messages'
import type { Messages } from './messages'
import { LEAD_MS, budgetOf, costsOf, isTracked, remainingOf } from './model'
import type { Verdict, View } from './model'

type Els = Elements['terminal'] | Elements['desktop']
type Surface = 'terminal' | 'desktop' | 'vscode' | 'mobile'

// A warm cache is drawn warm and a cold one cold; nothing else carries color.
const EMBER = '#D4622A'
const SLATE = '#5F7D95'
// For drawings that cannot follow the theme: a gray that reads on light and dark alike.
const TRACK = 'rgba(128,128,128,0.3)'
const VERDICT_HEX: Record<Verdict, string> = { hit: EMBER, partial: EMBER, miss: SLATE }
const INK = '#1A1A18'
const SECONDARY = '#66655F'
type DrawingLocale = Pick<Messages, 'tag' | 'fonts'>

// Measured on the desktop app: a docked pane leaves this column 314px wide, lays rows out in 8px steps,
// and draws its buttons 24px tall. The panel is drawn to those numbers; a wider pane leaves the rest empty.
export const PANEL_PIXELS = 314
const PANEL_CELLS = 42
// A label beside controls: what is left of the column once the stepper (88px) and the gap (16px) have theirs.
export const LABEL_PIXELS = 200
const HISTORY_PIXELS = 200
const BAR_CELLS = 16
const METER_CELLS = 28

// The words inside a drawing follow the person's light or dark appearance, which only a drawing's own
// style sheet can ask about: a mod is never told the theme. Each word also carries its light color as an
// attribute, so a surface that drops the style sheet still draws it.
function styleOf(fonts: string): string {
  const font = `system-ui, -apple-system${fonts ? `, ${fonts}` : ''}, sans-serif`

  return `<style>text{font-family:${font}}.ink{fill:${INK}}.sec{fill:${SECONDARY}}.track{stroke:#E3E1DA}.bar{fill:#C9C7BF}` +
    '@media (prefers-color-scheme: dark){.ink{fill:#ECEBE6}.sec{fill:#A3A29C}.track{stroke:#45443F}.bar{fill:#5C5B55}}</style>'
}

// The desktop builds a site's whole tree anew whenever anything in it changes, so no drawing outlives a
// redraw, and a sandboxed frame would load again, blank for a moment, each time. Every drawing is therefore
// an image, which is replaced without a gap, and one that moves says where each movement stands as it is
// drawn: a movement under way begins at a negative time, and carries on from there.
// What arrives eases out; what repeats eases both ways.
const EASE_OUT = '0.22 1 0.36 1'
const EASE_BOTH = '0.45 0 0.55 1'
const SWEEP_MS = 700
const RIPPLE_DELAY_MS = 450
const RIPPLE_MS = 750
const TRAVEL_MS = 1100
const BREATH_MS = 1800
/** How long the panel's entrance plays, and a refill's sweep with its ripple. */
export const ENTER_MS = 900
export const REFILL_MS = RIPPLE_DELAY_MS + RIPPLE_MS

/**
 * The moment of a draw, and the events its movements run from.
 */
export type Motion = {
  now: number
  openedAt: number | null
  /** The last refill, and the share of the lifetime left before it. */
  refill: { at: number; from: number } | null
  /** When the ping under way went out; null with none. */
  pingAt: number | null
}

export const STILL: Motion = { now: 0, openedAt: null, refill: null, pingAt: null }

export type PaneHandlers = {
  onToggle: () => void
  onCapDown: () => void
  onCapUp: () => void
  onPing: () => void
}

/** The surface's Svg where it draws one: the terminal's table takes an Svg and shows nothing for it. */
function svgOf(els: Els, surface: Surface) {
  return surface !== 'terminal' && 'Svg' in els ? els.Svg : null
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Width in terminal cells: a CJK character takes two. */
function cells(text: string): number {
  let count = 0
  for (const char of text) count += char.codePointAt(0)! > 0x2e80 ? 2 : 1

  return count
}

function isClosing(held: Snapshot, now: number): boolean {
  const remaining = remainingOf(held, now)

  return remaining > 0 && remaining < TTL_MS[held.ttl] / 5
}

const seconds = (ms: number) => (ms / 1000).toFixed(3)

/** A value arriving where the drawing already has it: held at `from` for `delay`, then eased over `ms`, begun `since` ago. */
function arrive(attribute: string, from: string, to: string, ms: number, delay = 0, since = 0): string {
  const values = delay > 0 ? `${from};${from};${to}` : `${from};${to}`
  const times = delay > 0 ? `0;${(delay / (delay + ms)).toFixed(3)};1` : '0;1'
  const splines = delay > 0 ? `0 0 1 1;${EASE_OUT}` : EASE_OUT

  return `<animate attributeName="${attribute}" values="${values}" keyTimes="${times}" keySplines="${splines}" dur="${seconds(delay + ms)}s" begin="${seconds(-since)}s" calcMode="spline" fill="freeze"/>`
}

/** There and back from the last fifth until expiry; a `begin` already past is negative, and keeps the breath in step. */
function breathe(begin: number, end: number): string {
  return `<animate attributeName="opacity" values="1;0.45;1" keyTimes="0;0.5;1" keySplines="${EASE_BOTH};${EASE_BOTH}" dur="${seconds(BREATH_MS)}s" begin="${seconds(begin)}s" end="${seconds(end)}s" calcMode="spline" repeatCount="indefinite"/>`
}

// A movement is timed from the draw that first shows it. That draw trails the event behind it by a moment, as
// every later draw trails its own clock, and timed this way the two delays cancel: a redraw finds the
// movement where the screen has it.
const shown: Record<string, { event: number; at: number }> = {}

/** How long a site has been showing the movement an event set off; null once `window` has passed, or if it was first seen too late to play. */
function sinceShown(site: string, event: number, now: number, window = Infinity): number | null {
  let first = shown[site]
  if (first?.event !== event) {
    first = { event, at: now - event < window ? now : event }
    shown[site] = first
  }
  const since = now - first.at

  return since < window ? since : null
}

type Ring = {
  center: number
  radius: number
  stroke: number
  /** The share of the lifetime left. */
  left: number
  isCold: boolean
  remaining: number
  lifetime: number
  isProtected: boolean
  /** The share of the lifetime at which the next keep-alive goes out, or null with none planned. */
  mark: number | null
}

/** The movements under way as a ring is drawn, each by how long ago it began. */
type Moves = {
  /** A ping is out. */
  pinging: number | null
  /** The arc is on its way back up from a share: after a refill, or from nothing as the panel opens. */
  sweep: { from: number; since: number; isRefill: boolean } | null
  /** The panel is opening. */
  entering: number | null
}

const AT_REST: Moves = { pinging: null, sweep: null, entering: null }

/**
 * The lifetime left as a ring's arc, clockwise from the top; a cold cache is a dashed ring.
 * Its movements: drawn from nothing as the panel opens, swept back to full when a touch refills it with a
 * ripple if that bought real time, a lit stretch travelling while a ping is out, a slow breath when closing.
 */
function ring(o: Ring, moves: Moves = AT_REST): string {
  const { center, radius, stroke } = o
  const around = 2 * Math.PI * radius
  const circle = `cx="${center}" cy="${center}" r="${radius}" fill="none"`
  const cold = `<circle ${circle} stroke="${SLATE}" stroke-width="${Math.max(1.5, stroke * 0.6)}" stroke-dasharray="${(around / 16).toFixed(2)} ${(around / 16).toFixed(2)}"`
  if (o.isCold) return `${cold}/>`
  const left = Math.min(1, Math.max(0, o.left))
  const dash = (share: number) => `${(around * share).toFixed(2)} ${around.toFixed(2)}`
  const fromTop = `transform="rotate(-90 ${center} ${center})"`
  const expires = `${seconds(o.remaining)}s`
  const isPinging = moves.pinging !== null
  const { sweep } = moves
  // The lifetime burns the arc down to nothing. A sweep is the same movement told from its own start:
  // eased up to the share the lifetime will have reached by its end, then down with the lifetime.
  const whole = o.remaining + (sweep?.since ?? 0)
  const burn = sweep !== null && whole > SWEEP_MS
    ? `<animate attributeName="stroke-dasharray" values="${dash(sweep.from)};${dash((whole - SWEEP_MS) / o.lifetime)};${dash(0)}" keyTimes="0;${(SWEEP_MS / whole).toFixed(6)};1" keySplines="${EASE_OUT};0 0 1 1" dur="${seconds(whole)}s" begin="${seconds(-sweep.since)}s" calcMode="spline" fill="freeze"/>`
    : `<animate attributeName="stroke-dasharray" from="${dash(left)}" to="${dash(0)}" dur="${expires}" begin="0s" calcMode="linear" fill="freeze"/>`
  const breath = !o.isProtected && !isPinging ? breathe(o.remaining - o.lifetime / 5, o.remaining) : ''
  const arc = `<circle ${circle} stroke="${EMBER}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${dash(left)}" ${fromTop}${isPinging ? ' opacity="0.35"' : ''}>${burn}${breath}</circle>`

  const traveller = moves.pinging !== null
    ? `<circle ${circle} stroke="${EMBER}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${dash(0.16)}"><animateTransform attributeName="transform" type="rotate" from="0 ${center} ${center}" to="360 ${center} ${center}" dur="${seconds(TRAVEL_MS)}s" begin="${seconds(-moves.pinging)}s" repeatCount="indefinite"/></circle>`
    : ''

  let ripple = ''
  if (sweep?.isRefill && left - sweep.from > 0.1) {
    const begin = `dur="${seconds(REFILL_MS)}s" begin="${seconds(-sweep.since)}s" calcMode="spline" fill="freeze"`
    const at = (RIPPLE_DELAY_MS / REFILL_MS).toFixed(3)
    const lit = (RIPPLE_DELAY_MS / REFILL_MS + 0.08).toFixed(3)
    ripple =
      `<circle ${circle} stroke="${EMBER}" stroke-width="${stroke}" opacity="0">` +
      `<animate attributeName="opacity" values="0;0;0.45;0" keyTimes="0;${at};${lit};1" keySplines="0 0 1 1;0 0 1 1;${EASE_OUT}" ${begin}/>` +
      `<animate attributeName="r" values="${radius};${radius};${(radius + stroke * 0.65).toFixed(2)}" keyTimes="0;${at};1" keySplines="0 0 1 1;${EASE_OUT}" ${begin}/>` +
      `<animate attributeName="stroke-width" values="${stroke};${stroke};${(stroke / 6).toFixed(2)}" keyTimes="0;${at};1" keySplines="0 0 1 1;${EASE_OUT}" ${begin}/>` +
      '</circle>'
  }

  // Where the arc will stand when the next keep-alive goes out: a white stud the arc burns down to.
  let stud = ''
  if (o.mark !== null && left >= o.mark && !isPinging) {
    const angle = 2 * Math.PI * o.mark
    const x = (center + radius * Math.sin(angle)).toFixed(2)
    const y = (center - radius * Math.cos(angle)).toFixed(2)
    const appear = moves.entering !== null ? arrive('opacity', '0', '1', 200, SWEEP_MS * 0.6, moves.entering) : ''
    stud = `<circle cx="${x}" cy="${y}" r="${(stroke / 4).toFixed(2)}" fill="#FFFFFF">${appear}</circle>`
  }

  return `<g><set attributeName="visibility" to="hidden" begin="${expires}" fill="freeze"/><circle ${circle} class="track" stroke="${TRACK}" stroke-width="${stroke}"/>${ripple}${arc}${traveller}${stud}</g>${cold} visibility="hidden"><set attributeName="visibility" to="visible" begin="${expires}" fill="freeze"/></circle>`
}

/** The band's mark: the ring alone, small. */
export function dialSvg(left: number, isCold: boolean, isClosing: boolean, motion: Motion = STILL, locale: DrawingLocale = MESSAGES.en): string {
  const lifetime = TTL_MS['5m']
  const drawn = ring({ center: 9, radius: 6.5, stroke: 3, left, isCold, remaining: left * lifetime, lifetime, isProtected: !isClosing, mark: null }, {
    pinging: motion.pingAt !== null ? motion.now - motion.pingAt : null,
    sweep: motion.refill !== null ? { from: motion.refill.from, since: motion.now - motion.refill.at, isRefill: true } : null,
    entering: null,
  })

  return `<svg xmlns="http://www.w3.org/2000/svg" lang="${locale.tag}" viewBox="0 0 18 18">${styleOf(locale.fonts)}${drawn}</svg>`
}

type Card = {
  figure: string
  caption: string
  isCold: boolean
  locale?: DrawingLocale
}

/** The clock's words are an image beside the independently running ring. */
export function cardSvg(o: Card): { source: string; height: number } {
  const locale = o.locale ?? MESSAGES.en
  const hex = o.isCold ? SLATE : EMBER

  return {
    height: 62,
    source: `<svg xmlns="http://www.w3.org/2000/svg" lang="${locale.tag}" viewBox="0 0 238 62">${styleOf(locale.fonts)}<text x="0" y="31" font-size="38" font-weight="650" letter-spacing="-0.76" fill="${hex}">${escapeXml(o.figure)}</text><text x="0" y="56" font-size="14" class="sec" fill="${SECONDARY}">${escapeXml(o.caption)}</text></svg>`,
  }
}

type Costs = { lapseLabel: string; lapseUsd: string; pingLabel: string; pingUsd: string; share: number; note: string }

/** The lower 94px of the old card, with its coordinates measured from y=62. */
function costsSvg(costs: Costs, locale: DrawingLocale, entering: number | null): string {
  const width = PANEL_PIXELS
  const labelWidth = Math.max(cells(costs.lapseLabel), cells(costs.pingLabel)) * 7
  const barX = labelWidth + 12
  const barWidth = Math.max(60, width - barX - 68)
  const row = (top: number, label: string, usd: string, bar: string) =>
    `<text x="0" y="${top + 15}" font-size="14" class="sec" fill="${SECONDARY}">${escapeXml(label)}</text>${bar}<text x="${width}" y="${top + 15}" font-size="14" font-weight="600" text-anchor="end" class="ink" fill="${INK}" style="font-variant-numeric:tabular-nums">${escapeXml(usd)}</text>`
  const sliver = Math.max(3, Math.round(barWidth * Math.min(1, costs.share)))
  // As the panel opens the two bars grow one after the other: the comparison is read in that order.
  const grow = (to: number, ms: number, delay: number) =>
    entering !== null ? arrive('width', '0', String(to), ms, delay, entering) : ''
  const parts = [
    row(20, costs.lapseLabel, costs.lapseUsd, `<rect x="${barX}" y="26" width="${barWidth}" height="8" rx="4" class="bar" fill="#C9C7BF">${grow(barWidth, 500, 150)}</rect>`),
    row(48, costs.pingLabel, costs.pingUsd, `<rect x="${barX}" y="54" width="${sliver}" height="8" rx="${Math.min(4, sliver / 2)}" fill="${EMBER}">${grow(sliver, 250, 650)}</rect>`),
    `<text x="0" y="88" font-size="12" class="sec" fill="${SECONDARY}">${escapeXml(costs.note)}</text>`,
  ]

  return `<svg xmlns="http://www.w3.org/2000/svg" lang="${locale.tag}" viewBox="0 0 ${width} 94">${styleOf(locale.fonts)}${parts.join('')}</svg>`
}

/** A site's ring as it stands at this draw: the lifetime's arc, and whatever movement is under way. */
function ringSvg(site: 'band' | 'card', held: Snapshot, isProtected: boolean, motion: Motion, entering: number | null, locale: DrawingLocale): string {
  const { now, refill, pingAt } = motion
  const lifetime = TTL_MS[held.ttl]
  const remaining = Math.max(0, remainingOf(held, now))
  const sinceRefill = refill !== null ? sinceShown(`${site}-refill`, refill.at, now, REFILL_MS) : null
  const size = site === 'band' ? 18 : 60
  const drawn = ring({
    center: size / 2,
    radius: site === 'band' ? 6.5 : 23,
    stroke: site === 'band' ? 3 : 6,
    left: Math.min(1, remaining / lifetime),
    isCold: remaining <= 0,
    remaining,
    lifetime,
    isProtected,
    mark: site === 'card' && isProtected ? LEAD_MS[held.ttl] / lifetime : null,
  }, {
    pinging: pingAt !== null ? sinceShown(`${site}-ping`, pingAt, now) : null,
    // A refill outranks the entrance: the arc is already on its way up.
    sweep: refill !== null && sinceRefill !== null
      ? { from: refill.from, since: sinceRefill, isRefill: true }
      : entering !== null ? { from: 0, since: entering, isRefill: false } : null,
    entering: sinceRefill === null ? entering : null,
  })

  return `<svg xmlns="http://www.w3.org/2000/svg" lang="${locale.tag}" viewBox="0 0 ${size} ${size}">${styleOf(locale.fonts)}${drawn}</svg>`
}

type LabelStyle = 'title' | 'body' | 'count' | 'small'

/** One line of words drawn in the card's own type, to sit beside a button: 20px tall, or 16px when small. */
export function labelSvg(text: string, width: number, style: LabelStyle, locale: DrawingLocale = MESSAGES.en): { source: string; height: number } {
  const isSmall = style === 'small'
  const height = isSmall ? 16 : 20
  const isInk = style === 'title' || style === 'count'
  const x = style === 'count' ? width / 2 : 0
  const anchor = style === 'count' ? 'middle' : 'start'
  const weight = style === 'title' ? ' font-weight="600"' : ''
  const numerals = style === 'count' ? ' style="font-variant-numeric:tabular-nums"' : ''

  return {
    height,
    source: `<svg xmlns="http://www.w3.org/2000/svg" lang="${locale.tag}" viewBox="0 0 ${width} ${height}">${styleOf(locale.fonts)}<text x="${x}" y="${isSmall ? 12 : 14.5}" font-size="${isSmall ? 12 : 14}"${weight} text-anchor="${anchor}" class="${isInk ? 'ink' : 'sec'}" fill="${isInk ? INK : SECONDARY}"${numerals}>${escapeXml(text)}</text></svg>`,
  }
}

/** How the cache has held: a dot per recent touch, then the sentence, set against the right edge. */
export function historySvg(verdicts: readonly Verdict[], summary: string, locale: DrawingLocale = MESSAGES.en): { source: string; height: number } {
  const width = HISTORY_PIXELS
  // The sentence is anchored at the right edge; the dots sit to its left, by the width its 12px type takes.
  const wordsWidth = cells(summary) * 6.2
  const dotsWidth = verdicts.length * 9 - 3
  const start = Math.max(0, width - wordsWidth - 8 - dotsWidth)
  const dots = verdicts
    .map((verdict, i) => `<circle cx="${(start + 3 + i * 9).toFixed(1)}" cy="8" r="3" fill="${VERDICT_HEX[verdict]}"/>`)
    .join('')

  return {
    height: 16,
    source: `<svg xmlns="http://www.w3.org/2000/svg" lang="${locale.tag}" viewBox="0 0 ${width} 16">${styleOf(locale.fonts)}${dots}<text x="${width}" y="12" font-size="12" text-anchor="end" class="sec" fill="${SECONDARY}">${escapeXml(summary)}</text></svg>`,
  }
}

/** What the band and the panel need of the context window: its last measure and the compact control. */
export type ContextPart = {
  meter: ContextMeter | null
  isCompacting: boolean
  isLegendOpen: boolean
  /** False while a turn runs: compaction is refused then. */
  canCompact: boolean
  onCompact: () => void
  onLegend: () => void
  /** Which lists beneath the legend are open. */
  openLists: readonly ContextListKey[]
  onList: (key: ContextListKey) => void
  /** Opens a file the lists name, with the app the system gives its type. */
  onOpen: (path: string) => void
}

/** The compact control, or what stands in its place while one runs; nothing while a turn runs. */
function compactControl(els: Els, w: ContextWords, ctx: ContextPart): RenderNode | null {
  if (ctx.isCompacting) return els.Text({ dimColor: true, children: [w.compacting] })

  return ctx.canCompact ? els.Button({ key: 'compact', label: w.compact, variant: 'secondary', onPress: ctx.onCompact }) : null
}

/** The one-line band above the prompt: the cache's ring and time left, the context's ring and fill, compact, and the way into the panel. */
export function bandView(
  els: Els,
  surface: Surface,
  m: Messages,
  view: View,
  motion: Motion,
  onDetails: () => void,
  ctx: ContextPart,
): RenderElement {
  const { Box, Text, Button } = els
  const Svg = svgOf(els, surface)
  const w = contextWords(m.tag)
  const children: RenderNode[] = []

  const { held, now, policy, known } = view
  if (isTracked(held)) {
    const remaining = remainingOf(held, now)
    const head = remaining > 0 ? fmtRemaining(remaining) : held.coldReason === null ? m.bandCold : m.bandUnusable
    // With a keep-alive still to come the cache is not in danger, so nothing warns.
    const budget = budgetOf(held, policy.cap, known)
    const isSaved = policy.isOn && held.pingsSinceTurn < budget
    const isAlarming = isClosing(held, now) && !isSaved
    // The words stay the theme's own until something needs attention.
    const emphasis = remaining <= 0 ? { dimColor: true } : isAlarming ? { color: 'warning' } : {}
    children.push(
      Svg
        ? Box({ flexShrink: 0, children: [Svg({ alt: head, width: 18, height: 18, source: ringSvg('band', held, isSaved, motion, null, m) })] })
        : Text({ color: remaining > 0 ? EMBER : SLATE, children: [remaining > 0 ? '●' : '○'] }),
      Text({ bold: true, ...emphasis, children: [head] }),
    )
  }

  const meter = ctx.meter
  if (meter !== null) {
    const percent = percentOf(meter)
    const fill = `${w.label} ${fillText(meter, w)}`
    children.push(
      Svg
        ? Box({ flexShrink: 0, children: [Svg({ alt: fill, width: 18, height: 18, source: fillRingSvg(percent === null ? null : percent / 100, m.tag) })] })
        : Text({ color: CONTEXT_BLUE, children: ['◔'] }),
      Text({ dimColor: true, wrap: 'truncate-end', children: [fill] }),
    )
    const control = compactControl(els, w, ctx)
    if (control !== null) children.push(control)
  }

  // The way into the panel sits at the band's far edge.
  children.push(
    Box({ flexGrow: 1, children: [] }),
    Button({ key: 'details', label: m.details, plain: true, dimColor: true, onPress: onDetails }),
  )

  return Box({ flexDirection: 'row', columnGap: 1, alignItems: 'center', width: '100%', children })
}

/**
 * A row of words at both ends of a width, in the card's type: a heading (`title`), a list's name with its
 * count (`head`, in the legend's size), or an entry of an opened list (`item`).
 */
function splitSvg(left: string, right: string, style: 'title' | 'head' | 'item', locale: DrawingLocale, width = PANEL_PIXELS): { source: string; height: number } {
  const isTitle = style === 'title'
  const isInk = style !== 'item'
  const height = isTitle ? 20 : 18
  const size = isTitle ? 14 : 12
  const y = isTitle ? 14.5 : 13
  const leftText = left === '' ? '' : `<text x="0" y="${y}" font-size="${size}"${isTitle ? ' font-weight="600"' : ''} class="${isInk ? 'ink' : 'sec'}" fill="${isInk ? INK : SECONDARY}">${escapeXml(left)}</text>`
  const rightText = `<text x="${width}" y="${y}" font-size="${size}" text-anchor="end" class="sec" fill="${SECONDARY}" style="font-variant-numeric:tabular-nums">${escapeXml(right)}</text>`

  return { height, source: `<svg xmlns="http://www.w3.org/2000/svg" lang="${locale.tag}" viewBox="0 0 ${width} ${height}">${styleOf(locale.fonts)}${leftText}${rightText}</svg>` }
}

// A legend row's columns, as the app's popover sets them: the share against the right edge, the tokens before it.
const SHARE_PIXELS = 50
const TOKENS_GAP_PIXELS = 10

/** One legend row: the swatch (an empty box where nothing is drawn), the name, its tokens, and its share or, on demand, a dash. */
function legendRowSvg(name: string, tokens: string, share: string | null, swatch: string | null, locale: DrawingLocale): { source: string; height: number } {
  const width = PANEL_PIXELS
  const height = 18
  const box = swatch !== null
    ? `<rect x="0" y="4" width="10" height="10" rx="2" fill="${swatch}"/>`
    : `<rect x="0.5" y="4.5" width="9" height="9" rx="2" fill="none" stroke="${TRACK}"/>`
  const isDeferred = share === null
  const numerals = 'style="font-variant-numeric:tabular-nums"'
  const nameText = `<text x="16" y="13" font-size="12" class="${isDeferred ? 'sec' : 'ink'}" fill="${isDeferred ? SECONDARY : INK}">${escapeXml(name)}</text>`
  const tokensText = `<text x="${width - SHARE_PIXELS - TOKENS_GAP_PIXELS}" y="13" font-size="12" text-anchor="end" class="sec" fill="${SECONDARY}" ${numerals}>${escapeXml(tokens)}</text>`
  const shareText = isDeferred
    ? `<text x="${width}" y="13" font-size="12" text-anchor="end" class="sec" fill="${SECONDARY}">—</text>`
    : `<text x="${width}" y="13" font-size="12" font-weight="600" text-anchor="end" class="ink" fill="${INK}" ${numerals}>${escapeXml(share)}</text>`

  return { height, source: `<svg xmlns="http://www.w3.org/2000/svg" lang="${locale.tag}" viewBox="0 0 ${width} ${height}">${styleOf(locale.fonts)}${box}${nameText}${tokensText}${shareText}</svg>` }
}

/**
 * The panel's context section, laid out as the app's own popover: the share in use over the fill, the
 * segmented bar, and the room to auto-compact with compact, always shown; then, behind the legend control,
 * the legend largest first, what loads on demand apart, and the lists beneath it.
 */
function contextSection(els: Els, surface: Surface, m: Messages, ctx: ContextPart, columns: number): RenderNode | null {
  const meter = ctx.meter
  if (meter === null) return null
  const { Box, Text, Button } = els
  const Svg = svgOf(els, surface)
  const w = contextWords(m.tag)
  const between = (children: RenderNode[]) =>
    Box({ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', columnGap: 2, children })
  const used = w.used(percentOf(meter))
  const amount = amountText(meter, w)
  const toAuto = toAutoText(meter, w) ?? ''
  const control = compactControl(els, w, ctx)
  const hex = hexOf(meter)
  const rows: RenderNode[] = []

  // The desktop draws the words in the card's own type, as the rest of the panel does; the terminal in its text.
  if (Svg) {
    const title = labelSvg(w.title, PANEL_PIXELS, 'title', m)
    const head = splitSvg(used, amount, 'title', m)
    rows.push(
      Svg({ alt: w.title, width: PANEL_PIXELS, height: title.height, source: title.source }),
      Svg({ alt: `${used} ${amount}`, width: PANEL_PIXELS, height: head.height, source: head.source }),
      Svg({ alt: `${used} ${amount}`, width: PANEL_PIXELS, height: 6, source: barSvg(meter, PANEL_PIXELS, m.tag) }),
    )
    // Drawn only as wide as its words (14px type, about 7.3px a cell), so the compact button keeps the rest of the row.
    const wordsWidth = Math.min(LABEL_PIXELS, Math.ceil(cells(toAuto) * 7.3))
    const words = labelSvg(toAuto, wordsWidth, 'body', m)
    rows.push(between([Svg({ alt: toAuto, width: wordsWidth, height: words.height, source: words.source }), ...(control === null ? [] : [control])]))
  } else {
    const width = Math.max(10, Math.min(PANEL_CELLS, columns) - 2)
    rows.push(
      Text({ bold: true, children: [w.title] }),
      between([Text({ bold: true, children: [used] }), Text({ dimColor: true, children: [amount] })]),
      Box({
        flexDirection: 'row',
        children: barRuns(meter, width).map(run =>
          run.segment ? Text({ color: hex.get(run.segment), children: ['█'.repeat(run.cells)] }) : Text({ dimColor: true, children: ['░'.repeat(run.cells)] }),
        ),
      }),
      between([Text({ dimColor: true, children: [toAuto] }), ...(control === null ? [] : [control])]),
    )
  }
  rows.push(Button({ key: 'legend', label: ctx.isLegendOpen ? w.legendHide : w.legendShow, plain: true, dimColor: true, onPress: ctx.onLegend }))
  if (!ctx.isLegendOpen) return Box({ flexDirection: 'column', rowGap: Svg ? 1 : 0, children: rows })

  const share = (n: number) => `${((n / meter.max) * 100).toFixed(1)}%`
  const legendRow = (s: Segment): RenderNode => {
    const isDeferred = s.kind === 'deferred'
    const tokens = fmtK(s.tokens)
    const shown = isDeferred ? '—' : share(s.tokens)
    if (Svg) {
      const row = legendRowSvg(s.name, tokens, isDeferred ? null : shown, hex.get(s) ?? null, m)

      return Svg({ alt: `${s.name} ${tokens} ${shown}`, width: PANEL_PIXELS, height: row.height, source: row.source })
    }
    const color = hex.get(s)

    return Box({
      flexDirection: 'row',
      columnGap: 1,
      alignItems: 'center',
      children: [
        color === undefined ? Text({ dimColor: true, children: ['░'] }) : Text({ color, children: ['█'] }),
        Text({ dimColor: isDeferred, wrap: 'truncate-end', children: [s.name] }),
        Box({ flexGrow: 1, children: [] }),
        Text({ dimColor: true, children: [tokens] }),
        Box({ width: 6, flexShrink: 0, justifyContent: 'flex-end', children: [Text({ bold: !isDeferred, dimColor: isDeferred, children: [shown] })] }),
      ],
    })
  }
  const { inWindow, deferred } = legendGroups(meter)
  rows.push(Box({ flexDirection: 'column', children: inWindow.map(legendRow) }))
  if (deferred.length > 0) rows.push(Box({ flexDirection: 'column', children: deferred.map(legendRow) }))
  if (meter.lists !== undefined) rows.push(...listRows(els, Svg, m, w, ctx, meter.lists))

  return Box({ flexDirection: 'column', rowGap: Svg ? 1 : 0, children: rows })
}

// A one-glyph control and the gap after it, beside a list's words, as wide as the desktop drew them: it draws a
// Button's label in its own type, larger than the legend's, so the words are drawn and only the glyph is the control.
const GLYPH_PIXELS = 20

/** The lists beneath the legend, each behind its own control with its count; a file found on disk opens on a press. */
function listRows(els: Els, Svg: ReturnType<typeof svgOf>, m: Messages, w: ContextWords, ctx: ContextPart, lists: ContextLists): RenderNode[] {
  const { Box, Text, Button } = els
  const itemWidth = PANEL_PIXELS - 16
  const row = (children: RenderNode[]) => Box({ flexDirection: 'row', alignItems: 'center', columnGap: 1, children })
  const drawnLine = (left: string, right: string, style: 'head' | 'item', width: number): RenderNode => {
    const drawn = splitSvg(left, right, style, m, width)

    // Held at its own width: in a row beside a control the desktop stretched the drawing over the slot, its words with it.
    return Box({ flexShrink: 0, children: [Svg!({ alt: `${left} ${right}`.trim(), width, height: drawn.height, source: drawn.source })] })
  }
  const plainLine = (left: string, right = ''): RenderNode =>
    Svg
      ? drawnLine(left, right, 'item', itemWidth)
      : Box({ flexDirection: 'row', children: [Text({ dimColor: true, wrap: 'truncate-end', children: [left] }), Box({ flexGrow: 1, children: [] }), Text({ dimColor: true, children: [right] })] })
  const fileLine = (key: string, file: ContextFile): RenderNode => {
    const path = file.path
    if (path === null) return plainLine(file.name)
    const open = () => ctx.onOpen(path)

    return Svg
      ? row([Button({ key, label: '↗', plain: true, dimColor: true, onPress: open }), drawnLine(file.name, '', 'item', itemWidth - GLYPH_PIXELS)])
      : Button({ key, label: file.name, plain: true, dimColor: true, onPress: open })
  }
  const entries: { key: ContextListKey; count: number; items: () => RenderNode[] }[] = [
    {
      key: 'mcp',
      count: lists.mcpServers.reduce((sum, server) => sum + server.tools, 0),
      items: () => lists.mcpServers.map(server => plainLine(server.name, String(server.tools))),
    },
    { key: 'memory', count: lists.memoryFiles.length, items: () => lists.memoryFiles.map((file, i) => fileLine(`memory-${i}`, file)) },
    { key: 'agents', count: lists.agents.length, items: () => lists.agents.map((file, i) => fileLine(`agent-${i}`, file)) },
  ]
  const rows: RenderNode[] = []
  for (const { key, count, items } of entries) {
    if (count === 0) continue
    const isOpen = ctx.openLists.includes(key)
    const glyph = isOpen ? '⌄' : '›'
    const toggle = () => ctx.onList(key)
    rows.push(
      Svg
        ? row([Button({ key: `list-${key}`, label: glyph, plain: true, onPress: toggle }), drawnLine(w.lists[key], String(count), 'head', PANEL_PIXELS - GLYPH_PIXELS)])
        : Box({
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            children: [Button({ key: `list-${key}`, label: `${glyph} ${w.lists[key]}`, plain: true, onPress: toggle }), Text({ dimColor: true, children: [String(count)] })],
          }),
    )
    if (isOpen) rows.push(Box({ flexDirection: 'column', paddingLeft: 2, children: items() }))
  }

  return rows
}

/** The panel: the display card, then the keep-alive switch, its budget, and how the cache has held. */
export function paneView(
  els: Els,
  surface: Surface,
  m: Messages,
  view: View,
  lastAction: string,
  handlers: PaneHandlers,
  columns: number,
  motion: Motion = STILL,
  ctx: ContextPart | null = null,
): RenderElement {
  const { Box, Text, Button } = els
  const Svg = svgOf(els, surface)
  const { held, now, policy, known, observations } = view
  const context = ctx === null ? null : contextSection(els, surface, m, ctx, columns)
  // The context window leads the panel, as it leads the app's own usage popover.
  const lead: RenderNode[] = context === null ? [] : [context]
  const dim = (text: string) => Text({ dimColor: true, wrap: 'wrap', children: [text] })
  const between = (children: RenderNode[]) =>
    Box({ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', columnGap: 2, children })
  // Words beside a control: drawn in the card's type where the surface draws, the surface's own text otherwise.
  const words = (text: string, style: LabelStyle, width = LABEL_PIXELS): RenderNode => {
    if (!Svg) {
      return Text({ ...(style === 'title' ? { bold: true } : style === 'count' ? {} : { dimColor: true }), children: [text] })
    }
    const drawn = labelSvg(text, width, style, m)

    return Svg({ alt: text, width, height: drawn.height, source: drawn.source })
  }

  const tracked = isTracked(held) ? held : null
  const costs = tracked ? costsOf(tracked) : null
  const remaining = tracked ? remainingOf(tracked, now) : 0
  const budget = tracked ? budgetOf(tracked, policy.cap, known) : 0
  const left = tracked ? Math.max(0, budget - tracked.pingsSinceTurn) : 0
  const stretch = tracked ? TTL_MS[tracked.ttl] - LEAD_MS[tracked.ttl] : 0

  // What is read: the time left and a lapse set against a ping.
  const display: RenderNode[] = []
  if (tracked) {
    const tokens = fmtTokens(tracked.cachedTokens)
    const planned = policy.isOn && remaining > 0 ? left : 0
    const untilPing = remaining - LEAD_MS[tracked.ttl]
    const figure = remaining > 0 ? fmtRemaining(remaining) : tracked.coldReason === null ? m.bandCold : m.bandUnusable
    const caption =
      remaining <= 0
        ? m.heroCold(tokens, costs ? fmtUsd(costs.rewriteUsd) : '')
        : motion.pingAt !== null
          ? m.heroPinging
          : planned > 0
          ? m.heroAuto(untilPing > 0 ? fmtRemaining(untilPing) : '', fmtSpan(remaining + planned * stretch))
          : m.heroLeft(tokens)
    const share = costs && costs.rewriteUsd > 0 ? costs.pingUsd / costs.rewriteUsd : 1
    // The fuller sentence where it fits on the card's one line, the short one where it would not.
    const rule = costs ? m.breakEvenRule(costs.maxPings, (costs.hazardThreshold * 100).toFixed(1)) : ''
    const note = costs
      ? costs.maxPings === 0
        ? m.breakEvenNone
        : cells(rule) * 6 <= PANEL_PIXELS ? rule : m.breakEven(costs.maxPings)
      : ''

    if (Svg) {
      const card = cardSvg({ locale: m, figure, caption, isCold: remaining <= 0 })
      const isSaved = policy.isOn && left > 0
      // The ring and the bars enter together as the panel opens.
      const entering = motion.openedAt !== null ? sinceShown('card-open', motion.openedAt, motion.now, ENTER_MS) : null
      const drawings: RenderNode[] = [Box({
        flexDirection: 'row',
        columnGap: 2,
        alignItems: 'flex-start',
        children: [
          Box({ flexShrink: 0, children: [Svg({ alt: figure, width: 60, height: 60, source: ringSvg('card', tracked, isSaved, motion, entering, m) })] }),
          Svg({ alt: `${figure} ${caption}`, width: 238, height: card.height, source: card.source }),
        ],
      })]
      if (costs) {
        const source = costsSvg({
          lapseLabel: m.rowLapse,
          lapseUsd: fmtUsd(costs.rewriteUsd),
          pingLabel: m.rowPing,
          pingUsd: fmtUsd(costs.pingUsd),
          share,
          note,
        }, m, entering)
        drawings.push(Svg({ alt: `${m.rowLapse} ${fmtUsd(costs.rewriteUsd)} · ${m.rowPing} ${fmtUsd(costs.pingUsd)} · ${note}`, width: PANEL_PIXELS, height: 94, source }))
      }
      display.push(
        Box({ flexDirection: 'column', children: drawings }),
      )
      if (!costs) display.push(dim(m.noPrice))
    } else {
      const hex = remaining > 0 ? EMBER : SLATE
      const lit = Math.round(METER_CELLS * Math.min(1, Math.max(0, remaining / TTL_MS[tracked.ttl])))
      display.push(
        Box({
          flexDirection: 'column',
          children: [
            Box({
              flexDirection: 'row',
              columnGap: 1,
              children: [
                Text({ color: hex, children: [remaining > 0 ? '●' : '○'] }),
                Text({ bold: true, children: [figure] }),
                Text({ dimColor: true, children: [caption] }),
              ],
            }),
            Box({
              flexDirection: 'row',
              children: [
                Text({ color: hex, children: ['━'.repeat(lit)] }),
                Text({ dimColor: true, children: ['━'.repeat(METER_CELLS - lit)] }),
              ],
            }),
          ],
        }),
      )
      if (costs) {
        const labelCells = Math.max(cells(m.rowLapse), cells(m.rowPing)) + 1
        const compare = (label: string, lengthShare: number, isAccent: boolean, usd: string) =>
          Box({
            flexDirection: 'row',
            columnGap: 1,
            children: [
              Box({ width: labelCells, flexShrink: 0, children: [Text({ dimColor: true, children: [label] })] }),
              Box({
                flexGrow: 1,
                children: [
                  Text({
                    ...(isAccent ? { color: EMBER } : { dimColor: true }),
                    children: ['━'.repeat(Math.max(1, Math.round(BAR_CELLS * Math.min(1, lengthShare))))],
                  }),
                ],
              }),
              Text({ bold: true, children: [usd] }),
            ],
          })
        display.push(
          Box({
            flexDirection: 'column',
            children: [
              compare(m.rowLapse, 1, false, fmtUsd(costs.rewriteUsd)),
              compare(m.rowPing, share, true, fmtUsd(costs.pingUsd)),
              dim(costs.maxPings === 0 ? m.breakEvenNone : m.breakEven(costs.maxPings)),
            ],
          }),
        )
      } else {
        display.push(dim(m.noPrice))
      }
    }
  } else {
    display.push(dim(m.paneNothing))
  }

  // What is pressed: the switch, with its budget on the line beneath.
  const isTrial = tracked !== null && known[tracked.ttl] !== true && policy.cap > 1
  const plan = !tracked
    ? m.autoPlanOff(policy.cap, '')
    : left <= 0
      ? costs !== null && costs.maxPings === 0 ? m.autoNotWorth : m.autoSpent
      : isTrial
        ? policy.isOn
          ? m.autoTrialOn(tracked.pingsSinceTurn, policy.cap)
          : m.autoTrialOff(policy.cap)
        : policy.isOn
          ? m.autoPlanOn(tracked.pingsSinceTurn, budget)
          : m.autoPlanOff(left, fmtSpan(Math.max(0, remaining) + left * stretch))
  const capWords = String(policy.cap)
  const stepper = Box({
    flexDirection: 'row',
    columnGap: 1,
    alignItems: 'center',
    flexShrink: 0,
    children: [
      Button({ key: 'cap-down', label: '−', variant: 'secondary', onPress: handlers.onCapDown }),
      words(capWords, 'count', capWords.length * 9 + 2),
      Button({ key: 'cap-up', label: '+', variant: 'secondary', onPress: handlers.onCapUp }),
    ],
  })
  const switchRows = [
    between([
      words(m.autoTitle, 'title'),
      Button({
        key: 'auto-toggle',
        label: policy.isOn ? m.btnOff : m.btnOn,
        variant: policy.isOn ? 'secondary' : 'primary',
        onPress: handlers.onToggle,
      }),
    ]),
    between([words(plan, 'body'), stepper]),
  ]

  // How the cache has held, beside the button that pings now; under it, what the last press did and the price basis.
  const recent = observations.slice(-8)
  const misses = recent.filter(one => one.verdict !== 'hit').length
  const summary =
    recent.length === 0 ? m.historyEmpty : misses === 0 ? m.historyAll(recent.length) : m.historySome(recent.length, misses)
  let history: RenderNode
  if (Svg) {
    const drawn = historySvg(recent.map(one => one.verdict), summary, m)
    history = Svg({ alt: summary, width: HISTORY_PIXELS, height: drawn.height, source: drawn.source })
  } else {
    history = Box({
      flexDirection: 'row',
      columnGap: 1,
      flexShrink: 0,
      children: [
        ...recent.map(one => Text({ color: VERDICT_HEX[one.verdict], children: ['●'] })),
        Text({ dimColor: true, children: [summary] }),
      ],
    })
  }
  const footer: RenderNode[] = [
    tracked
      ? between([Button({ key: 'ping', label: m.btnPing, variant: 'secondary', onPress: handlers.onPing }), history])
      : history,
  ]
  if (lastAction) footer.push(dim(lastAction))
  if (costs) {
    footer.push(words(left > 0 ? m.priceNote(fmtUsd(left * costs.pingUsd)) : m.listPrice, 'small', PANEL_PIXELS))
  }

  if (!Svg) {
    // A terminal counts in lines: one between sections, none inside them.
    return Box({
      flexDirection: 'column',
      rowGap: 1,
      paddingX: 1,
      width: Math.max(24, Math.min(PANEL_CELLS, columns)),
      children: [
        ...lead,
      ...display,
        Text({ dimColor: true, children: ['─'.repeat(METER_CELLS)] }),
        Box({ flexDirection: 'column', children: switchRows }),
        Box({ flexDirection: 'column', children: footer }),
      ],
    })
  }

  // The desktop counts in 8px steps: three between sections, two under the rule, one between the rows of a section.
  return Box({
    flexDirection: 'column',
    rowGap: 3,
    paddingX: 1,
    width: Math.max(24, Math.min(PANEL_CELLS, columns)),
    children: [
      ...lead,
      ...display,
      Box({
        flexDirection: 'column',
        rowGap: 2,
        children: [
          Svg({
            alt: '—',
            width: PANEL_PIXELS,
            height: 1,
            source: `<svg xmlns="http://www.w3.org/2000/svg" lang="${m.tag}" viewBox="0 0 ${PANEL_PIXELS} 1"><rect width="${PANEL_PIXELS}" height="1" fill="${TRACK}"/></svg>`,
          }),
          Box({ flexDirection: 'column', rowGap: 1, children: switchRows }),
        ],
      }),
      Box({ flexDirection: 'column', rowGap: 1, children: footer }),
    ],
  })
}
