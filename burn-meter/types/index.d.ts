export type Burn = {
  /** What the odometer shows right now (tweens toward `target`). */
  shown: number
  /** The session's real cost, or the demo ramp while a demo runs. */
  target: number
  isDemo: boolean
  lifetime: number
  /** Subscription windows, 0..100, or -1 with no reading (API key, before the first response). */
  session: number
  week: number
  /** When each window resets, ISO 8601, or '' unknown. */
  sessionResets: string
  weekResets: string
  /** The weekly Opus window (`seven_day_opus`), 0..100, or -1 when the account has none. */
  opus: number
  opusResets: string
  /** The context window's fill, 0..100, or -1 with no reading. */
  ctx: number
  /** Tokens in the context window and the window's size, or -1 with no reading. */
  ctxTokens: number
  ctxWindow: number
}

/** One reading of the two plan windows, for the burn rate. */
export type Sample = { t: number; s: number; w: number }

/** One model's tokens this session: input counts cached reads and writes too. */
export type ModelTally = { input: number; output: number; turns: number }

declare module 'claude-code' {
  interface PluginState {
    'burn-meter': { burn: Burn; isHidden: boolean; fired: number[]; turns: number[]; turnStart: number; models: Record<string, ModelTally>; history: Sample[]; tickAt: number }
  }
}
