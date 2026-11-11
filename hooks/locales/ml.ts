import type { Snapshot } from '../../types'
import type { Messages } from './en'
import { makeSpan } from './shared'
import type { Verdict } from './shared'

const SOURCE_ML: Record<Snapshot['ttlSource'], string> = { env: 'എൻവയോൺമെന്റ്', observed: 'അളന്നത്', assumed: 'അനുമാനിച്ചത്' }
const BY_ML: Record<Snapshot['touchedBy'], string> = { turn: 'സന്ദേശം', ping: 'refresh', resume: 'വീണ്ടും തുടങ്ങിയ സെഷൻ' }
const VERDICT_ML: Record<Verdict, string> = { hit: 'hit', partial: 'ഭാഗിക hit', miss: 'miss' }
const spanMl = makeSpan({ units: { s: 'സെ.', m: 'മി.', h: 'മ.' } })

export const ml: Messages = {
  name: 'മലയാളം',
  tag: 'ml',
  fonts: '',

  bandCold: 'തീർന്നു',
  bandUnusable: 'ലഭ്യമല്ല',
  bandWarmDetail: (size, cost) => `${size} cached${cost && ` · കാലാവധി തീർന്നാൽ പുനർനിർമാണത്തിന് ${cost}`}`,
  bandAutoDetail: (size, used, budget) => `${size} cached · auto-refresh ${used}/${budget}`,
  bandColdDetail: (size, cost) => `അടുത്ത സന്ദേശം ${size} tokens cache പുനർനിർമിക്കും${cost && ` (≈${cost})`}`,

  cmdStatus: 'Prompt cache നില, ശേഷിക്കുന്ന സമയം, പുനർനിർമാണത്തിന്റെ ചെലവ് കണക്ക് എന്നിവ കാണുക',
  cmdPing: 'Prompt cache ഇപ്പോൾ refresh ചെയ്യുക',
  cmdAuto: 'Auto-refresh ക്രമീകരണങ്ങൾ കാണുക അല്ലെങ്കിൽ മാറ്റുക',
  cmdAutoHint: '[on|off] [refresh പരിധി]',
  cmdLang: 'ഇന്റർഫേസ് ഭാഷ തിരഞ്ഞെടുക്കുക',
  cmdLangHint: '[auto|code]',

  expiredAgo: gap => `${spanMl(gap)} മുമ്പ് കാലാവധി തീർന്നു`,
  coldPing: 'അവസാന refresh-ൽ cache miss ഉണ്ടായി',
  coldModel: model => `മോഡൽ ${model} ആയി മാറി`,

  pingNothing: 'ഇതുവരെ cache ഇല്ല, അതിനാൽ refresh ചെയ്യാൻ ഒന്നുമില്ല.',
  pingBusy: 'Refresh ഇതിനകം നടക്കുന്നു.',
  pingCold: (why, size) =>
    `അയച്ചില്ല: cache സജീവമല്ല (${why}). ഇപ്പോൾ അഭ്യർഥന അയച്ചാൽ എല്ലാ ${size} tokens-ഉം cache എഴുതുന്ന നിരക്കിൽ പുനർനിർമിക്കും. എന്നിട്ടും അയയ്ക്കാൻ /cache-ping force പ്രവർത്തിപ്പിക്കുക.`,
  pingNoFork: 'അയച്ചില്ല: ഈ സംഭാഷണത്തിൽ ഇതുവരെ മറുപടി വന്നിട്ടില്ല.',
  pingApiError: (error, status) => `Refresh പരാജയം: API പിശക് (${error}, നില ${status ?? 'ഇല്ല'}). കൗണ്ട്ഡൗൺ റീസെറ്റ് ചെയ്തില്ല.`,
  pingCut: 'API മറുപടി നൽകും മുമ്പ് refresh തടസ്സപ്പെട്ടു. കൗണ്ട്ഡൗൺ റീസെറ്റ് ചെയ്തില്ല.',
  counts: c => `വായിച്ചത് ${c.read}, എഴുതിയത് ${c.wrote}, ഇൻപുട്ട് ${c.input}, ഔട്ട്പുട്ട് ${c.output}`,
  atListPrice: usd => ` API പട്ടിക നിരക്കിൽ ≈${usd}.`,
  pingHit: (counts, cost, ttl) => `Cache refresh ചെയ്തു: ${counts}.${cost} കൗണ്ട്ഡൗൺ ${spanMl(ttl)} ആയി റീസെറ്റ് ചെയ്തു.`,
  pingRewrote: (counts, cost) => `Cache miss. Cache പുനർനിർമിച്ചു: ${counts}.${cost}`,
  pingMissed: (counts, cost) => `Cache miss: ${counts}.${cost} Cache കാലാവധി നീട്ടിയില്ല.`,
  autoLog: (n, budget, text) => `Auto-refresh ${n}/${budget}. ${text}`,
  autoMissToast: 'Auto-refresh വിജയിച്ചില്ല. /cache-status കാണുക',
  idlePaused: 'Auto-refresh ഓണായിരിക്കുമ്പോൾ idle compaction ഓഫാണ്, അതിനാൽ നീണ്ട സംഭാഷണം refresh-ന് മുമ്പ് compact ആകില്ല. Auto-refresh ഓഫാക്കുമ്പോൾ ഇത് വീണ്ടും ഓണാകും.',
  idleRestored: 'Idle compaction വീണ്ടും ഓണായി.',

  reportNothing: 'Prompt cache: ഇതുവരെ cache ഇല്ല. അടുത്ത മറുപടിക്ക് ശേഷം കൗണ്ട്ഡൗൺ തുടങ്ങും.',
  reportWarm: left => `Prompt cache: സജീവം, ${spanMl(left)} ബാക്കി.`,
  reportCold: why => `Prompt cache: സജീവമല്ല (${why}).`,
  reportTtl: (ttl, source) => `  കാലാവധി: ${spanMl(ttl)} (${SOURCE_ML[source]})`,
  reportCached: (size, model, by, since) =>
    `  Cached: ${model}-ൽ ${size} tokens, അവസാന ഉപയോഗം ${spanMl(since)} മുമ്പ് (${BY_ML[by]})`,
  reportNoPrice: '  ചെലവ്: ഈ മോഡലിന്റെ നിരക്ക് ലഭ്യമല്ല',
  reportLapse: (lapse, rewrite) => `  കാലാവധി തീർന്നാൽ: പുനർനിർമാണത്തിന് ${rewrite}, cache hit-നെക്കാൾ ${lapse} അധികം`,
  reportPing: (ping, isMeasured, max) =>
    `  ഒരു refresh: ഏകദേശം ${ping} (token ചെലവ് ${isMeasured ? 'അളന്നത്' : 'കണക്കാക്കിയത്'}). തുടർച്ചയായി ${max} വരെ refresh ചെയ്യുന്നത് ഒരു പുനർനിർമാണത്തേക്കാൾ ചെലവ് കുറവാണ്`,
  reportPingNone: (ping, isMeasured) =>
    `  ഒരു refresh: ഏകദേശം ${ping} (token ചെലവ് ${isMeasured ? 'അളന്നത്' : 'കണക്കാക്കിയത്'}). ഇത് കാലാവധി തീരുന്നതിലൂടെ കൂടുന്ന ചെലവിനെക്കാൾ കൂടുതലാണ്, അതിനാൽ refresh ലാഭകരമല്ല`,
  reportRule: (ttl, percent) => `  പൊതുവായ നിയമം: ${spanMl(ttl)}-നുള്ളിൽ തിരിച്ചെത്താനുള്ള സാധ്യത ${percent}%-ലധികമാണെങ്കിൽ refresh ലാഭകരമാണ്`,
  reportLastPing: (ago, counts) => `  അവസാന refresh: ${spanMl(ago)} മുമ്പ്, ${counts}`,
  reportTouches: 'സമീപകാല cache പ്രവർത്തനം:',
  reportTouch: (kind, gap, prevBy, ttl, verdict, read, cached) =>
    `  ${BY_ML[kind]}, മുൻ ${BY_ML[prevBy]} കഴിഞ്ഞ് ${spanMl(gap)} ശേഷം (${spanMl(ttl)}): ${VERDICT_ML[verdict]}, ${cached}-ൽ ${read} വായിച്ചു`,
  reportFooter: 'ചെലവുകൾ API പട്ടിക നിരക്കിലെ കണക്കുകളാണ്. സബ്‌സ്ക്രിപ്ഷനിൽ ഇവ പ്ലാൻ ഉപയോഗമാണ് സൂചിപ്പിക്കുന്നത്, ചാർജുകളല്ല.',

  autoHeader: 'Auto-refresh:',
  autoOff: '  Auto-refresh: ഓഫ് (നിങ്ങൾ വിട്ടുനിൽക്കുമ്പോൾ cache സജീവമായി നിലനിർത്താൻ /cache-auto on പ്രവർത്തിപ്പിക്കുക)',
  autoWaiting: cap => `  Auto-refresh: ഓൺ, ഓരോ ഇടവേളയിലും പരമാവധി ${cap}. ആദ്യ മറുപടിക്കായി കാത്തിരിക്കുന്നു`,
  autoOn: (used, budget, cap, next) =>
    `  Auto-refresh: ഓൺ, നിങ്ങളുടെ അവസാന സന്ദേശത്തിന് ശേഷം ${used}/${budget} ഉപയോഗിച്ചു (പരിധി ${cap}). അടുത്തത്: ${next}`,
  autoOnNone: cap => `  Auto-refresh: ഓൺ (പരിധി ${cap}), എന്നാൽ അയയ്ക്കുന്നില്ല: ഈ cache refresh ചെയ്യുന്നത് കാലാവധി തീരുന്നതിലൂടെ കൂടുന്ന ചെലവിനെക്കാൾ കൂടുതലാണ്`,
  nextCold: 'ഇല്ല, cache സജീവമല്ല',
  nextSpent: 'ഇല്ല, ഈ ഇടവേളയിലെ പരിധി തീർന്നു',
  nextIn: time => `${spanMl(time)} കഴിഞ്ഞ്`,
  nextNow: 'ഏതു നിമിഷവും',
  autoPings: state => `  ഫലം: ${state}`,
  extendsYes: ttl => `സ്ഥിരീകരിച്ചു, refresh മുഴുവൻ ${spanMl(ttl)} കാലാവധി തിരികെ നൽകുന്നു`,
  extendsNo: 'സ്ഥിരീകരിച്ചിട്ടില്ല. അവസാന refresh-ന് ശേഷം cache miss ഉണ്ടായി, അതിനാൽ ഓരോ ഇടവേളയിലും ഒരു auto-refresh മാത്രമേ അയയ്ക്കൂ',
  extendsUnknown: ttl => `ഇതുവരെ സ്ഥിരീകരിച്ചിട്ടില്ല. Refresh മുഴുവൻ ${spanMl(ttl)} കാലാവധി തിരികെ നൽകുന്നതായി സ്ഥിരീകരിക്കും വരെ ഓരോ ഇടവേളയിലും ഒരു auto-refresh മാത്രമേ അയയ്ക്കൂ`,
  autoNote: '  കുറിപ്പ്: ആപ്പ് പ്രവർത്തിക്കുകയും കമ്പ്യൂട്ടർ ഉണർന്നിരിക്കുകയും ചെയ്യുമ്പോൾ മാത്രം refresh അയയ്ക്കുന്നു. ഓരോന്നും പ്ലാൻ ഉപയോഗത്തിലോ API ക്രെഡിറ്റിലോ കണക്കാക്കുന്നു',
  autoUsage: max => `ഉപയോഗം: /cache-auto [on|off] [ഓരോ ഇടവേളയിലെയും refresh പരിധി, 1-${max}]`,

  details: 'വിവരം ›',
  cmdPanel: 'Prompt cache പാനൽ തുറക്കുക',
  paneTitle: 'Prompt cache',
  paneNothing: 'ഇതുവരെ cache ഇല്ല. അടുത്ത മറുപടിക്ക് ശേഷം കൗണ്ട്ഡൗൺ തുടങ്ങും.',
  heroLeft: size => `ബാക്കി · ${size} tokens cached`,
  heroAuto: (time, span) => `${time ? `${spanMl(time)}ൽ refresh` : 'ഉടൻ refresh'} · ≤~${spanMl(span)}`,
  heroCold: (size, cost) => `${size} പുനർനിർമാണം${cost && ` (≈${cost})`}`,
  heroPinging: 'Refresh നടക്കുന്നു…',
  rowLapse: 'തീർന്നാൽ',
  rowPing: 'ഒരു refresh',
  breakEven: max => `${max} refresh ≈ 1 പുനർനിർമാണം`,
  breakEvenNone: 'Refresh ചെലവ് > പുനർനിർമാണം',
  breakEvenRule: (max, percent) => `${max} refresh ≈ 1 പുനർനിർമാണം · മടങ്ങാനുള്ള സാധ്യത ${percent}%+ എങ്കിൽ ലാഭം`,
  noPrice: 'ഈ മോഡലിന്റെ നിരക്ക് ലഭ്യമല്ല',
  autoTitle: 'ഇടവേളയിൽ auto-refresh',
  btnOn: 'ഓൺ',
  btnOff: 'ഓഫ്',
  autoPlanOff: (left, span) => `${left} വരെ${span && ` · ~${spanMl(span)}`}`,
  autoPlanOn: (used, budget) => `${used}/${budget} ഉപയോഗിച്ചു`,
  autoTrialOff: cap => `1 ശ്രമം; ഫലിച്ചാൽ ≤${cap}`,
  autoTrialOn: (used, cap) => `${used}/1 ശ്രമം; ഫലിച്ചാൽ ≤${cap}`,
  autoSpent: 'സന്ദേശം വരെ ബാക്കി 0',
  autoNotWorth: 'ലാഭമില്ല',
  historyAll: n => `ഒടുവിലെ ${n} hit`,
  historySome: (n, misses) => `${n} ൽ ${misses} miss`,
  historyEmpty: 'ചരിത്രമില്ല',
  btnPing: 'Refresh',
  listPrice: 'API പട്ടിക നിരക്കിലെ കണക്കുകൾ',
  priceNote: cap => `പരമാവധി ≈${cap} · API പട്ടിക നിരക്ക്`,

  langNow: (name, source) =>
    `ഭാഷ: ${name} (${{ pinned: 'നിങ്ങളുടെ തിരഞ്ഞെടുപ്പ്', conversation: 'സംഭാഷണം അനുസരിച്ച്', locale: 'സിസ്റ്റം അനുസരിച്ച്', default: 'ഡിഫോൾട്ട്' }[source]}).`,
  langUsage: codes => `ഉപയോഗം: /cache-lang [auto|code]. കോഡുകൾ: ${codes}`,
}
