import type { Snapshot } from '../../types'
import type { Messages } from './en'
import { makeSpan } from './shared'
import type { Verdict } from './shared'

const SOURCE_ZH: Record<Snapshot['ttlSource'], string> = {
  env: '环境变量',
  observed: '实测',
  assumed: '默认',
}
const BY_ZH: Record<Snapshot['touchedBy'], string> = { turn: '消息', ping: '续期', resume: '恢复会话' }
const VERDICT_ZH: Record<Verdict, string> = { hit: '命中', partial: '部分命中', miss: '未命中' }
const spanZh = makeSpan({
  units: { s: '秒', m: '分钟', h: '小时' },
  clockMinute: '分',
})

// The same vocabulary: 有效 until it 过期; 续期 restarts the lifetime; a cache that is 已失效 gets 重建.
export const zh: Messages = {
  name: '中文',
  tag: 'zh-Hans',
  fonts: "'PingFang SC'",

  bandCold: '已失效',
  bandUnusable: '已失效',
  bandWarmDetail: (size, cost) => `已缓存 ${size}${cost && ` · 过期重建约 ${cost}`}`,
  bandAutoDetail: (size, used, budget) => `已缓存 ${size} · 自动续期 ${used}/${budget}`,
  bandColdDetail: (size, cost) => `下条消息将重建 ${size} token${cost && `，约 ${cost}`}`,

  cmdStatus: '查看提示缓存状态、剩余时间和预计重建成本',
  cmdPing: '立即为提示缓存续期',
  cmdAuto: '查看或设置自动续期',
  cmdAutoHint: '[on|off] [次数上限]',
  cmdLang: '设置显示语言',
  cmdLangHint: '[auto|语言代码]',

  expiredAgo: gap => `已过期 ${spanZh(gap)}`,
  coldPing: '上次续期未命中',
  coldModel: model => `模型已切换为 ${model}`,

  pingNothing: '当前对话还没有缓存，无需续期。',
  pingBusy: '正在续期，请稍候。',
  pingCold: (why, size) =>
    `未发送：缓存已失效（${why}）。现在发送会按缓存写入价格重建全部 ${size} token。如仍要发送，请运行 /cache-ping force。`,
  pingNoFork: '未发送：当前对话还没有回复。',
  pingApiError: (error, status) => `续期失败：API 错误（${error}，状态码 ${status ?? '无'}）。倒计时未重置。`,
  pingCut: '续期请求在 API 响应前中断，倒计时未重置。',
  counts: c => `读取 ${c.read}，写入 ${c.wrote}，输入 ${c.input}，输出 ${c.output}`,
  atListPrice: usd => `按 API 标价约 ${usd}。`,
  pingHit: (counts, cost, ttl) => `续期成功：${counts}。${cost}倒计时已重置为 ${spanZh(ttl)}。`,
  pingRewrote: (counts, cost) => `未命中缓存，缓存已重建：${counts}。${cost}`,
  pingMissed: (counts, cost) => `未命中缓存：${counts}。${cost}缓存未能续期。`,
  autoLog: (n, budget, text) => `自动续期 ${n}/${budget}。${text}`,
  autoMissToast: '自动续期未成功，详见 /cache-status',
  idlePaused: '自动续期开启期间已关闭闲时压缩，长对话不会在续期前被压缩。关闭自动续期时会恢复。',
  idleRestored: '已恢复闲时压缩。',

  reportNothing: '提示缓存：暂无缓存，下次回复后开始倒计时。',
  reportWarm: left => `提示缓存：有效，剩余 ${spanZh(left)}。`,
  reportCold: why => `提示缓存：已失效（${why}）。`,
  reportTtl: (ttl, source) => `  有效期：${spanZh(ttl)}（${SOURCE_ZH[source]}）`,
  reportCached: (size, model, by, since) =>
    `  已缓存：${size} token，模型 ${model}，上次使用：${spanZh(since)}前（${BY_ZH[by]}）`,
  reportNoPrice: '  成本：暂无该模型的定价信息',
  reportLapse: (lapse, rewrite) => `  过期成本：重建约 ${rewrite}，比命中缓存多 ${lapse}`,
  reportPing: (ping, isMeasured, max) =>
    `  单次续期：约 ${ping}（请求开销为${isMeasured ? '实测' : '估算'}值），连续续期 ${max} 次以内都比过期重建划算`,
  reportPingNone: (ping, isMeasured) =>
    `  单次续期：约 ${ping}（请求开销为${isMeasured ? '实测' : '估算'}值），比过期多花的钱还多，续期不划算`,
  reportRule: (ttl, percent) => `  建议：只要你在 ${spanZh(ttl)}内回来的概率高于 ${percent}%，续期就划算`,
  reportLastPing: (ago, counts) => `  上次续期：${spanZh(ago)}前，${counts}`,
  reportTouches: '最近的缓存记录：',
  reportTouch: (kind, gap, prevBy, ttl, verdict, read, cached) =>
    `  ${BY_ZH[kind]}，距上次${BY_ZH[prevBy]} ${spanZh(gap)}（有效期 ${spanZh(ttl)}）：${VERDICT_ZH[verdict]}，读取 ${read} / ${cached}`,
  reportFooter: '以上金额按 API 标价估算；订阅用户消耗的是套餐额度。',

  autoHeader: '自动续期：',
  autoOff: '  自动续期：已关闭（运行 /cache-auto on 可在离开时保持缓存有效）',
  autoWaiting: cap => `  自动续期：已开启，每次空闲期间最多 ${cap} 次；等待首次回复`,
  autoOn: (used, budget, cap, next) =>
    `  自动续期：已开启，本次空闲期间已用 ${used}/${budget} 次（上限 ${cap} 次）；下次续期：${next}`,
  autoOnNone: cap => `  自动续期：已开启（上限 ${cap} 次），但暂不发送：当前缓存较小，续期比过期多花的钱还多`,
  nextCold: '无（缓存已失效）',
  nextSpent: '无（本次空闲期间的次数已用完）',
  nextIn: time => `${spanZh(time)}后`,
  nextNow: '即将发送',
  autoPings: state => `  续期效果：${state}`,
  extendsYes: ttl => `已验证，续期可重新获得 ${spanZh(ttl)}有效期`,
  extendsNo: '未验证，续期后的下一次请求未命中，因此每次空闲期间只自动续期 1 次',
  extendsUnknown: ttl => `待验证，确认续期能重新获得 ${spanZh(ttl)}有效期之前，每次空闲期间只自动续期 1 次`,
  autoNote: '  注意：仅在应用运行且电脑未休眠时才会续期；每次续期都会消耗套餐额度或产生 API 费用',
  autoUsage: max => `用法：/cache-auto [on|off] [每次空闲期间的次数上限，1-${max}]`,

  details: '详情 ›',
  cmdPanel: '打开提示缓存面板',
  paneTitle: '提示缓存',
  paneNothing: '暂无缓存，下次回复后开始倒计时。',
  heroLeft: size => `后过期 · 已缓存 ${size} token`,
  heroAuto: (time, span) => `${time ? `${spanZh(time)}后续期` : '即将续期'} · 最长约 ${spanZh(span)}`,
  heroCold: (size, cost) => `重建 ${size} token${cost && `，约 ${cost}`}`,
  heroPinging: '正在续期…',
  rowLapse: '过期重建',
  rowPing: '续期一次',
  breakEven: max => `续期 ${max} 次 ≈ 重建 1 次`,
  breakEvenNone: '缓存较小，续期比过期重建更贵',
  breakEvenRule: (max, percent) => `续期 ${max} 次 ≈ 重建 1 次 · 回来的概率高于 ${percent}% 就划算`,
  noPrice: '暂无该模型的定价信息',
  autoTitle: '离开时自动续期',
  btnOn: '开启',
  btnOff: '关闭',
  autoPlanOff: (left, span) => `最多续期 ${left} 次${span && ` · 约 ${spanZh(span)}`}`,
  autoPlanOn: (used, budget) => `已续期 ${used}/${budget} 次`,
  autoTrialOff: cap => `先试 1 次，验证后上限 ${cap} 次`,
  autoTrialOn: (used, cap) => `已试 ${used}/1，验证后上限 ${cap} 次`,
  autoSpent: '次数已用完，发消息后重置',
  autoNotWorth: '缓存较小，无需续期',
  historyAll: n => (n === 1 ? '最近 1 次命中' : `最近 ${n} 次全部命中`),
  historySome: (n, misses) => `${n} 次中 ${misses} 次未命中`,
  historyEmpty: '暂无记录',
  btnPing: '立即续期',
  listPrice: '金额按 API 标价估算',
  priceNote: cap => `预计最多 ${cap} · 按 API 标价估算`,

  langNow: (name, source) =>
    `显示语言：${name}（${{ pinned: '手动设置', conversation: '跟随对话', locale: '跟随系统', default: '默认' }[source]}）。`,
  langUsage: codes => `用法：/cache-lang [auto|语言代码]。可用代码：${codes}`,
}
