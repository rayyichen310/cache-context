import type { Snapshot } from '../../types'
import type { Messages } from './en'
import { makeSpan } from './shared'
import type { Verdict } from './shared'

const SOURCE_BN: Record<Snapshot['ttlSource'], string> = { env: 'এনভায়রনমেন্ট', observed: 'মাপা', assumed: 'ধরে নেওয়া' }
const BY_BN: Record<Snapshot['touchedBy'], string> = { turn: 'বার্তা', ping: 'refresh', resume: 'আবার চালু করা সেশন' }
const VERDICT_BN: Record<Verdict, string> = { hit: 'hit', partial: 'আংশিক hit', miss: 'miss' }
const spanBn = makeSpan({ units: { s: 'সে.', m: 'মি.', h: 'ঘ.' } })

export const bn: Messages = {
  name: 'বাংলা',
  tag: 'bn',
  fonts: '',

  bandCold: 'মেয়াদ শেষ',
  bandUnusable: 'অনুপলব্ধ',
  bandWarmDetail: (size, cost) => `${size} cached${cost && ` · মেয়াদ শেষে আবার তৈরির খরচ ${cost}`}`,
  bandAutoDetail: (size, used, budget) => `${size} cached · auto-refresh ${used}/${budget}`,
  bandColdDetail: (size, cost) => `পরের বার্তায় ${size} tokens-এর cache আবার তৈরি হবে${cost && ` (≈${cost})`}`,

  cmdStatus: 'Prompt cache-এর অবস্থা, বাকি সময় ও আবার তৈরির আনুমানিক খরচ দেখুন',
  cmdPing: 'Prompt cache এখনই refresh করুন',
  cmdAuto: 'Auto-refresh-এর সেটিং দেখুন বা বদলান',
  cmdAutoHint: '[on|off] [refresh-এর সীমা]',
  cmdLang: 'ইন্টারফেসের ভাষা বেছে নিন',
  cmdLangHint: '[auto|code]',

  expiredAgo: gap => `${spanBn(gap)} আগে মেয়াদ শেষ হয়েছে`,
  coldPing: 'শেষ refresh-এ cache miss হয়েছে',
  coldModel: model => `মডেল বদলে ${model} হয়েছে`,

  pingNothing: 'এখনও কোনো cache নেই, তাই refresh করার কিছু নেই।',
  pingBusy: 'একটি refresh ইতিমধ্যে চলছে।',
  pingCold: (why, size) =>
    `পাঠানো হয়নি: cache সক্রিয় নয় (${why})। এখন অনুরোধ পাঠালে সব ${size} tokens-এর cache লেখার দরে আবার তৈরি হবে। তবুও পাঠাতে /cache-ping force চালান।`,
  pingNoFork: 'পাঠানো হয়নি: এই কথোপকথনে এখনও কোনো উত্তর নেই।',
  pingApiError: (error, status) => `Refresh ব্যর্থ: API ত্রুটি (${error}, স্ট্যাটাস ${status ?? 'নেই'})। কাউন্টডাউন রিসেট হয়নি।`,
  pingCut: 'API উত্তর দেওয়ার আগে refresh থেমে গেছে। কাউন্টডাউন রিসেট হয়নি।',
  counts: c => `পড়া ${c.read}, লেখা ${c.wrote}, ইনপুট ${c.input}, আউটপুট ${c.output}`,
  atListPrice: usd => ` API-এর তালিকাভুক্ত দরে ≈${usd}।`,
  pingHit: (counts, cost, ttl) => `Cache refresh হয়েছে: ${counts}।${cost} কাউন্টডাউন ${spanBn(ttl)}-এ রিসেট হয়েছে।`,
  pingRewrote: (counts, cost) => `Cache miss। Cache আবার তৈরি হয়েছে: ${counts}।${cost}`,
  pingMissed: (counts, cost) => `Cache miss: ${counts}।${cost} Cache-এর মেয়াদ বাড়েনি।`,
  autoLog: (n, budget, text) => `Auto-refresh ${n}/${budget}। ${text}`,
  autoMissToast: 'Auto-refresh সফল হয়নি। /cache-status দেখুন',
  idlePaused: 'Auto-refresh চালু থাকা পর্যন্ত idle compaction বন্ধ, যাতে দীর্ঘ কথোপকথন refresh-এর আগে compact না হয়। Auto-refresh বন্ধ হলে এটি আবার চালু হবে।',
  idleRestored: 'Idle compaction আবার চালু হয়েছে।',

  reportNothing: 'Prompt cache: এখনও কোনো cache নেই। পরের উত্তরের পরে কাউন্টডাউন শুরু হবে।',
  reportWarm: left => `Prompt cache: সক্রিয়, ${spanBn(left)} বাকি।`,
  reportCold: why => `Prompt cache: সক্রিয় নয় (${why})।`,
  reportTtl: (ttl, source) => `  মেয়াদ: ${spanBn(ttl)} (${SOURCE_BN[source]})`,
  reportCached: (size, model, by, since) =>
    `  Cached: ${model}-এ ${size} tokens, শেষ ব্যবহার ${spanBn(since)} আগে (${BY_BN[by]})`,
  reportNoPrice: '  খরচ: এই মডেলের মূল্যতথ্য নেই',
  reportLapse: (lapse, rewrite) => `  মেয়াদ শেষ হলে: আবার তৈরি করতে ${rewrite}, cache hit-এর চেয়ে ${lapse} বেশি`,
  reportPing: (ping, isMeasured, max) =>
    `  একবার refresh: প্রায় ${ping} (token খরচ ${isMeasured ? 'মাপা' : 'আনুমানিক'})। টানা ${max} বার পর্যন্ত refresh-এর খরচ একবার আবার তৈরির চেয়ে কম`,
  reportPingNone: (ping, isMeasured) =>
    `  একবার refresh: প্রায় ${ping} (token খরচ ${isMeasured ? 'মাপা' : 'আনুমানিক'})। মেয়াদ শেষ হওয়ার বাড়তি খরচের চেয়ে এটি বেশি, তাই refresh সাশ্রয়ী নয়`,
  reportRule: (ttl, percent) => `  সাধারণ নিয়ম: ${spanBn(ttl)}-এর মধ্যে ফেরার সম্ভাবনা ${percent}%-এর বেশি হলে refresh সাশ্রয়ী`,
  reportLastPing: (ago, counts) => `  শেষ refresh: ${spanBn(ago)} আগে, ${counts}`,
  reportTouches: 'সাম্প্রতিক cache কার্যকলাপ:',
  reportTouch: (kind, gap, prevBy, ttl, verdict, read, cached) =>
    `  ${BY_BN[kind]}, আগের ${BY_BN[prevBy]}-এর ${spanBn(gap)} পরে (${spanBn(ttl)}): ${VERDICT_BN[verdict]}, ${cached}-এর মধ্যে ${read} পড়া`,
  reportFooter: 'খরচ API-এর তালিকাভুক্ত দরে আনুমানিক। সাবস্ক্রিপশনে এটি প্ল্যানের ব্যবহার বোঝায়, চার্জ নয়।',

  autoHeader: 'Auto-refresh:',
  autoOff: '  Auto-refresh: বন্ধ (আপনি দূরে থাকলে cache সক্রিয় রাখতে /cache-auto on চালান)',
  autoWaiting: cap => `  Auto-refresh: চালু, প্রতি নিষ্ক্রিয় সময়ে সর্বোচ্চ ${cap} বার। প্রথম উত্তরের অপেক্ষায়`,
  autoOn: (used, budget, cap, next) =>
    `  Auto-refresh: চালু, আপনার শেষ বার্তার পরে ${used}/${budget} ব্যবহার হয়েছে (সীমা ${cap})। পরেরটি: ${next}`,
  autoOnNone: cap => `  Auto-refresh: চালু (সীমা ${cap}), তবে পাঠানো হচ্ছে না: এই cache-এর refresh মেয়াদ শেষ হওয়ার বাড়তি খরচের চেয়ে বেশি`,
  nextCold: 'নেই, cache সক্রিয় নয়',
  nextSpent: 'নেই, এই নিষ্ক্রিয় সময়ের সীমা শেষ',
  nextIn: time => `${spanBn(time)} পরে`,
  nextNow: 'যে কোনো মুহূর্তে',
  autoPings: state => `  ফল: ${state}`,
  extendsYes: ttl => `নিশ্চিত, refresh পুরো ${spanBn(ttl)} মেয়াদ ফিরিয়ে দেয়`,
  extendsNo: 'নিশ্চিত নয়। শেষ refresh-এর পরে cache miss হয়েছে, তাই প্রতি নিষ্ক্রিয় সময়ে একবারই auto-refresh পাঠানো হয়',
  extendsUnknown: ttl => `এখনও নিশ্চিত নয়। Refresh পুরো ${spanBn(ttl)} মেয়াদ ফিরিয়ে দেয় বলে নিশ্চিত হওয়া পর্যন্ত প্রতি নিষ্ক্রিয় সময়ে একবারই auto-refresh পাঠানো হয়`,
  autoNote: '  নোট: অ্যাপ চালু ও কম্পিউটার জেগে থাকলেই refresh পাঠানো হয়। প্রতিটি refresh প্ল্যানের ব্যবহার বা API ক্রেডিটে গণনা হয়',
  autoUsage: max => `ব্যবহার: /cache-auto [on|off] [প্রতি নিষ্ক্রিয় সময়ে refresh-এর সীমা, 1-${max}]`,

  details: 'বিস্তারিত ›',
  cmdPanel: 'Prompt cache প্যানেল খুলুন',
  paneTitle: 'Prompt cache',
  paneNothing: 'এখনও কোনো cache নেই। পরের উত্তরের পরে কাউন্টডাউন শুরু হবে।',
  heroLeft: size => `বাকি · ${size} tokens cached`,
  heroAuto: (time, span) => `${time ? `${spanBn(time)} পরে refresh` : 'শীঘ্রই refresh'} · ≤~${spanBn(span)}`,
  heroCold: (size, cost) => `${size} tokens আবার তৈরি${cost && ` (≈${cost})`}`,
  heroPinging: 'Refresh চলছে…',
  rowLapse: 'মেয়াদ শেষ হলে',
  rowPing: 'একবার refresh',
  breakEven: max => `${max} বার refresh ≈ 1 বার আবার তৈরি`,
  breakEvenNone: 'এখানে refresh আবার তৈরির চেয়ে বেশি খরচের',
  breakEvenRule: (max, percent) => `${max} বার refresh ≈ 1 বার আবার তৈরি · ফেরার সম্ভাবনা ${percent}%+ হলে সাশ্রয়ী`,
  noPrice: 'এই মডেলের মূল্যতথ্য নেই',
  autoTitle: 'দূরে থাকলে auto-refresh',
  btnOn: 'চালু',
  btnOff: 'বন্ধ',
  autoPlanOff: (left, span) => `${left} বার পর্যন্ত${span && ` · ~${spanBn(span)}`}`,
  autoPlanOn: (used, budget) => `${used}/${budget} ব্যবহার`,
  autoTrialOff: cap => `1 বার চেষ্টা, সফল হলে ≤${cap}`,
  autoTrialOn: (used, cap) => `চেষ্টা ${used}/1, সফল হলে ≤${cap}`,
  autoSpent: 'পরের বার্তা পর্যন্ত আর নেই',
  autoNotWorth: 'এই cache-এ সাশ্রয় নেই',
  historyAll: n => n === 1 ? 'শেষ 1: hit' : `শেষ ${n}: সব hit`,
  historySome: (n, misses) => `${n}-এ ${misses} miss`,
  historyEmpty: 'এখনও ইতিহাস নেই',
  btnPing: 'Refresh করুন',
  listPrice: 'API-এর তালিকাভুক্ত দরে অনুমান',
  priceNote: cap => `আনুমানিক সর্বোচ্চ ${cap} · API-এর তালিকাভুক্ত দর`,

  langNow: (name, source) =>
    `ভাষা: ${name} (${{ pinned: 'নিজের নির্বাচন', conversation: 'কথোপকথন অনুযায়ী', locale: 'সিস্টেম অনুযায়ী', default: 'ডিফল্ট' }[source]})।`,
  langUsage: codes => `ব্যবহার: /cache-lang [auto|code]। কোড: ${codes}`,
}
