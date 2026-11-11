import type { Snapshot } from '../../types'
import type { Messages } from './en'
import { makeSpan } from './shared'
import type { Verdict } from './shared'

const SOURCE_TA: Record<Snapshot['ttlSource'], string> = { env: 'சூழல்', observed: 'அளவிட்டது', assumed: 'கருதப்பட்டது' }
const BY_TA: Record<Snapshot['touchedBy'], string> = { turn: 'செய்தி', ping: 'refresh', resume: 'மீண்டும் தொடங்கிய அமர்வு' }
const VERDICT_TA: Record<Verdict, string> = { hit: 'hit', partial: 'பகுதி hit', miss: 'miss' }
const spanTa = makeSpan({ units: { s: 'வி', m: 'நி', h: 'ம' }, space: false })

export const ta: Messages = {
  name: 'தமிழ்',
  tag: 'ta',
  fonts: '',

  bandCold: 'காலாவதி',
  bandUnusable: 'இல்லை',
  bandWarmDetail: (size, cost) => `${size} cached${cost && ` · காலாவதியானால் மீள உருவாக்க ${cost}`}`,
  bandAutoDetail: (size, used, budget) => `${size} cached · auto-refresh ${used}/${budget}`,
  bandColdDetail: (size, cost) => `அடுத்த செய்தி ${size} tokens cache-ஐ மீள உருவாக்கும்${cost && ` (≈${cost})`}`,

  cmdStatus: 'Prompt cache நிலை, மீதமுள்ள நேரம், மீள உருவாக்கும் செலவின் மதிப்பீட்டைக் காணவும்',
  cmdPing: 'Prompt cache-ஐ இப்போது refresh செய்யவும்',
  cmdAuto: 'Auto-refresh அமைப்புகளைக் காணவும் அல்லது மாற்றவும்',
  cmdAutoHint: '[on|off] [refresh வரம்பு]',
  cmdLang: 'இடைமுக மொழியைத் தேர்ந்தெடுக்கவும்',
  cmdLangHint: '[auto|code]',

  expiredAgo: gap => `${spanTa(gap)} முன் காலாவதியானது`,
  coldPing: 'கடைசி refresh-இல் cache miss ஏற்பட்டது',
  coldModel: model => `மாடல் ${model} ஆக மாறியது`,

  pingNothing: 'இன்னும் cache இல்லை, எனவே refresh செய்ய எதுவும் இல்லை.',
  pingBusy: 'ஏற்கனவே refresh நடைபெறுகிறது.',
  pingCold: (why, size) =>
    `அனுப்பவில்லை: cache செயலில் இல்லை (${why}). இப்போது கோரிக்கை அனுப்பினால், ${size} tokens முழுவதும் cache எழுதும் விலையில் மீள உருவாக்கப்படும். இருந்தும் அனுப்ப /cache-ping force இயக்கவும்.`,
  pingNoFork: 'அனுப்பவில்லை: இந்த உரையாடலில் இன்னும் பதில் இல்லை.',
  pingApiError: (error, status) => `Refresh தோல்வி: API பிழை (${error}, நிலை ${status ?? 'இல்லை'}). கவுன்ட்டவுன் மீட்டமைக்கப்படவில்லை.`,
  pingCut: 'API பதில் வரும் முன் refresh தடைப்பட்டது. கவுன்ட்டவுன் மீட்டமைக்கப்படவில்லை.',
  counts: c => `வாசித்தது ${c.read}, எழுதியது ${c.wrote}, உள்ளீடு ${c.input}, வெளியீடு ${c.output}`,
  atListPrice: usd => ` API பட்டியல் விலையில் ≈${usd}.`,
  pingHit: (counts, cost, ttl) => `Cache refresh ஆனது: ${counts}.${cost} கவுன்ட்டவுன் ${spanTa(ttl)} ஆக மீட்டமைக்கப்பட்டது.`,
  pingRewrote: (counts, cost) => `Cache miss. Cache மீள உருவாக்கப்பட்டது: ${counts}.${cost}`,
  pingMissed: (counts, cost) => `Cache miss: ${counts}.${cost} Cache காலம் நீட்டிக்கப்படவில்லை.`,
  autoLog: (n, budget, text) => `Auto-refresh ${n}/${budget}. ${text}`,
  autoMissToast: 'Auto-refresh வெற்றிபெறவில்லை. /cache-status பார்க்கவும்',
  idlePaused: 'Auto-refresh இயங்கும் வரை idle compaction அணைக்கப்பட்டுள்ளது, அதனால் நீண்ட உரையாடல் refresh-க்கு முன் compact ஆகாது. Auto-refresh அணைந்ததும் இது மீண்டும் இயங்கும்.',
  idleRestored: 'Idle compaction மீண்டும் இயங்குகிறது.',

  reportNothing: 'Prompt cache: இன்னும் cache இல்லை. அடுத்த பதிலுக்குப் பிறகு கவுன்ட்டவுன் தொடங்கும்.',
  reportWarm: left => `Prompt cache: செயலில் உள்ளது, ${spanTa(left)} மீதம்.`,
  reportCold: why => `Prompt cache: செயலில் இல்லை (${why}).`,
  reportTtl: (ttl, source) => `  காலம்: ${spanTa(ttl)} (${SOURCE_TA[source]})`,
  reportCached: (size, model, by, since) =>
    `  Cached: ${model}-இல் ${size} tokens, கடைசிப் பயன்பாடு ${spanTa(since)} முன் (${BY_TA[by]})`,
  reportNoPrice: '  செலவு: இந்த மாடலின் விலை கிடைக்கவில்லை',
  reportLapse: (lapse, rewrite) => `  காலாவதியானால்: மீள உருவாக்க ${rewrite}, cache hit-ஐ விட ${lapse} அதிகம்`,
  reportPing: (ping, isMeasured, max) =>
    `  ஒரு refresh: சுமார் ${ping} (token செலவு ${isMeasured ? 'அளவிட்டது' : 'மதிப்பிட்டது'}). தொடர்ச்சியாக ${max} வரை refresh செய்வது ஒருமுறை மீள உருவாக்குவதை விட மலிவானது`,
  reportPingNone: (ping, isMeasured) =>
    `  ஒரு refresh: சுமார் ${ping} (token செலவு ${isMeasured ? 'அளவிட்டது' : 'மதிப்பிட்டது'}). இது காலாவதியால் கூடும் செலவை விட அதிகம், எனவே refresh செய்வதில் சேமிப்பு இல்லை`,
  reportRule: (ttl, percent) => `  பொதுவிதி: ${spanTa(ttl)} நேரத்திற்குள் திரும்பும் வாய்ப்பு ${percent}% மேல் இருந்தால் refresh செய்வது செலவைச் சேமிக்கும்`,
  reportLastPing: (ago, counts) => `  கடைசி refresh: ${spanTa(ago)} முன், ${counts}`,
  reportTouches: 'சமீபத்திய cache செயல்பாடு:',
  reportTouch: (kind, gap, prevBy, ttl, verdict, read, cached) =>
    `  ${BY_TA[kind]}, முந்தைய ${BY_TA[prevBy]} முடிந்து ${spanTa(gap)} பிறகு (${spanTa(ttl)}): ${VERDICT_TA[verdict]}, ${cached}-இல் ${read} வாசித்தது`,
  reportFooter: 'செலவுகள் API பட்டியல் விலையில் மதிப்பீடுகள். சந்தாவில் இவை திட்டப் பயன்பாட்டைக் குறிக்கும், கட்டணத்தை அல்ல.',

  autoHeader: 'Auto-refresh:',
  autoOff: '  Auto-refresh: முடக்கப்பட்டுள்ளது (நீங்கள் விலகியிருக்கும்போது cache செயலில் இருக்க /cache-auto on இயக்கவும்)',
  autoWaiting: cap => `  Auto-refresh: இயக்கப்பட்டுள்ளது, ஒவ்வொரு செயலற்ற காலத்திலும் அதிகபட்சம் ${cap} முறை. முதல் பதிலுக்காகக் காத்திருக்கிறது`,
  autoOn: (used, budget, cap, next) =>
    `  Auto-refresh: இயக்கப்பட்டுள்ளது, உங்கள் கடைசிச் செய்திக்குப் பிறகு ${used}/${budget} பயன்படுத்தப்பட்டது (வரம்பு ${cap}). அடுத்து: ${next}`,
  autoOnNone: cap => `  Auto-refresh: இயக்கப்பட்டுள்ளது (வரம்பு ${cap}), ஆனால் அனுப்பவில்லை: இந்த cache-ஐ refresh செய்வது காலாவதியால் கூடும் செலவை விட அதிகம்`,
  nextCold: 'இல்லை, cache செயலில் இல்லை',
  nextSpent: 'இல்லை, இந்தச் செயலற்ற காலத்தின் வரம்பு தீர்ந்தது',
  nextIn: time => `${spanTa(time)} பிறகு`,
  nextNow: 'எந்த நேரத்திலும்',
  autoPings: state => `  விளைவு: ${state}`,
  extendsYes: ttl => `உறுதிப்படுத்தப்பட்டது, refresh முழு ${spanTa(ttl)} காலத்தை மீட்டுத் தருகிறது`,
  extendsNo: 'உறுதிப்படுத்தப்படவில்லை. கடைசி refresh-க்குப் பிறகு cache miss ஏற்பட்டது, எனவே ஒவ்வொரு செயலற்ற காலத்திலும் ஒரே ஒரு auto-refresh அனுப்பப்படும்',
  extendsUnknown: ttl => `இன்னும் உறுதிப்படுத்தப்படவில்லை. Refresh முழு ${spanTa(ttl)} காலத்தை மீட்டுத் தருவது உறுதியாகும் வரை ஒவ்வொரு செயலற்ற காலத்திலும் ஒரே ஒரு auto-refresh அனுப்பப்படும்`,
  autoNote: '  குறிப்பு: செயலி இயங்கும்போதும் கணினி விழித்திருக்கும்போதும் மட்டுமே refresh அனுப்பப்படும். ஒவ்வொன்றும் திட்டப் பயன்பாடு அல்லது API கிரெடிட்டில் கணக்கிடப்படும்',
  autoUsage: max => `பயன்பாடு: /cache-auto [on|off] [ஒவ்வொரு செயலற்ற காலத்திற்கான refresh வரம்பு, 1-${max}]`,

  details: 'விவரம் ›',
  cmdPanel: 'Prompt cache பேனலைத் திறக்கவும்',
  paneTitle: 'Prompt cache',
  paneNothing: 'இன்னும் cache இல்லை. அடுத்த பதிலுக்குப் பிறகு கவுன்ட்டவுன் தொடங்கும்.',
  heroLeft: size => `மீதம் · ${size} tokens cached`,
  heroAuto: (time, span) => `${time ? `${spanTa(time)} பின் refresh` : 'விரைவில் refresh'} · ≤~${spanTa(span)}`,
  heroCold: (size, cost) => `${size} மீள உருவாக்க${cost && ` (≈${cost})`}`,
  heroPinging: 'Refresh நடக்கிறது…',
  rowLapse: 'காலாவதி',
  rowPing: 'ஒரு refresh',
  breakEven: max => `${max} refresh ≈ 1 முறை மீள உருவாக்கம்`,
  breakEvenNone: 'Refresh செலவு > மீள உருவாக்கம்',
  breakEvenRule: (max, percent) => `${max} refresh ≈ 1 முறை மீள உருவாக்கம் · திரும்பும் வாய்ப்பு ${percent}%+ எனில் சேமிப்பு`,
  noPrice: 'இந்த மாடலின் விலை கிடைக்கவில்லை',
  autoTitle: 'விலகினால் auto-refresh',
  btnOn: 'இயக்கு',
  btnOff: 'அணை',
  autoPlanOff: (left, span) => `${left} முறை வரை${span && ` · ~${spanTa(span)}`}`,
  autoPlanOn: (used, budget) => `${used}/${budget} பயன்படுத்தியது`,
  autoTrialOff: cap => `1 முறை, பலித்தால் ≤${cap}`,
  autoTrialOn: (used, cap) => `${used}/1 முறை; பலித்தால் ≤${cap}`,
  autoSpent: 'செய்தி வரை மீதமில்லை',
  autoNotWorth: 'சேமிப்பு இல்லை',
  historyAll: n => `கடைசி ${n}: hit`,
  historySome: (n, misses) => `${n}-இல் ${misses} miss`,
  historyEmpty: 'பதிவுகள் இல்லை',
  btnPing: 'Refresh செய்',
  listPrice: 'API பட்டியல் விலையில் மதிப்பீடுகள்',
  priceNote: cap => `அதிகபட்சம் ≈${cap} · API பட்டியல் விலை`,

  langNow: (name, source) =>
    `மொழி: ${name} (${{ pinned: 'நீங்கள் தேர்ந்தெடுத்தது', conversation: 'உரையாடலின்படி', locale: 'கணினியின்படி', default: 'இயல்புநிலை' }[source]}).`,
  langUsage: codes => `பயன்பாடு: /cache-lang [auto|code]. குறியீடுகள்: ${codes}`,
}
