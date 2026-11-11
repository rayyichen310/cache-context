import type { Snapshot } from '../../types'
import type { Messages } from './en'
import { makeSpan } from './shared'
import type { Verdict } from './shared'

const SOURCE_TE: Record<Snapshot['ttlSource'], string> = { env: 'ఎన్విరాన్‌మెంట్', observed: 'కొలిచినది', assumed: 'అనుకున్నది' }
const BY_TE: Record<Snapshot['touchedBy'], string> = { turn: 'సందేశం', ping: 'refresh', resume: 'తిరిగి మొదలైన సెషన్' }
const VERDICT_TE: Record<Verdict, string> = { hit: 'hit', partial: 'పాక్షిక hit', miss: 'miss' }
const spanTe = makeSpan({ units: { s: 'సె.', m: 'ని.', h: 'గం.' } })

export const te: Messages = {
  name: 'తెలుగు',
  tag: 'te',
  fonts: '',

  bandCold: 'ముగిసింది',
  bandUnusable: 'లభ్యం కాదు',
  bandWarmDetail: (size, cost) => `${size} cached${cost && ` · గడువు ముగిస్తే మళ్లీ నిర్మించే ఖర్చు ${cost}`}`,
  bandAutoDetail: (size, used, budget) => `${size} cached · auto-refresh ${used}/${budget}`,
  bandColdDetail: (size, cost) => `తర్వాతి సందేశంతో ${size} tokens cache మళ్లీ నిర్మితమవుతుంది${cost && ` (≈${cost})`}`,

  cmdStatus: 'Prompt cache స్థితి, మిగిలిన సమయం, మళ్లీ నిర్మించే అంచనా ఖర్చు చూడండి',
  cmdPing: 'Prompt cache ఇప్పుడే refresh చేయండి',
  cmdAuto: 'Auto-refresh సెట్టింగ్‌లు చూడండి లేదా మార్చండి',
  cmdAutoHint: '[on|off] [refresh పరిమితి]',
  cmdLang: 'ఇంటర్‌ఫేస్ భాష ఎంచుకోండి',
  cmdLangHint: '[auto|code]',

  expiredAgo: gap => `${spanTe(gap)} క్రితం గడువు ముగిసింది`,
  coldPing: 'చివరి refresh లో cache miss అయింది',
  coldModel: model => `మోడల్ ${model} కి మారింది`,

  pingNothing: 'ఇంకా cache లేదు, కాబట్టి refresh చేయడానికి ఏమీ లేదు.',
  pingBusy: 'ఇప్పటికే ఒక refresh జరుగుతోంది.',
  pingCold: (why, size) =>
    `పంపలేదు: cache సక్రియంగా లేదు (${why}). ఇప్పుడు అభ్యర్థన పంపితే ${size} tokens మొత్తం cache రాసే ధరకు మళ్లీ నిర్మితమవుతుంది. అయినా పంపాలంటే /cache-ping force నడపండి.`,
  pingNoFork: 'పంపలేదు: ఈ సంభాషణలో ఇంకా సమాధానం లేదు.',
  pingApiError: (error, status) => `Refresh విఫలం: API లోపం (${error}, స్థితి ${status ?? 'లేదు'}). కౌంట్‌డౌన్ రీసెట్ కాలేదు.`,
  pingCut: 'API సమాధానం రాకముందే refresh ఆగిపోయింది. కౌంట్‌డౌన్ రీసెట్ కాలేదు.',
  counts: c => `చదివినవి ${c.read}, రాసినవి ${c.wrote}, ఇన్‌పుట్ ${c.input}, అవుట్‌పుట్ ${c.output}`,
  atListPrice: usd => ` API జాబితా ధరలకు ≈${usd}.`,
  pingHit: (counts, cost, ttl) => `Cache refresh అయింది: ${counts}.${cost} కౌంట్‌డౌన్ ${spanTe(ttl)} కి రీసెట్ అయింది.`,
  pingRewrote: (counts, cost) => `Cache miss. Cache మళ్లీ నిర్మితమైంది: ${counts}.${cost}`,
  pingMissed: (counts, cost) => `Cache miss: ${counts}.${cost} Cache గడువు పొడిగించబడలేదు.`,
  autoLog: (n, budget, text) => `Auto-refresh ${n}/${budget}. ${text}`,
  autoMissToast: 'Auto-refresh విజయవంతం కాలేదు. /cache-status చూడండి',
  idlePaused: 'Auto-refresh ఆన్‌లో ఉన్నంతవరకు idle compaction ఆఫ్‌లో ఉంది, కాబట్టి పెద్ద సంభాషణ refresh కి ముందు compact కాదు. Auto-refresh ఆఫ్ చేసినప్పుడు ఇది మళ్లీ ఆన్ అవుతుంది.',
  idleRestored: 'Idle compaction మళ్లీ ఆన్ అయింది.',

  reportNothing: 'Prompt cache: ఇంకా cache లేదు. తర్వాతి సమాధానం వచ్చాక కౌంట్‌డౌన్ మొదలవుతుంది.',
  reportWarm: left => `Prompt cache: సక్రియంగా ఉంది, ${spanTe(left)} మిగిలింది.`,
  reportCold: why => `Prompt cache: సక్రియంగా లేదు (${why}).`,
  reportTtl: (ttl, source) => `  గడువు: ${spanTe(ttl)} (${SOURCE_TE[source]})`,
  reportCached: (size, model, by, since) =>
    `  Cached: ${model} పై ${size} tokens, చివరి వాడకం ${spanTe(since)} క్రితం (${BY_TE[by]})`,
  reportNoPrice: '  ఖర్చు: ఈ మోడల్ ధరలు అందుబాటులో లేవు',
  reportLapse: (lapse, rewrite) => `  గడువు ముగిస్తే: మళ్లీ నిర్మించడానికి ${rewrite}, cache hit కంటే ${lapse} ఎక్కువ`,
  reportPing: (ping, isMeasured, max) =>
    `  ఒక refresh: సుమారు ${ping} (token ఖర్చు ${isMeasured ? 'కొలిచినది' : 'అంచనా'}). వరుసగా ${max} వరకు refresh ల ఖర్చు ఒకసారి మళ్లీ నిర్మించే ఖర్చు కంటే తక్కువ`,
  reportPingNone: (ping, isMeasured) =>
    `  ఒక refresh: సుమారు ${ping} (token ఖర్చు ${isMeasured ? 'కొలిచినది' : 'అంచనా'}). ఇది గడువు ముగియడం వల్ల పెరిగే ఖర్చు కంటే ఎక్కువ, కాబట్టి refresh లాభదాయకం కాదు`,
  reportRule: (ttl, percent) => `  సాధారణ నియమం: ${spanTe(ttl)} లో తిరిగి వచ్చే అవకాశం ${percent}% కంటే ఎక్కువైతే refresh లాభదాయకం`,
  reportLastPing: (ago, counts) => `  చివరి refresh: ${spanTe(ago)} క్రితం, ${counts}`,
  reportTouches: 'ఇటీవలి cache కార్యకలాపం:',
  reportTouch: (kind, gap, prevBy, ttl, verdict, read, cached) =>
    `  ${BY_TE[kind]}, మునుపటి ${BY_TE[prevBy]} తర్వాత ${spanTe(gap)} (${spanTe(ttl)}): ${VERDICT_TE[verdict]}, ${cached} లో ${read} చదివినవి`,
  reportFooter: 'ఖర్చులు API జాబితా ధరల ఆధారంగా అంచనాలు. సబ్‌స్క్రిప్షన్‌లో ఇవి ప్లాన్ వాడకాన్ని సూచిస్తాయి, ఛార్జీలను కాదు.',

  autoHeader: 'Auto-refresh:',
  autoOff: '  Auto-refresh: ఆఫ్ (మీరు దూరంగా ఉన్నప్పుడు cache సక్రియంగా ఉంచడానికి /cache-auto on నడపండి)',
  autoWaiting: cap => `  Auto-refresh: ఆన్, ప్రతి నిష్క్రియ సమయంలో గరిష్ఠంగా ${cap}. మొదటి సమాధానం కోసం వేచి ఉంది`,
  autoOn: (used, budget, cap, next) =>
    `  Auto-refresh: ఆన్, మీ చివరి సందేశం తర్వాత ${used}/${budget} వాడారు (పరిమితి ${cap}). తర్వాత: ${next}`,
  autoOnNone: cap => `  Auto-refresh: ఆన్ (పరిమితి ${cap}), కానీ పంపడం లేదు: ఈ cache refresh ఖర్చు గడువు ముగియడం వల్ల పెరిగే ఖర్చు కంటే ఎక్కువ`,
  nextCold: 'లేదు, cache సక్రియంగా లేదు',
  nextSpent: 'లేదు, ఈ నిష్క్రియ సమయపు పరిమితి పూర్తయింది',
  nextIn: time => `${spanTe(time)} తర్వాత`,
  nextNow: 'ఏ క్షణంలోనైనా',
  autoPings: state => `  ఫలితం: ${state}`,
  extendsYes: ttl => `నిర్ధారితమైంది, refresh పూర్తి ${spanTe(ttl)} గడువును తిరిగి ఇస్తుంది`,
  extendsNo: 'నిర్ధారించలేదు. చివరి refresh తర్వాత cache miss అయింది, అందుకే ప్రతి నిష్క్రియ సమయంలో ఒక్క auto-refresh మాత్రమే పంపుతుంది',
  extendsUnknown: ttl => `ఇంకా నిర్ధారించలేదు. Refresh పూర్తి ${spanTe(ttl)} గడువును తిరిగి ఇస్తుందని నిర్ధారించే వరకు ప్రతి నిష్క్రియ సమయంలో ఒక్క auto-refresh మాత్రమే పంపుతుంది`,
  autoNote: '  గమనిక: యాప్ నడుస్తూ, కంప్యూటర్ మేల్కొని ఉన్నప్పుడే refresh లు పంపబడతాయి. ప్రతిదీ ప్లాన్ వాడకం లేదా API క్రెడిట్‌లో లెక్కించబడుతుంది',
  autoUsage: max => `వాడకం: /cache-auto [on|off] [ప్రతి నిష్క్రియ సమయంలో refresh పరిమితి, 1-${max}]`,

  details: 'వివరాలు ›',
  cmdPanel: 'Prompt cache ప్యానెల్ తెరవండి',
  paneTitle: 'Prompt cache',
  paneNothing: 'ఇంకా cache లేదు. తర్వాతి సమాధానం వచ్చాక కౌంట్‌డౌన్ మొదలవుతుంది.',
  heroLeft: size => `మిగిలింది · ${size} tokens cached`,
  heroAuto: (time, span) => `${time ? `${spanTe(time)} లో refresh` : 'త్వరలో refresh'} · ≤~${spanTe(span)}`,
  heroCold: (size, cost) => `${size} మళ్లీ నిర్మించాలి${cost && ` (≈${cost})`}`,
  heroPinging: 'Refresh జరుగుతోంది…',
  rowLapse: 'ముగిస్తే',
  rowPing: 'ఒక refresh',
  breakEven: max => `${max} refresh ≈ 1సారి మళ్లీ నిర్మాణం`,
  breakEvenNone: 'Refresh ఖర్చు మళ్లీ నిర్మించడం కంటే ఎక్కువ',
  breakEvenRule: (max, percent) => `${max} refresh ≈ 1సారి మళ్లీ నిర్మాణం · తిరిగి వచ్చే అవకాశం ${percent}%+ అయితే లాభం`,
  noPrice: 'ఈ మోడల్ ధరలు అందుబాటులో లేవు',
  autoTitle: 'దూరంగా ఉంటే auto-refresh',
  btnOn: 'ఆన్',
  btnOff: 'ఆఫ్',
  autoPlanOff: (left, span) => `${left} వరకు${span && ` · ~${spanTe(span)}`}`,
  autoPlanOn: (used, budget) => `${used}/${budget} వాడారు`,
  autoTrialOff: cap => `1 పరీక్ష, పని చేస్తే ≤${cap}`,
  autoTrialOn: (used, cap) => `పరీక్ష ${used}/1, పని చేస్తే ≤${cap}`,
  autoSpent: 'సందేశం వరకు మిగలలేదు',
  autoNotWorth: 'ఈ cache కి లాభం లేదు',
  historyAll: n => `చివరి ${n}: hit`,
  historySome: (n, misses) => `${n} లో ${misses} miss`,
  historyEmpty: 'ఇంకా చరిత్ర లేదు',
  btnPing: 'Refresh',
  listPrice: 'API జాబితా ధరలకు అంచనాలు',
  priceNote: cap => `అంచనా గరిష్ఠం ${cap} · API జాబితా ధరలు`,

  langNow: (name, source) =>
    `భాష: ${name} (${{ pinned: 'మీ ఎంపిక', conversation: 'సంభాషణ ప్రకారం', locale: 'సిస్టమ్ ప్రకారం', default: 'డిఫాల్ట్' }[source]}).`,
  langUsage: codes => `వాడకం: /cache-lang [auto|code]. కోడ్‌లు: ${codes}`,
}
