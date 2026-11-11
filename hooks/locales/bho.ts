import type { Snapshot } from '../../types'
import type { Messages } from './en'
import { makeSpan } from './shared'
import type { Verdict } from './shared'

const SOURCE_BHO: Record<Snapshot['ttlSource'], string> = { env: 'एनवायरनमेंट', observed: 'नापल', assumed: 'मानल' }
const BY_BHO: Record<Snapshot['touchedBy'], string> = { turn: 'संदेस', ping: 'refresh', resume: 'फेर शुरू भइल सत्र' }
const VERDICT_BHO: Record<Verdict, string> = { hit: 'hit', partial: 'आंशिक hit', miss: 'miss' }
const spanBho = makeSpan({ units: { s: 'से.', m: 'मि.', h: 'घं.' } })

export const bho: Messages = {
  name: 'भोजपुरी',
  tag: 'bho',
  fonts: '',

  bandCold: 'मियाद बीतल',
  bandUnusable: 'उपलब्ध नइखे',
  bandWarmDetail: (size, cost) => `${size} cached${cost && ` · मियाद बीतला पर फेर बनावे के खर्च ${cost}`}`,
  bandAutoDetail: (size, used, budget) => `${size} cached · auto-refresh ${used}/${budget}`,
  bandColdDetail: (size, cost) => `अगिला संदेस ${size} tokens के cache फेर बनाई${cost && ` (≈${cost})`}`,

  cmdStatus: 'Prompt cache के हाल, बचल समय आ फेर बनावे के अनुमानित खर्च देखीं',
  cmdPing: 'Prompt cache अबहीं refresh करीं',
  cmdAuto: 'Auto-refresh के सेटिंग देखीं भा बदलीं',
  cmdAutoHint: '[on|off] [refresh सीमा]',
  cmdLang: 'इंटरफेस के भाषा चुनीं',
  cmdLangHint: '[auto|code]',

  expiredAgo: gap => `${spanBho(gap)} पहिले मियाद बीतल`,
  coldPing: 'पिछला refresh में cache miss भइल',
  coldModel: model => `मॉडल बदल के ${model} भइल`,

  pingNothing: 'अभी ले cache नइखे, एहसे refresh करे के कुछ नइखे।',
  pingBusy: 'Refresh पहिलहीं से चल रहल बा।',
  pingCold: (why, size) =>
    `ना भेजल गइल: cache सक्रिय नइखे (${why})। अबहीं अनुरोध भेजला पर सगरी ${size} tokens के cache लिखे के दर पर फेर बनी। तबो भेजे खातिर /cache-ping force चलाईं।`,
  pingNoFork: 'ना भेजल गइल: एह बातचीत में अभी ले जवाब नइखे आइल।',
  pingApiError: (error, status) => `Refresh नाकाम: API गलती (${error}, स्थिति ${status ?? 'नइखे'})। उलटी गिनती रीसेट ना भइल।`,
  pingCut: 'API के जवाब आवे से पहिले refresh रुक गइल। उलटी गिनती रीसेट ना भइल।',
  counts: c => `पढ़ल ${c.read}, लिखल ${c.wrote}, इनपुट ${c.input}, आउटपुट ${c.output}`,
  atListPrice: usd => ` API के सूची दर पर ≈${usd}।`,
  pingHit: (counts, cost, ttl) => `Cache refresh भइल: ${counts}।${cost} उलटी गिनती ${spanBho(ttl)} पर रीसेट भइल।`,
  pingRewrote: (counts, cost) => `Cache miss। Cache फेर बनल: ${counts}।${cost}`,
  pingMissed: (counts, cost) => `Cache miss: ${counts}।${cost} Cache के मियाद ना बढ़ल।`,
  autoLog: (n, budget, text) => `Auto-refresh ${n}/${budget}। ${text}`,
  autoMissToast: 'Auto-refresh सफल ना भइल। /cache-status देखीं',
  idlePaused: 'Auto-refresh चालू रहे तक idle compaction बंद बा, ताकि लमहर बातचीत refresh से पहिले compact ना होखे। Auto-refresh बंद भइला पर ई फेर चालू हो जाई।',
  idleRestored: 'Idle compaction फेर से चालू बा।',

  reportNothing: 'Prompt cache: अभी ले cache नइखे। अगिला जवाब के बाद उलटी गिनती शुरू होई।',
  reportWarm: left => `Prompt cache: सक्रिय बा, ${spanBho(left)} बाकी।`,
  reportCold: why => `Prompt cache: सक्रिय नइखे (${why})।`,
  reportTtl: (ttl, source) => `  मियाद: ${spanBho(ttl)} (${SOURCE_BHO[source]})`,
  reportCached: (size, model, by, since) =>
    `  Cached: ${model} पर ${size} tokens, पिछला इस्तेमाल ${spanBho(since)} पहिले (${BY_BHO[by]})`,
  reportNoPrice: '  खर्च: एह मॉडल के दर उपलब्ध नइखे',
  reportLapse: (lapse, rewrite) => `  मियाद बीतला पर: फेर बनावे खातिर ${rewrite}, cache hit से ${lapse} जादे`,
  reportPing: (ping, isMeasured, max) =>
    `  एक refresh: करीब ${ping} (token खर्च ${isMeasured ? 'नापल' : 'अनुमानित'})। लगातार ${max} ले refresh के खर्च एक बेर फेर बनावे से कम बा`,
  reportPingNone: (ping, isMeasured) =>
    `  एक refresh: करीब ${ping} (token खर्च ${isMeasured ? 'नापल' : 'अनुमानित'})। ई मियाद बीतला के बढ़ल खर्च से जादे बा, एहसे refresh फायदेमंद नइखे`,
  reportRule: (ttl, percent) => `  आम नियम: ${spanBho(ttl)} में लौटे के संभावना ${percent}% से जादे होखे त refresh फायदेमंद बा`,
  reportLastPing: (ago, counts) => `  पिछला refresh: ${spanBho(ago)} पहिले, ${counts}`,
  reportTouches: 'हाल के cache गतिविधि:',
  reportTouch: (kind, gap, prevBy, ttl, verdict, read, cached) =>
    `  ${BY_BHO[kind]}, पिछला ${BY_BHO[prevBy]} के ${spanBho(gap)} बाद (${spanBho(ttl)}): ${VERDICT_BHO[verdict]}, ${cached} में से ${read} पढ़ल`,
  reportFooter: 'खर्च API के सूची दर पर अनुमान बा। सब्सक्रिप्शन में ई प्लान के इस्तेमाल देखावेला, शुल्क ना।',

  autoHeader: 'Auto-refresh:',
  autoOff: '  Auto-refresh: बंद (रउआ दूर रहीं त cache सक्रिय रखे खातिर /cache-auto on चलाईं)',
  autoWaiting: cap => `  Auto-refresh: चालू, हर खाली समय में जादे से जादे ${cap}। पहिला जवाब के इंतजार बा`,
  autoOn: (used, budget, cap, next) =>
    `  Auto-refresh: चालू, रउआ पिछला संदेस के बाद ${used}/${budget} इस्तेमाल (सीमा ${cap})। अगिला: ${next}`,
  autoOnNone: cap => `  Auto-refresh: चालू (सीमा ${cap}), बाकिर नइखे भेजत: एह cache के refresh मियाद बीतला के बढ़ल खर्च से महँग बा`,
  nextCold: 'कुछ ना, cache सक्रिय नइखे',
  nextSpent: 'कुछ ना, एह खाली समय के सीमा पूरा भइल',
  nextIn: time => `${spanBho(time)} बाद`,
  nextNow: 'कवनो पल',
  autoPings: state => `  असर: ${state}`,
  extendsYes: ttl => `पुष्टि भइल, refresh से पूरा ${spanBho(ttl)} के मियाद फेर मिलेला`,
  extendsNo: 'पुष्टि नइखे भइल। पिछला refresh के बाद cache miss भइल, एहसे हर खाली समय में खाली एक auto-refresh भेजल जाला',
  extendsUnknown: ttl => `अभी ले पुष्टि नइखे भइल। Refresh से पूरा ${spanBho(ttl)} के मियाद मिले के पुष्टि होखे ले हर खाली समय में खाली एक auto-refresh भेजल जाला`,
  autoNote: '  ध्यान दीं: ऐप चलत होखे आ कंप्यूटर जागल होखे तबे refresh भेजल जाला। हर refresh प्लान के इस्तेमाल भा API क्रेडिट में गिनल जाला',
  autoUsage: max => `इस्तेमाल: /cache-auto [on|off] [हर खाली समय के refresh सीमा, 1-${max}]`,

  details: 'ब्यौरा ›',
  cmdPanel: 'Prompt cache पैनल खोलीं',
  paneTitle: 'Prompt cache',
  paneNothing: 'अभी ले cache नइखे। अगिला जवाब के बाद उलटी गिनती शुरू होई।',
  heroLeft: size => `बाकी · ${size} tokens cached`,
  heroAuto: (time, span) => `${time ? `${spanBho(time)} बाद refresh` : 'जल्दी refresh'} · ~${spanBho(span)} ले`,
  heroCold: (size, cost) => `${size} tokens फेर बनावे के${cost && ` (≈${cost})`}`,
  heroPinging: 'Refresh चलत बा…',
  rowLapse: 'मियाद बीतला पर',
  rowPing: 'एक refresh',
  breakEven: max => `${max} refresh ≈ 1 बेर फेर बनावल`,
  breakEvenNone: 'एहिजा refresh फेर बनावे से महँग बा',
  breakEvenRule: (max, percent) => `${max} refresh ≈ 1 बेर फेर बनावल · लौटे के संभावना ${percent}%+ होखे त फायदा`,
  noPrice: 'एह मॉडल के दर उपलब्ध नइखे',
  autoTitle: 'दूर रहीं त auto-refresh',
  btnOn: 'चालू करीं',
  btnOff: 'बंद करीं',
  autoPlanOff: (left, span) => `${left} ले refresh${span && ` · ~${spanBho(span)}`}`,
  autoPlanOn: (used, budget) => `${used}/${budget} इस्तेमाल`,
  autoTrialOff: cap => `1 कोशिश, चले त ${cap} ले`,
  autoTrialOn: (used, cap) => `कोशिश ${used}/1, चले त ${cap} ले`,
  autoSpent: 'अगिला संदेस ले कुछ बाकी ना',
  autoNotWorth: 'एह cache में फायदा नइखे',
  historyAll: n => n === 1 ? 'पछिला 1: hit' : `पछिला ${n}: सब hit`,
  historySome: (n, misses) => `${n} में ${misses} miss`,
  historyEmpty: 'अभी ले इतिहास नइखे',
  btnPing: 'अबहीं refresh',
  listPrice: 'API के सूची दर पर अनुमान',
  priceNote: cap => `अनुमानित अधिकतम ${cap} · API के सूची दर`,

  langNow: (name, source) =>
    `भाषा: ${name} (${{ pinned: 'रउआ चुनल', conversation: 'बातचीत के हिसाब से', locale: 'सिस्टम के हिसाब से', default: 'डिफॉल्ट' }[source]})।`,
  langUsage: codes => `इस्तेमाल: /cache-lang [auto|code]। कोड: ${codes}`,
}
