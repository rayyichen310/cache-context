import type { Snapshot } from '../../types'
import type { Messages } from './en'
import { makeSpan } from './shared'
import type { Verdict } from './shared'

const SOURCE_KN: Record<Snapshot['ttlSource'], string> = { env: 'ಎನ್ವಿರಾನ್‌ಮೆಂಟ್', observed: 'ಅಳತೆ ಮಾಡಿದ', assumed: 'ಊಹಿಸಿದ' }
const BY_KN: Record<Snapshot['touchedBy'], string> = { turn: 'ಸಂದೇಶ', ping: 'refresh', resume: 'ಮತ್ತೆ ಆರಂಭಿಸಿದ ಸೆಷನ್' }
const VERDICT_KN: Record<Verdict, string> = { hit: 'hit', partial: 'ಭಾಗಶಃ hit', miss: 'miss' }
const spanKn = makeSpan({ units: { s: 'ಸೆ.', m: 'ನಿ.', h: 'ಗಂ.' } })

export const kn: Messages = {
  name: 'ಕನ್ನಡ',
  tag: 'kn',
  fonts: '',

  bandCold: 'ಮುಗಿದಿದೆ',
  bandUnusable: 'ಲಭ್ಯವಿಲ್ಲ',
  bandWarmDetail: (size, cost) => `${size} cached${cost && ` · ಅವಧಿ ಮುಗಿದರೆ ಮರುನಿರ್ಮಾಣಕ್ಕೆ ${cost}`}`,
  bandAutoDetail: (size, used, budget) => `${size} cached · auto-refresh ${used}/${budget}`,
  bandColdDetail: (size, cost) => `ಮುಂದಿನ ಸಂದೇಶ ${size} tokens cache ಅನ್ನು ಮರುನಿರ್ಮಿಸುತ್ತದೆ${cost && ` (≈${cost})`}`,

  cmdStatus: 'Prompt cache ಸ್ಥಿತಿ, ಉಳಿದ ಸಮಯ ಮತ್ತು ಮರುನಿರ್ಮಾಣದ ಅಂದಾಜು ವೆಚ್ಚ ನೋಡಿ',
  cmdPing: 'Prompt cache ಈಗ refresh ಮಾಡಿ',
  cmdAuto: 'Auto-refresh ಸೆಟ್ಟಿಂಗ್‌ಗಳನ್ನು ನೋಡಿ ಅಥವಾ ಬದಲಿಸಿ',
  cmdAutoHint: '[on|off] [refresh ಮಿತಿ]',
  cmdLang: 'ಇಂಟರ್‌ಫೇಸ್ ಭಾಷೆ ಆರಿಸಿ',
  cmdLangHint: '[auto|code]',

  expiredAgo: gap => `${spanKn(gap)} ಹಿಂದೆ ಅವಧಿ ಮುಗಿದಿದೆ`,
  coldPing: 'ಕೊನೆಯ refresh ನಲ್ಲಿ cache miss ಆಗಿದೆ',
  coldModel: model => `ಮಾಡೆಲ್ ${model} ಗೆ ಬದಲಾಗಿದೆ`,

  pingNothing: 'ಇನ್ನೂ cache ಇಲ್ಲ, ಆದ್ದರಿಂದ refresh ಮಾಡಲು ಏನೂ ಇಲ್ಲ.',
  pingBusy: 'ಈಗಾಗಲೇ refresh ನಡೆಯುತ್ತಿದೆ.',
  pingCold: (why, size) =>
    `ಕಳುಹಿಸಿಲ್ಲ: cache ಸಕ್ರಿಯವಾಗಿಲ್ಲ (${why}). ಈಗ ವಿನಂತಿ ಕಳುಹಿಸಿದರೆ ಎಲ್ಲಾ ${size} tokens ಅನ್ನು cache ಬರೆಯುವ ದರದಲ್ಲಿ ಮರುನಿರ್ಮಿಸಲಾಗುತ್ತದೆ. ಆದರೂ ಕಳುಹಿಸಲು /cache-ping force ಚಲಾಯಿಸಿ.`,
  pingNoFork: 'ಕಳುಹಿಸಿಲ್ಲ: ಈ ಸಂಭಾಷಣೆಯಲ್ಲಿ ಇನ್ನೂ ಉತ್ತರ ಬಂದಿಲ್ಲ.',
  pingApiError: (error, status) => `Refresh ವಿಫಲ: API ದೋಷ (${error}, ಸ್ಥಿತಿ ${status ?? 'ಇಲ್ಲ'}). ಕೌಂಟ್‌ಡೌನ್ ಮರುಹೊಂದಿಸಿಲ್ಲ.`,
  pingCut: 'API ಉತ್ತರಿಸುವ ಮುನ್ನ refresh ನಿಂತಿತು. ಕೌಂಟ್‌ಡೌನ್ ಮರುಹೊಂದಿಸಿಲ್ಲ.',
  counts: c => `ಓದಿದವು ${c.read}, ಬರೆದವು ${c.wrote}, ಇನ್‌ಪುಟ್ ${c.input}, ಔಟ್‌ಪುಟ್ ${c.output}`,
  atListPrice: usd => ` API ಪಟ್ಟಿ ದರದಲ್ಲಿ ≈${usd}.`,
  pingHit: (counts, cost, ttl) => `Cache refresh ಆಗಿದೆ: ${counts}.${cost} ಕೌಂಟ್‌ಡೌನ್ ${spanKn(ttl)} ಗೆ ಮರುಹೊಂದಿಸಲಾಗಿದೆ.`,
  pingRewrote: (counts, cost) => `Cache miss. Cache ಮರುನಿರ್ಮಿಸಲಾಗಿದೆ: ${counts}.${cost}`,
  pingMissed: (counts, cost) => `Cache miss: ${counts}.${cost} Cache ಅವಧಿ ವಿಸ್ತರಿಸಿಲ್ಲ.`,
  autoLog: (n, budget, text) => `Auto-refresh ${n}/${budget}. ${text}`,
  autoMissToast: 'Auto-refresh ಯಶಸ್ವಿಯಾಗಿಲ್ಲ. /cache-status ನೋಡಿ',
  idlePaused: 'Auto-refresh ಆನ್ ಇರುವವರೆಗೆ idle compaction ಆಫ್ ಆಗಿದೆ, ಹೀಗಾಗಿ ದೀರ್ಘ ಸಂಭಾಷಣೆ refresh ಗೆ ಮೊದಲು compact ಆಗುವುದಿಲ್ಲ. Auto-refresh ಆಫ್ ಮಾಡಿದಾಗ ಇದು ಮತ್ತೆ ಆನ್ ಆಗುತ್ತದೆ.',
  idleRestored: 'Idle compaction ಮತ್ತೆ ಆನ್ ಆಗಿದೆ.',

  reportNothing: 'Prompt cache: ಇನ್ನೂ cache ಇಲ್ಲ. ಮುಂದಿನ ಉತ್ತರದ ನಂತರ ಕೌಂಟ್‌ಡೌನ್ ಆರಂಭವಾಗುತ್ತದೆ.',
  reportWarm: left => `Prompt cache: ಸಕ್ರಿಯ, ${spanKn(left)} ಬಾಕಿ.`,
  reportCold: why => `Prompt cache: ಸಕ್ರಿಯವಾಗಿಲ್ಲ (${why}).`,
  reportTtl: (ttl, source) => `  ಅವಧಿ: ${spanKn(ttl)} (${SOURCE_KN[source]})`,
  reportCached: (size, model, by, since) =>
    `  Cached: ${model} ನಲ್ಲಿ ${size} tokens, ಕೊನೆಯ ಬಳಕೆ ${spanKn(since)} ಹಿಂದೆ (${BY_KN[by]})`,
  reportNoPrice: '  ವೆಚ್ಚ: ಈ ಮಾಡೆಲ್‌ನ ದರ ಲಭ್ಯವಿಲ್ಲ',
  reportLapse: (lapse, rewrite) => `  ಅವಧಿ ಮುಗಿದರೆ: ಮರುನಿರ್ಮಾಣಕ್ಕೆ ${rewrite}, cache hit ಗಿಂತ ${lapse} ಹೆಚ್ಚು`,
  reportPing: (ping, isMeasured, max) =>
    `  ಒಂದು refresh: ಸುಮಾರು ${ping} (token ವೆಚ್ಚ ${isMeasured ? 'ಅಳತೆ ಮಾಡಿದ್ದು' : 'ಅಂದಾಜು'}). ಸತತವಾಗಿ ${max} ವರೆಗೆ refresh ಮಾಡುವ ವೆಚ್ಚ ಒಂದು ಮರುನಿರ್ಮಾಣಕ್ಕಿಂತ ಕಡಿಮೆ`,
  reportPingNone: (ping, isMeasured) =>
    `  ಒಂದು refresh: ಸುಮಾರು ${ping} (token ವೆಚ್ಚ ${isMeasured ? 'ಅಳತೆ ಮಾಡಿದ್ದು' : 'ಅಂದಾಜು'}). ಇದು ಅವಧಿ ಮುಗಿಯುವುದರಿಂದ ಹೆಚ್ಚುವ ವೆಚ್ಚಕ್ಕಿಂತ ಹೆಚ್ಚು, ಆದ್ದರಿಂದ refresh ಲಾಭದಾಯಕವಲ್ಲ`,
  reportRule: (ttl, percent) => `  ಸಾಮಾನ್ಯ ನಿಯಮ: ${spanKn(ttl)} ಒಳಗೆ ಮರಳುವ ಸಾಧ್ಯತೆ ${percent}% ಗಿಂತ ಹೆಚ್ಚಿದ್ದರೆ refresh ಲಾಭದಾಯಕ`,
  reportLastPing: (ago, counts) => `  ಕೊನೆಯ refresh: ${spanKn(ago)} ಹಿಂದೆ, ${counts}`,
  reportTouches: 'ಇತ್ತೀಚಿನ cache ಚಟುವಟಿಕೆ:',
  reportTouch: (kind, gap, prevBy, ttl, verdict, read, cached) =>
    `  ${BY_KN[kind]}, ಹಿಂದಿನ ${BY_KN[prevBy]} ನಂತರ ${spanKn(gap)} (${spanKn(ttl)}): ${VERDICT_KN[verdict]}, ${cached} ರಲ್ಲಿ ${read} ಓದಿದವು`,
  reportFooter: 'ವೆಚ್ಚಗಳು API ಪಟ್ಟಿ ದರದ ಅಂದಾಜುಗಳು. ಚಂದಾದಾರಿಕೆಯಲ್ಲಿ ಇವು ಪ್ಲಾನ್ ಬಳಕೆಯನ್ನು ಸೂಚಿಸುತ್ತವೆ, ಶುಲ್ಕವನ್ನಲ್ಲ.',

  autoHeader: 'Auto-refresh:',
  autoOff: '  Auto-refresh: ಆಫ್ (ನೀವು ದೂರವಿದ್ದಾಗ cache ಸಕ್ರಿಯವಾಗಿರಿಸಲು /cache-auto on ಚಲಾಯಿಸಿ)',
  autoWaiting: cap => `  Auto-refresh: ಆನ್, ಪ್ರತಿ ನಿಷ್ಕ್ರಿಯ ಅವಧಿಯಲ್ಲಿ ಗರಿಷ್ಠ ${cap}. ಮೊದಲ ಉತ್ತರಕ್ಕಾಗಿ ಕಾಯುತ್ತಿದೆ`,
  autoOn: (used, budget, cap, next) =>
    `  Auto-refresh: ಆನ್, ನಿಮ್ಮ ಕೊನೆಯ ಸಂದೇಶದ ನಂತರ ${used}/${budget} ಬಳಕೆಯಾಗಿದೆ (ಮಿತಿ ${cap}). ಮುಂದಿನದು: ${next}`,
  autoOnNone: cap => `  Auto-refresh: ಆನ್ (ಮಿತಿ ${cap}), ಆದರೆ ಕಳುಹಿಸುತ್ತಿಲ್ಲ: ಈ cache refresh ವೆಚ್ಚವು ಅವಧಿ ಮುಗಿಯುವುದರಿಂದ ಹೆಚ್ಚುವ ವೆಚ್ಚಕ್ಕಿಂತ ಹೆಚ್ಚು`,
  nextCold: 'ಇಲ್ಲ, cache ಸಕ್ರಿಯವಾಗಿಲ್ಲ',
  nextSpent: 'ಇಲ್ಲ, ಈ ನಿಷ್ಕ್ರಿಯ ಅವಧಿಯ ಮಿತಿ ಮುಗಿದಿದೆ',
  nextIn: time => `${spanKn(time)} ನಂತರ`,
  nextNow: 'ಯಾವುದೇ ಕ್ಷಣದಲ್ಲಿ',
  autoPings: state => `  ಪರಿಣಾಮ: ${state}`,
  extendsYes: ttl => `ದೃಢಪಟ್ಟಿದೆ, refresh ಪೂರ್ಣ ${spanKn(ttl)} ಅವಧಿಯನ್ನು ಮರಳಿ ಕೊಡುತ್ತದೆ`,
  extendsNo: 'ದೃಢಪಟ್ಟಿಲ್ಲ. ಕೊನೆಯ refresh ನಂತರ cache miss ಆಗಿದೆ, ಆದ್ದರಿಂದ ಪ್ರತಿ ನಿಷ್ಕ್ರಿಯ ಅವಧಿಯಲ್ಲಿ ಒಂದೇ auto-refresh ಕಳುಹಿಸುತ್ತದೆ',
  extendsUnknown: ttl => `ಇನ್ನೂ ದೃಢಪಟ್ಟಿಲ್ಲ. Refresh ಪೂರ್ಣ ${spanKn(ttl)} ಅವಧಿಯನ್ನು ಮರಳಿ ಕೊಡುತ್ತದೆ ಎಂದು ದೃಢವಾಗುವವರೆಗೆ ಪ್ರತಿ ನಿಷ್ಕ್ರಿಯ ಅವಧಿಯಲ್ಲಿ ಒಂದೇ auto-refresh ಕಳುಹಿಸುತ್ತದೆ`,
  autoNote: '  ಸೂಚನೆ: ಆ್ಯಪ್ ಚಾಲನೆಯಲ್ಲಿದ್ದು ಕಂಪ್ಯೂಟರ್ ಎಚ್ಚರವಿದ್ದಾಗ ಮಾತ್ರ refresh ಕಳುಹಿಸಲಾಗುತ್ತದೆ. ಪ್ರತಿಯೊಂದೂ ಪ್ಲಾನ್ ಬಳಕೆ ಅಥವಾ API ಕ್ರೆಡಿಟ್‌ನಲ್ಲಿ ಲೆಕ್ಕವಾಗುತ್ತದೆ',
  autoUsage: max => `ಬಳಕೆ: /cache-auto [on|off] [ಪ್ರತಿ ನಿಷ್ಕ್ರಿಯ ಅವಧಿಯ refresh ಮಿತಿ, 1-${max}]`,

  details: 'ವಿವರ ›',
  cmdPanel: 'Prompt cache ಪ್ಯಾನಲ್ ತೆರೆಯಿರಿ',
  paneTitle: 'Prompt cache',
  paneNothing: 'ಇನ್ನೂ cache ಇಲ್ಲ. ಮುಂದಿನ ಉತ್ತರದ ನಂತರ ಕೌಂಟ್‌ಡೌನ್ ಆರಂಭವಾಗುತ್ತದೆ.',
  heroLeft: size => `ಬಾಕಿ · ${size} tokens cached`,
  heroAuto: (time, span) => `${time ? `${spanKn(time)} ನಂತರ refresh` : 'ಶೀಘ್ರವೇ refresh'} · ≤~${spanKn(span)}`,
  heroCold: (size, cost) => `${size} ಮರುನಿರ್ಮಾಣ${cost && ` (≈${cost})`}`,
  heroPinging: 'Refresh ನಡೆಯುತ್ತಿದೆ…',
  rowLapse: 'ಅವಧಿ ಮುಗಿದರೆ',
  rowPing: 'ಒಂದು refresh',
  breakEven: max => `${max} refresh ≈ 1 ಮರುನಿರ್ಮಾಣ`,
  breakEvenNone: 'Refresh ವೆಚ್ಚ ಮರುನಿರ್ಮಾಣಕ್ಕಿಂತ ಹೆಚ್ಚು',
  breakEvenRule: (max, percent) => `${max} refresh ≈ 1 ಮರುನಿರ್ಮಾಣ · ಮರಳುವ ಸಾಧ್ಯತೆ ${percent}%+ ಇದ್ದರೆ ಲಾಭ`,
  noPrice: 'ಈ ಮಾಡೆಲ್‌ನ ದರ ಲಭ್ಯವಿಲ್ಲ',
  autoTitle: 'ದೂರವಿದ್ದಾಗ auto-refresh',
  btnOn: 'ಆನ್',
  btnOff: 'ಆಫ್',
  autoPlanOff: (left, span) => `${left} ವರೆಗೆ${span && ` · ~${spanKn(span)}`}`,
  autoPlanOn: (used, budget) => `${used}/${budget} ಬಳಕೆ`,
  autoTrialOff: cap => `1 ಪರೀಕ್ಷೆ, ಫಲಿಸಿದರೆ ≤${cap}`,
  autoTrialOn: (used, cap) => `ಪರೀಕ್ಷೆ ${used}/1, ಫಲಿಸಿದರೆ ≤${cap}`,
  autoSpent: 'ಸಂದೇಶದವರೆಗೆ ಬಾಕಿ ಇಲ್ಲ',
  autoNotWorth: 'ಈ cache ಗೆ ಲಾಭವಿಲ್ಲ',
  historyAll: n => `ಕೊನೆಯ ${n}: hit`,
  historySome: (n, misses) => `${n} ರಲ್ಲಿ ${misses} miss`,
  historyEmpty: 'ಇನ್ನೂ ಇತಿಹಾಸವಿಲ್ಲ',
  btnPing: 'Refresh',
  listPrice: 'API ಪಟ್ಟಿ ದರದ ಅಂದಾಜುಗಳು',
  priceNote: cap => `ಅಂದಾಜು ಗರಿಷ್ಠ ${cap} · API ಪಟ್ಟಿ ದರ`,

  langNow: (name, source) =>
    `ಭಾಷೆ: ${name} (${{ pinned: 'ನಿಮ್ಮ ಆಯ್ಕೆ', conversation: 'ಸಂಭಾಷಣೆಯಂತೆ', locale: 'ಸಿಸ್ಟಮ್‌ನಂತೆ', default: 'ಡೀಫಾಲ್ಟ್' }[source]}).`,
  langUsage: codes => `ಬಳಕೆ: /cache-lang [auto|code]. ಕೋಡ್‌ಗಳು: ${codes}`,
}
