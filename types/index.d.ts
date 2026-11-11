export type Ttl = '5m' | '1h'

/** What one keep-alive ping reported, as the API counted it. */
export type PingUsage = {
  at: number
  read: number
  created: number
  input: number
  output: number
}

/** The main conversation's prompt cache as the last touch left it. */
export type Snapshot = {
  /** Start of the last request that read or wrote the cache, in ms since the epoch. */
  touchedAt: number
  touchedBy: 'turn' | 'ping' | 'resume'
  /** Start of the last request the conversation itself made; pings do not move it. */
  turnAt: number
  /** Keep-alives sent since `turnAt`: what the auto budget counts. */
  pingsSinceTurn: number
  /** Tokens the cache holds for the main conversation's prefix. */
  cachedTokens: number
  /** The model id the API reported; caches are per model. */
  model: string
  ttl: Ttl
  /** Where `ttl` came from: the environment, an observed hit or miss, or the default for the billing mode. */
  ttlSource: 'env' | 'observed' | 'assumed'
  /** Why the cache is unusable whatever the clock says, or null. */
  coldReason: string | null
  lastPing: PingUsage | null
}

/** The auto keep-alive switch: off until the person turns it on, then kept in the store across restarts. */
export type Auto = {
  isOn: boolean
  /** The most pings one idle stretch may spend, before the break-even count lowers it. */
  cap: number
}

/** One /context category, estimated locally. */
export type Segment = {
  name: string
  tokens: number
  /** Theme colour key, as /context draws the row. */
  color: string
  kind: 'used' | 'free' | 'buffer' | 'deferred'
}

/** The main conversation's context window as the engine last measured it. */
export type ContextMeter = {
  /** Input tokens of the last response; absent after compaction until the next one. */
  tokens?: number
  /** The window measured against: the compaction window when one is set. */
  max: number
  /** Where auto-compaction runs; absent when it is off. */
  threshold?: number
  segments: Segment[]
  /** The lists beneath the legend; absent from a measure an earlier version of the mod left in the session. */
  lists?: ContextLists
}

/** A file the panel names: its path where one was found, null where it is listed by name alone. */
export type ContextFile = {
  name: string
  path: string | null
}

/** The lists beneath the legend, as /context lists them beneath its grid. */
export type ContextLists = {
  /** Each MCP server with its tool count, loaded or on demand. */
  mcpServers: { name: string; tools: number }[]
  memoryFiles: ContextFile[]
  agents: ContextFile[]
}

export type ContextListKey = 'mcp' | 'memory' | 'agents'

/** The usage guard's settings, kept in the store: off until the person turns it on. */
export type Guard = {
  isOn: boolean
  /** The five-hour usage, in percent, at which Claude is asked to wrap up. */
  threshold: number
}

/**
 * Where the usage guard stands in this session: watching the five-hour usage, letting Claude wrap up,
 * refusing tools, paused until the reset, or paused after the automatic continue gave up.
 */
export type GuardPhase = 'watching' | 'wrapping' | 'blocking' | 'paused' | 'resumeFailed'

export type GuardRun = {
  phase: GuardPhase
  /** The five-hour window's use, in percent, and its reset in ms since the epoch, as last read. */
  percent: number | null
  resetsAt: number | null
  /** Whether the seven-day window was used up when the pause began: no automatic continue then. */
  isWeekly: boolean
  /** Tools the main conversation used since wrapping up began, and calls refused since refusing began. */
  toolsUsed: number
  denied: number
  /** "Not this time": the guard stays quiet until this moment, the window's reset. */
  skipUntil: number
  /** When the automatic continue goes out; null when none is planned. */
  resumeAt: number | null
  /** Continue prompts sent for this pause, and whether one is under way. */
  resumeTries: number
  isResuming: boolean
  /** A refresh was refused at the usage limit: refreshing waits for this reset (null when none was given). */
  limit: { reset: number | null } | null
  /** Claude Code's own "continue at the usage-limit reset" setting, as last read; null where it has none. */
  autoContinue: boolean | null
}

declare module 'claude-code' {
  interface PluginState {
    'cache-context': {
      snapshot: Snapshot | null
      auto: Auto
      context: ContextMeter | null
      isCompacting: boolean
      isLegendOpen: boolean
      openLists: ContextListKey[]
      guard: Guard
      guardRun: GuardRun
    }
  }
}
