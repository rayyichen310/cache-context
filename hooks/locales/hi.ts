import type { Snapshot } from '../../types'
import type { Messages } from './en'
import { makeSpan } from './shared'
import type { Verdict } from './shared'

const SOURCE_HI: Record<Snapshot['ttlSource'], string> = { env: 'परिवेश', observed: 'मापा गया', assumed: 'मान लिया गया' }
const BY_HI: Record<Snapshot['touchedBy'], string> = { turn: 'संदेश', ping: 'refresh', resume: 'फिर शुरू हुआ सत्र' }
const VERDICT_HI: Record<Verdict, string> = { hit: 'hit', partial: 'आंशिक hit', miss: 'miss' }
const spanHi = makeSpan({ units: { s: 'से.', m: 'मि.', h: 'घं.' } })

// Refresh renews an active cache; expiry ends its lifetime and the next message rebuilds it.
export const hi: Messages = {
  name: 'हिन्दी',
  tag: 'hi',
  fonts: '',

  bandCold: 'अवधि खत्म',
  bandUnusable: 'अनुपलब्ध',
  bandWarmDetail: (size, cost) => `${size} cached${cost && ` · अवधि खत्म होने पर फिर बनाने की लागत ${cost}`}`,
  bandAutoDetail: (size, used, budget) => `${size} cached · auto-refresh ${used}/${budget}`,
  bandColdDetail: (size, cost) => `अगला संदेश ${size} tokens का cache फिर बनाएगा${cost && ` (≈${cost})`}`,

  cmdStatus: 'Prompt cache की स्थिति, बचा समय और फिर बनाने की अनुमानित लागत देखें',
  cmdPing: 'Prompt cache अभी refresh करें',
  cmdAuto: 'Auto-refresh की सेटिंग देखें या बदलें',
  cmdAutoHint: '[on|off] [refresh सीमा]',
  cmdLang: 'इंटरफ़ेस की भाषा चुनें',
  cmdLangHint: '[auto|code]',

  expiredAgo: gap => `${spanHi(gap)} पहले अवधि खत्म हुई`,
  coldPing: 'पिछले refresh में cache miss हुआ',
  coldModel: model => `मॉडल अब ${model} है`,

  pingNothing: 'अभी कोई cache नहीं है, इसलिए refresh करने को कुछ नहीं है।',
  pingBusy: 'Refresh पहले से चल रहा है।',
  pingCold: (why, size) =>
    `नहीं भेजा: cache सक्रिय नहीं है (${why})। अभी अनुरोध भेजने पर सभी ${size} tokens का cache लिखने की दर पर फिर बनेगा। फिर भी भेजने के लिए /cache-ping force चलाएँ।`,
  pingNoFork: 'नहीं भेजा: इस बातचीत में अभी कोई जवाब नहीं आया है।',
  pingApiError: (error, status) => `Refresh विफल: API त्रुटि (${error}, स्थिति ${status ?? 'नहीं मिली'})। उलटी गिनती रीसेट नहीं हुई।`,
  pingCut: 'API का जवाब आने से पहले refresh रुक गया। उलटी गिनती रीसेट नहीं हुई।',
  counts: c => `पढ़े ${c.read}, लिखे ${c.wrote}, इनपुट ${c.input}, आउटपुट ${c.output}`,
  atListPrice: usd => ` API की सूची दरों पर ≈${usd}।`,
  pingHit: (counts, cost, ttl) => `Cache refresh हुआ: ${counts}।${cost} उलटी गिनती ${spanHi(ttl)} पर रीसेट हुई।`,
  pingRewrote: (counts, cost) => `Cache miss। Cache फिर बना: ${counts}।${cost}`,
  pingMissed: (counts, cost) => `Cache miss: ${counts}।${cost} Cache की अवधि नहीं बढ़ी।`,
  autoLog: (n, budget, text) => `Auto-refresh ${n}/${budget}। ${text}`,
  autoMissToast: 'Auto-refresh सफल नहीं हुआ। /cache-status देखें',
  idlePaused: 'Auto-refresh चालू रहने तक idle compaction बंद है, ताकि लंबी बातचीत refresh से पहले compact न हो। Auto-refresh बंद होने पर यह फिर चालू हो जाएगा।',
  idleRestored: 'Idle compaction फिर से चालू है।',

  reportNothing: 'Prompt cache: अभी कोई cache नहीं है। अगले जवाब के बाद उलटी गिनती शुरू होगी।',
  reportWarm: left => `Prompt cache: सक्रिय, ${spanHi(left)} बाकी।`,
  reportCold: why => `Prompt cache: सक्रिय नहीं (${why})।`,
  reportTtl: (ttl, source) => `  अवधि: ${spanHi(ttl)} (${SOURCE_HI[source]})`,
  reportCached: (size, model, by, since) =>
    `  Cached: ${model} पर ${size} tokens, पिछला इस्तेमाल ${spanHi(since)} पहले (${BY_HI[by]})`,
  reportNoPrice: '  लागत: इस मॉडल की दरें उपलब्ध नहीं हैं',
  reportLapse: (lapse, rewrite) => `  अवधि खत्म होने पर: फिर बनाने के लिए ${rewrite}, cache hit से ${lapse} अधिक`,
  reportPing: (ping, isMeasured, max) =>
    `  एक refresh: लगभग ${ping} (token खर्च ${isMeasured ? 'मापा गया' : 'अनुमानित'})। लगातार ${max} तक refresh की लागत एक बार फिर बनाने से कम है`,
  reportPingNone: (ping, isMeasured) =>
    `  एक refresh: लगभग ${ping} (token खर्च ${isMeasured ? 'मापा गया' : 'अनुमानित'})। यह अवधि खत्म होने की अतिरिक्त लागत से अधिक है, इसलिए refresh किफ़ायती नहीं है`,
  reportRule: (ttl, percent) => `  सामान्य नियम: ${spanHi(ttl)} में लौटने की संभावना ${percent}% से अधिक हो तो refresh किफ़ायती है`,
  reportLastPing: (ago, counts) => `  पिछला refresh: ${spanHi(ago)} पहले, ${counts}`,
  reportTouches: 'हाल की cache गतिविधि:',
  reportTouch: (kind, gap, prevBy, ttl, verdict, read, cached) =>
    `  ${BY_HI[kind]}, पिछले ${BY_HI[prevBy]} से ${spanHi(gap)} बाद (${spanHi(ttl)}): ${VERDICT_HI[verdict]}, ${cached} में से ${read} पढ़े`,
  reportFooter: 'लागत API की सूची दरों पर अनुमानित है। सदस्यता में यह प्लान का उपयोग है, शुल्क नहीं।',

  autoHeader: 'Auto-refresh:',
  autoOff: '  Auto-refresh: बंद (आपके दूर रहने पर cache सक्रिय रखने के लिए /cache-auto on चलाएँ)',
  autoWaiting: cap => `  Auto-refresh: चालू, हर निष्क्रिय अवधि में अधिकतम ${cap}। पहले जवाब का इंतज़ार है`,
  autoOn: (used, budget, cap, next) =>
    `  Auto-refresh: चालू, आपके पिछले संदेश के बाद ${used}/${budget} इस्तेमाल (सीमा ${cap})। अगला: ${next}`,
  autoOnNone: cap => `  Auto-refresh: चालू (सीमा ${cap}), पर नहीं भेज रहा: इस cache का refresh अवधि खत्म होने की अतिरिक्त लागत से महँगा है`,
  nextCold: 'कोई नहीं, cache सक्रिय नहीं है',
  nextSpent: 'कोई नहीं, इस निष्क्रिय अवधि की सीमा पूरी हो गई',
  nextIn: time => `${spanHi(time)} बाद`,
  nextNow: 'किसी भी पल',
  autoPings: state => `  असर: ${state}`,
  extendsYes: ttl => `पुष्टि हुई, refresh से पूरे ${spanHi(ttl)} की अवधि वापस मिलती है`,
  extendsNo: 'पुष्टि नहीं हुई। पिछले refresh के बाद cache miss हुआ, इसलिए हर निष्क्रिय अवधि में केवल एक auto-refresh भेजा जाता है',
  extendsUnknown: ttl => `अभी पुष्टि नहीं हुई। Refresh से पूरे ${spanHi(ttl)} की अवधि मिलने की पुष्टि तक हर निष्क्रिय अवधि में केवल एक auto-refresh भेजा जाता है`,
  autoNote: '  ध्यान दें: refresh केवल ऐप चलने और कंप्यूटर जागने पर भेजे जाते हैं। हर refresh प्लान के उपयोग या API क्रेडिट में गिना जाता है',
  autoUsage: max => `इस्तेमाल: /cache-auto [on|off] [हर निष्क्रिय अवधि की refresh सीमा, 1-${max}]`,

  details: 'विवरण ›',
  cmdPanel: 'Prompt cache पैनल खोलें',
  paneTitle: 'Prompt cache',
  paneNothing: 'अभी कोई cache नहीं है। अगले जवाब के बाद उलटी गिनती शुरू होगी।',
  heroLeft: size => `बाकी · ${size} tokens cached`,
  heroAuto: (time, span) => `${time ? `${spanHi(time)} बाद refresh` : 'जल्द refresh'} · ~${spanHi(span)} तक`,
  heroCold: (size, cost) => `${size} tokens फिर बनेंगे${cost && ` (≈${cost})`}`,
  heroPinging: 'Refresh जारी…',
  rowLapse: 'अवधि खत्म हो',
  rowPing: 'एक refresh',
  breakEven: max => `${max} refresh ≈ 1 बार फिर बनाना`,
  breakEvenNone: 'यहाँ refresh फिर बनाने से महँगा है',
  breakEvenRule: (max, percent) => `${max} refresh ≈ 1 बार फिर बनाना · लौटने की संभावना ${percent}%+ हो तो किफ़ायती`,
  noPrice: 'इस मॉडल की दरें उपलब्ध नहीं हैं',
  autoTitle: 'दूर रहने पर auto-refresh',
  btnOn: 'चालू करें',
  btnOff: 'बंद करें',
  autoPlanOff: (left, span) => `${left} तक refresh${span && ` · ~${spanHi(span)}`}`,
  autoPlanOn: (used, budget) => `${used}/${budget} इस्तेमाल`,
  autoTrialOff: cap => `1 कोशिश, सफल हो तो ${cap} तक`,
  autoTrialOn: (used, cap) => `कोशिश ${used}/1, सफल हो तो ${cap} तक`,
  autoSpent: 'अगले संदेश तक कुछ बाकी नहीं',
  autoNotWorth: 'इस cache में फ़ायदा नहीं',
  historyAll: n => n === 1 ? 'पिछला 1: hit' : `पिछले ${n}: सब hit`,
  historySome: (n, misses) => `${n} में ${misses} miss`,
  historyEmpty: 'अभी कोई इतिहास नहीं',
  btnPing: 'अभी refresh',
  listPrice: 'API की सूची दरों पर अनुमान',
  priceNote: cap => `अनुमानित अधिकतम ${cap} · API की सूची दरें`,

  langNow: (name, source) =>
    `भाषा: ${name} (${{ pinned: 'मैनुअल', conversation: 'बातचीत के अनुसार', locale: 'सिस्टम के अनुसार', default: 'डिफ़ॉल्ट' }[source]})।`,
  langUsage: codes => `इस्तेमाल: /cache-lang [auto|code]। कोड: ${codes}`,
}
