import type { Snapshot } from '../../types'
import type { Messages } from './en'
import { makeSpan } from './shared'
import type { Verdict } from './shared'

const SOURCE_MR: Record<Snapshot['ttlSource'], string> = { env: 'पर्यावरण', observed: 'मोजलेले', assumed: 'गृहीत' }
const BY_MR: Record<Snapshot['touchedBy'], string> = { turn: 'संदेश', ping: 'refresh', resume: 'पुन्हा सुरू केलेले सत्र' }
const VERDICT_MR: Record<Verdict, string> = { hit: 'hit', partial: 'अंशतः hit', miss: 'miss' }
const spanMr = makeSpan({ units: { s: 'से.', m: 'मि.', h: 'ता.' } })

export const mr: Messages = {
  name: 'मराठी',
  tag: 'mr',
  fonts: '',

  bandCold: 'मुदत संपली',
  bandUnusable: 'अनुपलब्ध',
  bandWarmDetail: (size, cost) => `${size} cached${cost && ` · मुदत संपल्यावर पुन्हा तयार करण्याचा खर्च ${cost}`}`,
  bandAutoDetail: (size, used, budget) => `${size} cached · auto-refresh ${used}/${budget}`,
  bandColdDetail: (size, cost) => `पुढील संदेशाने ${size} tokens चा cache पुन्हा तयार होईल${cost && ` (≈${cost})`}`,

  cmdStatus: 'Prompt cache ची स्थिती, उरलेला वेळ आणि पुन्हा तयार करण्याचा अंदाजे खर्च पाहा',
  cmdPing: 'Prompt cache आत्ता refresh करा',
  cmdAuto: 'Auto-refresh च्या सेटिंग पाहा किंवा बदला',
  cmdAutoHint: '[on|off] [refresh मर्यादा]',
  cmdLang: 'इंटरफेसची भाषा निवडा',
  cmdLangHint: '[auto|code]',

  expiredAgo: gap => `${spanMr(gap)} पूर्वी मुदत संपली`,
  coldPing: 'मागील refresh मध्ये cache miss झाला',
  coldModel: model => `मॉडेल ${model} झाले`,

  pingNothing: 'अजून cache नाही, त्यामुळे refresh करण्यासारखे काही नाही.',
  pingBusy: 'Refresh आधीच सुरू आहे.',
  pingCold: (why, size) =>
    `पाठवले नाही: cache सक्रिय नाही (${why}). आत्ता विनंती केल्यास सर्व ${size} tokens चा cache लिहिण्याच्या दराने पुन्हा तयार होईल. तरीही पाठवण्यासाठी /cache-ping force चालवा.`,
  pingNoFork: 'पाठवले नाही: या संभाषणात अजून उत्तर आलेले नाही.',
  pingApiError: (error, status) => `Refresh अयशस्वी: API त्रुटी (${error}, स्थिती ${status ?? 'नाही'}). उलटगणना रीसेट झाली नाही.`,
  pingCut: 'API चे उत्तर येण्याआधी refresh थांबला. उलटगणना रीसेट झाली नाही.',
  counts: c => `वाचले ${c.read}, लिहिले ${c.wrote}, इनपुट ${c.input}, आउटपुट ${c.output}`,
  atListPrice: usd => ` API च्या सूचीतील दरांनुसार ≈${usd}.`,
  pingHit: (counts, cost, ttl) => `Cache refresh झाला: ${counts}.${cost} उलटगणना ${spanMr(ttl)} वर रीसेट झाली.`,
  pingRewrote: (counts, cost) => `Cache miss. Cache पुन्हा तयार झाला: ${counts}.${cost}`,
  pingMissed: (counts, cost) => `Cache miss: ${counts}.${cost} Cache ची मुदत वाढली नाही.`,
  autoLog: (n, budget, text) => `Auto-refresh ${n}/${budget}. ${text}`,
  autoMissToast: 'Auto-refresh यशस्वी झाला नाही. /cache-status पाहा',
  idlePaused: 'Auto-refresh चालू असेपर्यंत idle compaction बंद आहे, म्हणजे लांब संभाषण refresh आधी compact होणार नाही. Auto-refresh बंद केल्यावर ते पुन्हा चालू होईल.',
  idleRestored: 'Idle compaction पुन्हा चालू झाले.',

  reportNothing: 'Prompt cache: अजून cache नाही. पुढील उत्तरानंतर उलटगणना सुरू होईल.',
  reportWarm: left => `Prompt cache: सक्रिय, ${spanMr(left)} बाकी.`,
  reportCold: why => `Prompt cache: सक्रिय नाही (${why}).`,
  reportTtl: (ttl, source) => `  मुदत: ${spanMr(ttl)} (${SOURCE_MR[source]})`,
  reportCached: (size, model, by, since) =>
    `  Cached: ${model} वर ${size} tokens, शेवटचा वापर ${spanMr(since)} पूर्वी (${BY_MR[by]})`,
  reportNoPrice: '  खर्च: या मॉडेलचे दर उपलब्ध नाहीत',
  reportLapse: (lapse, rewrite) => `  मुदत संपल्यास: पुन्हा तयार करण्यासाठी ${rewrite}, cache hit पेक्षा ${lapse} अधिक`,
  reportPing: (ping, isMeasured, max) =>
    `  एक refresh: सुमारे ${ping} (token खर्च ${isMeasured ? 'मोजलेला' : 'अंदाजे'}). सलग ${max} पर्यंत refresh चा खर्च एकदा पुन्हा तयार करण्यापेक्षा कमी आहे`,
  reportPingNone: (ping, isMeasured) =>
    `  एक refresh: सुमारे ${ping} (token खर्च ${isMeasured ? 'मोजलेला' : 'अंदाजे'}). हा मुदत संपल्यामुळे वाढणाऱ्या खर्चापेक्षा जास्त आहे, म्हणून refresh परवडत नाही`,
  reportRule: (ttl, percent) => `  साधा नियम: ${spanMr(ttl)} मध्ये परत येण्याची शक्यता ${percent}% पेक्षा जास्त असेल तर refresh परवडतो`,
  reportLastPing: (ago, counts) => `  मागील refresh: ${spanMr(ago)} पूर्वी, ${counts}`,
  reportTouches: 'अलीकडील cache वापर:',
  reportTouch: (kind, gap, prevBy, ttl, verdict, read, cached) =>
    `  ${BY_MR[kind]}, मागील ${BY_MR[prevBy]} नंतर ${spanMr(gap)} (${spanMr(ttl)}): ${VERDICT_MR[verdict]}, ${cached} पैकी ${read} वाचले`,
  reportFooter: 'खर्च API च्या सूचीतील दरांनुसार अंदाजे आहे. सदस्यत्वात तो प्लानचा वापर दर्शवतो, शुल्क नाही.',

  autoHeader: 'Auto-refresh:',
  autoOff: '  Auto-refresh: बंद (तुम्ही दूर असताना cache सक्रिय ठेवण्यासाठी /cache-auto on चालवा)',
  autoWaiting: cap => `  Auto-refresh: सुरू, प्रत्येक निष्क्रिय काळात जास्तीत जास्त ${cap}. पहिल्या उत्तराची वाट पाहत आहे`,
  autoOn: (used, budget, cap, next) =>
    `  Auto-refresh: सुरू, तुमच्या मागील संदेशानंतर ${used}/${budget} वापरले (मर्यादा ${cap}). पुढील: ${next}`,
  autoOnNone: cap => `  Auto-refresh: सुरू (मर्यादा ${cap}), पण पाठवत नाही: या cache चा refresh मुदत संपल्यामुळे वाढणाऱ्या खर्चापेक्षा महाग आहे`,
  nextCold: 'नाही, cache सक्रिय नाही',
  nextSpent: 'नाही, या निष्क्रिय काळाची मर्यादा संपली',
  nextIn: time => `${spanMr(time)} नंतर`,
  nextNow: 'कोणत्याही क्षणी',
  autoPings: state => `  परिणाम: ${state}`,
  extendsYes: ttl => `पुष्टी झाली, refresh मुळे पूर्ण ${spanMr(ttl)} ची मुदत पुन्हा मिळते`,
  extendsNo: 'पुष्टी नाही. मागील refresh नंतर cache miss झाला, म्हणून प्रत्येक निष्क्रिय काळात फक्त एक auto-refresh पाठवला जातो',
  extendsUnknown: ttl => `अजून पुष्टी नाही. Refresh मुळे पूर्ण ${spanMr(ttl)} ची मुदत मिळते याची खात्री होईपर्यंत प्रत्येक निष्क्रिय काळात फक्त एक auto-refresh पाठवला जातो`,
  autoNote: '  टीप: अ‍ॅप सुरू आणि संगणक जागा असतानाच refresh पाठवले जातात. प्रत्येक refresh प्लानच्या वापरात किंवा API क्रेडिटमध्ये मोजला जातो',
  autoUsage: max => `वापर: /cache-auto [on|off] [प्रत्येक निष्क्रिय काळाची refresh मर्यादा, 1-${max}]`,

  details: 'तपशील ›',
  cmdPanel: 'Prompt cache पॅनल उघडा',
  paneTitle: 'Prompt cache',
  paneNothing: 'अजून cache नाही. पुढील उत्तरानंतर उलटगणना सुरू होईल.',
  heroLeft: size => `बाकी · ${size} tokens cached`,
  heroAuto: (time, span) => `${time ? `${spanMr(time)} नंतर refresh` : 'लवकरच refresh'} · ≤~${spanMr(span)}`,
  heroCold: (size, cost) => `${size} tokens पुन्हा तयार${cost && ` (≈${cost})`}`,
  heroPinging: 'Refresh सुरू…',
  rowLapse: 'मुदत संपल्यास',
  rowPing: 'एक refresh',
  breakEven: max => `${max} refresh ≈ 1 वेळ पुन्हा तयार करणे`,
  breakEvenNone: 'इथे refresh पुन्हा तयार करण्यापेक्षा महाग आहे',
  breakEvenRule: (max, percent) => `${max} refresh ≈ 1 वेळ पुन्हा तयार करणे · परत येण्याची शक्यता ${percent}%+ असल्यास परवडते`,
  noPrice: 'या मॉडेलचे दर उपलब्ध नाहीत',
  autoTitle: 'दूर असताना auto-refresh',
  btnOn: 'सुरू करा',
  btnOff: 'बंद करा',
  autoPlanOff: (left, span) => `${left} पर्यंत refresh${span && ` · ~${spanMr(span)}`}`,
  autoPlanOn: (used, budget) => `${used}/${budget} वापरले`,
  autoTrialOff: cap => `1 चाचणी, जमल्यास ${cap} पर्यंत`,
  autoTrialOn: (used, cap) => `चाचणी ${used}/1, जमल्यास ${cap} पर्यंत`,
  autoSpent: 'पुढील संदेशापर्यंत शिल्लक नाही',
  autoNotWorth: 'या cache साठी परवडत नाही',
  historyAll: n => n === 1 ? 'मागील 1: hit' : `मागील ${n}: सर्व hit`,
  historySome: (n, misses) => `${n} पैकी ${misses} miss`,
  historyEmpty: 'अजून नोंदी नाहीत',
  btnPing: 'आत्ता refresh',
  listPrice: 'API च्या सूचीतील दरांनुसार अंदाज',
  priceNote: cap => `अंदाजे कमाल ${cap} · API च्या सूचीतील दरांनुसार`,

  langNow: (name, source) =>
    `भाषा: ${name} (${{ pinned: 'स्वतः निवडलेली', conversation: 'संभाषणानुसार', locale: 'सिस्टमनुसार', default: 'डीफॉल्ट' }[source]}).`,
  langUsage: codes => `वापर: /cache-lang [auto|code]. कोड: ${codes}`,
}
