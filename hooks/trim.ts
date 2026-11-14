// A refresh writes Claude's last reply to the cache again each time, for five minutes only. Past a length, one
// short message in the main conversation, sent in place of the first refresh, puts that reply into the
// conversation's own cache; the refreshes after it write only the short answer.

export const DEFAULT_TRIM_FROM = 2000
export const MIN_TRIM_FROM = 500
export const MAX_TRIM_FROM = 200_000

// What the model reads, under the plugin's name; the person sees it in the transcript.
export const TRIM_PROMPT =
  'Prompt-cache keep-alive from the cache-context plugin while the person is away. Reply with exactly: ok. Do not use tools or continue earlier work.'

// What a tool call in that turn is refused with.
export const TRIM_DENIED = 'Not now: this turn only keeps the prompt cache alive. Reply with exactly: ok'

/** A token count as these words show it: whole thousands short, any other count exact, so a reply never reads as past a threshold it is under. */
export function fmtTrimTokens(tokens: number): string {
  return tokens >= 1000 && tokens % 1000 === 0 ? `${tokens / 1000}k` : tokens.toLocaleString('en-US')
}

/** The words of the long-reply switch; English where a language has none of its own. */
export type TrimWords = {
  label: (size: string) => string
  state: (isOn: boolean, size: string) => string
  last: (size: string) => string
  sent: (size: string) => string
  hint: string
  usage: (min: number, max: number) => string
}

const EN: TrimWords = {
  label: size => `Message first if reply ≥ ${size}`,
  state: (isOn, size) =>
    isOn
      ? `  Long replies: on. A last reply of ${size}+ tokens is cached by one short message before the first refresh`
      : `  Long replies: off (/cache-auto trim caches a last reply of ${size}+ tokens with one short message)`,
  last: size => `Last reply ${size} tokens`,
  sent: size => `Auto-refresh sent a short message to cache the last reply (${size} tokens) with the conversation`,
  hint: 'trim [on|off] [tokens]',
  usage: (min, max) => `Usage: /cache-auto trim [on|off] [tokens, ${min}-${max}]. Tokens alone turn it on.`,
}

const ZH_HANT: TrimWords = {
  label: size => `回覆 ≥ ${size} 時先插訊息`,
  state: (isOn, size) =>
    isOn
      ? `  長回覆：開啟。最後一則回覆有 ${size} token 以上時，第一次續期前先插一則短訊息把它存進快取`
      : `  長回覆：關閉（/cache-auto trim 會在最後一則回覆有 ${size} token 以上時，先插一則短訊息把它存進快取）`,
  last: size => `最後一則回覆 ${size} token`,
  sent: size => `自動續期送出一則短訊息，把最後一則回覆（${size} token）存進快取`,
  hint: 'trim [on|off] [token 數]',
  usage: (min, max) => `用法：/cache-auto trim [on|off] [token 數，${min}-${max}]。只給 token 數會同時開啟。`,
}

export function trimWords(tag: string): TrimWords {
  return tag === 'zh-Hant' ? ZH_HANT : EN
}
