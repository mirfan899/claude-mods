export type Row = {
  id: string
  parentId?: string
  name: string
  type: string
  status: string
  label: string
  startTime: number
  tokens: number
  samples: number[]
  usd: number | null
}

declare module 'claude-code' {
  interface PluginState {
    swarm: { rows: Row[] }
  }
}
