export type Window = { kind: string; percentUsed: number; resetsAt?: string }
export type Snapshot = {
  windows: Window[]
  contextPercent: number | null
  usd: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'usage-meter': {
      snap: Snapshot | null
      isHidden: boolean
      alerted: Record<string, number>
    }
  }
}
