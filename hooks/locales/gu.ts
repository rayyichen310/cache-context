import type { Snapshot } from '../../types'
import type { Messages } from './en'
import { makeSpan } from './shared'
import type { Verdict } from './shared'

const SOURCE_GU: Record<Snapshot['ttlSource'], string> = { env: 'એન્વાયરમેન્ટ', observed: 'માપેલું', assumed: 'ધારેલું' }
const BY_GU: Record<Snapshot['touchedBy'], string> = { turn: 'સંદેશ', ping: 'refresh', resume: 'ફરી શરૂ કરેલું સત્ર' }
const VERDICT_GU: Record<Verdict, string> = { hit: 'hit', partial: 'આંશિક hit', miss: 'miss' }
const spanGu = makeSpan({ units: { s: 'સે.', m: 'મિ.', h: 'ક.' } })

export const gu: Messages = {
  name: 'ગુજરાતી',
  tag: 'gu',
  fonts: '',

  bandCold: 'મુદત પૂરી',
  bandUnusable: 'અનુપલબ્ધ',
  bandWarmDetail: (size, cost) => `${size} cached${cost && ` · મુદત પૂરી થાય તો ફરી બનાવવાનો ખર્ચ ${cost}`}`,
  bandAutoDetail: (size, used, budget) => `${size} cached · auto-refresh ${used}/${budget}`,
  bandColdDetail: (size, cost) => `આગલો સંદેશ ${size} tokens નો cache ફરી બનાવશે${cost && ` (≈${cost})`}`,

  cmdStatus: 'Prompt cache ની સ્થિતિ, બાકી સમય અને ફરી બનાવવાનો અંદાજિત ખર્ચ જુઓ',
  cmdPing: 'Prompt cache હમણાં refresh કરો',
  cmdAuto: 'Auto-refresh ની સેટિંગ જુઓ અથવા બદલો',
  cmdAutoHint: '[on|off] [refresh મર્યાદા]',
  cmdLang: 'ઇન્ટરફેસની ભાષા પસંદ કરો',
  cmdLangHint: '[auto|code]',

  expiredAgo: gap => `${spanGu(gap)} પહેલાં મુદત પૂરી થઈ`,
  coldPing: 'છેલ્લા refresh માં cache miss થયો',
  coldModel: model => `મોડેલ બદલાઈને ${model} થયું`,

  pingNothing: 'હજી કોઈ cache નથી, એટલે refresh કરવા માટે કંઈ નથી.',
  pingBusy: 'Refresh પહેલેથી ચાલુ છે.',
  pingCold: (why, size) =>
    `મોકલ્યું નથી: cache સક્રિય નથી (${why}). હમણાં વિનંતી કરવાથી બધા ${size} tokens નો cache લખવાના દરે ફરી બનશે. તેમ છતાં મોકલવા /cache-ping force ચલાવો.`,
  pingNoFork: 'મોકલ્યું નથી: આ વાતચીતમાં હજી કોઈ જવાબ નથી.',
  pingApiError: (error, status) => `Refresh નિષ્ફળ: API ભૂલ (${error}, સ્થિતિ ${status ?? 'નથી'}). કાઉન્ટડાઉન રીસેટ થયું નથી.`,
  pingCut: 'API નો જવાબ આવે તે પહેલાં refresh અટકી ગયો. કાઉન્ટડાઉન રીસેટ થયું નથી.',
  counts: c => `વાંચ્યા ${c.read}, લખ્યા ${c.wrote}, ઇનપુટ ${c.input}, આઉટપુટ ${c.output}`,
  atListPrice: usd => ` API ના સૂચિ દરે ≈${usd}.`,
  pingHit: (counts, cost, ttl) => `Cache refresh થયો: ${counts}.${cost} કાઉન્ટડાઉન ${spanGu(ttl)} પર રીસેટ થયું.`,
  pingRewrote: (counts, cost) => `Cache miss. Cache ફરી બન્યો: ${counts}.${cost}`,
  pingMissed: (counts, cost) => `Cache miss: ${counts}.${cost} Cache ની મુદત લંબાઈ નથી.`,
  autoLog: (n, budget, text) => `Auto-refresh ${n}/${budget}. ${text}`,
  autoMissToast: 'Auto-refresh સફળ થયો નથી. /cache-status જુઓ',
  idlePaused: 'Auto-refresh ચાલુ હોય ત્યાં સુધી idle compaction બંધ છે, જેથી લાંબી વાતચીત refresh પહેલાં compact ન થાય. Auto-refresh બંધ થતાં તે ફરી ચાલુ થશે.',
  idleRestored: 'Idle compaction ફરી ચાલુ છે.',

  reportNothing: 'Prompt cache: હજી કોઈ cache નથી. આગલા જવાબ પછી કાઉન્ટડાઉન શરૂ થશે.',
  reportWarm: left => `Prompt cache: સક્રિય, ${spanGu(left)} બાકી.`,
  reportCold: why => `Prompt cache: સક્રિય નથી (${why}).`,
  reportTtl: (ttl, source) => `  મુદત: ${spanGu(ttl)} (${SOURCE_GU[source]})`,
  reportCached: (size, model, by, since) =>
    `  Cached: ${model} પર ${size} tokens, છેલ્લો ઉપયોગ ${spanGu(since)} પહેલાં (${BY_GU[by]})`,
  reportNoPrice: '  ખર્ચ: આ મોડેલના દર ઉપલબ્ધ નથી',
  reportLapse: (lapse, rewrite) => `  મુદત પૂરી થાય તો: ફરી બનાવવા ${rewrite}, cache hit કરતાં ${lapse} વધુ`,
  reportPing: (ping, isMeasured, max) =>
    `  એક refresh: આશરે ${ping} (token ખર્ચ ${isMeasured ? 'માપેલો' : 'અંદાજિત'}). સળંગ ${max} સુધી refresh નો ખર્ચ એક વાર ફરી બનાવવા કરતાં ઓછો છે`,
  reportPingNone: (ping, isMeasured) =>
    `  એક refresh: આશરે ${ping} (token ખર્ચ ${isMeasured ? 'માપેલો' : 'અંદાજિત'}). આ મુદત પૂરી થવાના વધારાના ખર્ચ કરતાં વધુ છે, એટલે refresh ફાયદાકારક નથી`,
  reportRule: (ttl, percent) => `  સામાન્ય નિયમ: ${spanGu(ttl)} માં પાછા આવવાની શક્યતા ${percent}% કરતાં વધુ હોય તો refresh ફાયદાકારક છે`,
  reportLastPing: (ago, counts) => `  છેલ્લો refresh: ${spanGu(ago)} પહેલાં, ${counts}`,
  reportTouches: 'તાજેતરની cache પ્રવૃત્તિ:',
  reportTouch: (kind, gap, prevBy, ttl, verdict, read, cached) =>
    `  ${BY_GU[kind]}, અગાઉના ${BY_GU[prevBy]} થી ${spanGu(gap)} પછી (${spanGu(ttl)}): ${VERDICT_GU[verdict]}, ${cached} માંથી ${read} વાંચ્યા`,
  reportFooter: 'ખર્ચ API ના સૂચિ દરે અંદાજિત છે. સબ્સ્ક્રિપ્શનમાં તે પ્લાનનો ઉપયોગ દર્શાવે છે, શુલ્ક નહીં.',

  autoHeader: 'Auto-refresh:',
  autoOff: '  Auto-refresh: બંધ (તમે દૂર હો ત્યારે cache સક્રિય રાખવા /cache-auto on ચલાવો)',
  autoWaiting: cap => `  Auto-refresh: ચાલુ, દરેક નિષ્ક્રિય સમયગાળામાં વધુમાં વધુ ${cap}. પહેલા જવાબની રાહ છે`,
  autoOn: (used, budget, cap, next) =>
    `  Auto-refresh: ચાલુ, તમારા છેલ્લા સંદેશ પછી ${used}/${budget} વપરાયા (મર્યાદા ${cap}). આગળ: ${next}`,
  autoOnNone: cap => `  Auto-refresh: ચાલુ (મર્યાદા ${cap}), પણ મોકલાતું નથી: આ cache નો refresh મુદત પૂરી થવાના વધારાના ખર્ચ કરતાં મોંઘો છે`,
  nextCold: 'કોઈ નહીં, cache સક્રિય નથી',
  nextSpent: 'કોઈ નહીં, આ નિષ્ક્રિય સમયગાળાની મર્યાદા પૂરી થઈ',
  nextIn: time => `${spanGu(time)} પછી`,
  nextNow: 'કોઈ પણ ક્ષણે',
  autoPings: state => `  અસર: ${state}`,
  extendsYes: ttl => `ખાતરી થઈ, refresh થી પૂરી ${spanGu(ttl)} ની મુદત ફરી મળે છે`,
  extendsNo: 'ખાતરી નથી. છેલ્લા refresh પછી cache miss થયો, એટલે દરેક નિષ્ક્રિય સમયગાળામાં માત્ર એક auto-refresh મોકલાય છે',
  extendsUnknown: ttl => `હજી ખાતરી નથી. Refresh થી પૂરી ${spanGu(ttl)} ની મુદત મળે તેની ખાતરી થાય ત્યાં સુધી દરેક નિષ્ક્રિય સમયગાળામાં માત્ર એક auto-refresh મોકલાય છે`,
  autoNote: '  નોંધ: ઍપ ચાલુ હોય અને કમ્પ્યુટર જાગતું હોય ત્યારે જ refresh મોકલાય છે. દરેક refresh પ્લાનના ઉપયોગ અથવા API ક્રેડિટમાં ગણાય છે',
  autoUsage: max => `ઉપયોગ: /cache-auto [on|off] [દરેક નિષ્ક્રિય સમયગાળાની refresh મર્યાદા, 1-${max}]`,

  details: 'વિગતો ›',
  cmdPanel: 'Prompt cache પેનલ ખોલો',
  paneTitle: 'Prompt cache',
  paneNothing: 'હજી કોઈ cache નથી. આગલા જવાબ પછી કાઉન્ટડાઉન શરૂ થશે.',
  heroLeft: size => `બાકી · ${size} tokens cached`,
  heroAuto: (time, span) => `${time ? `${spanGu(time)} પછી refresh` : 'ટૂંકમાં refresh'} · ≤~${spanGu(span)}`,
  heroCold: (size, cost) => `${size} tokens ફરી બનાવવા${cost && ` (≈${cost})`}`,
  heroPinging: 'Refresh ચાલુ…',
  rowLapse: 'મુદત પૂરી થાય',
  rowPing: 'એક refresh',
  breakEven: max => `${max} refresh ≈ 1 વાર ફરી બનાવવું`,
  breakEvenNone: 'અહીં refresh ફરી બનાવવા કરતાં મોંઘો છે',
  breakEvenRule: (max, percent) => `${max} refresh ≈ 1 વાર ફરી બનાવવું · પાછા આવવાની શક્યતા ${percent}%+ હોય તો ફાયદો`,
  noPrice: 'આ મોડેલના દર ઉપલબ્ધ નથી',
  autoTitle: 'દૂર હો ત્યારે auto-refresh',
  btnOn: 'ચાલુ',
  btnOff: 'બંધ',
  autoPlanOff: (left, span) => `${left} સુધી refresh${span && ` · ~${spanGu(span)}`}`,
  autoPlanOn: (used, budget) => `${used}/${budget} વપરાયા`,
  autoTrialOff: cap => `1 પ્રયાસ, સફળ થાય તો ≤${cap}`,
  autoTrialOn: (used, cap) => `પ્રયાસ ${used}/1, સફળ થાય તો ≤${cap}`,
  autoSpent: 'આગલા સંદેશ સુધી બાકી નથી',
  autoNotWorth: 'આ cache માં ફાયદો નથી',
  historyAll: n => n === 1 ? 'છેલ્લી 1: hit' : `છેલ્લી ${n}: બધી hit`,
  historySome: (n, misses) => `${n} માં ${misses} miss`,
  historyEmpty: 'હજી ઇતિહાસ નથી',
  btnPing: 'Refresh કરો',
  listPrice: 'API ના સૂચિ દરે અંદાજ',
  priceNote: cap => `અંદાજે મહત્તમ ${cap} · API ના સૂચિ દરે`,

  langNow: (name, source) =>
    `ભાષા: ${name} (${{ pinned: 'પોતાની પસંદગી', conversation: 'વાતચીત મુજબ', locale: 'સિસ્ટમ મુજબ', default: 'ડિફૉલ્ટ' }[source]}).`,
  langUsage: codes => `ઉપયોગ: /cache-lang [auto|code]. કોડ: ${codes}`,
}
