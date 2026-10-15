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

/** The auto keep-alive switch, per session: off until the person turns it on. */
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

declare module 'claude-code' {
  interface PluginState {
    'cache-context': {
      snapshot: Snapshot | null
      auto: Auto
      context: ContextMeter | null
      isCompacting: boolean
      isLegendOpen: boolean
      openLists: ContextListKey[]
    }
  }
}
