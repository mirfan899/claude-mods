import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Row } from '../types'

const PANE = 'swarm'
const rows = atom({ plugin: 'swarm', key: 'rows' } as const, [])

const SPARK = '▁▂▃▄▅▆▇█'
const MAX_ROWS = 60

function spark(samples: number[]): string {
  if (samples.length < 2) return ''
  const top = Math.max(...samples)
  const low = Math.min(...samples)
  if (top === low) return '▁'.repeat(Math.min(samples.length, 8))

  return samples
    .slice(-8)
    .map(n => SPARK.charAt(Math.round(((n - low) / (top - low)) * (SPARK.length - 1))))
    .join('')
}

function tokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`

  return String(n)
}

function elapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(s / 60)

  return m >= 60
    ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`
    : `${m}:${String(s % 60).padStart(2, '0')}`
}

function isLive(status: string): boolean {
  return status === 'running' || status === 'waiting' || status === 'pending'
}

function mark(status: string): string {
  if (status === 'running') return '●'
  if (status === 'waiting' || status === 'pending') return '◌'
  if (status === 'idle') return '○'
  if (status === 'completed') return '✓'
  return '✗'
}

function tone(status: string): string {
  if (status === 'running') return 'yellow'
  if (status === 'waiting' || status === 'pending' || status === 'idle') return 'cyan'
  if (status === 'completed') return 'green'
  return 'red'
}

// Parents before children, live agents before finished ones, newest first inside a level.
function tree(all: Row[]): { row: Row; depth: number }[] {
  const ids = new Set(all.map(r => r.id))
  const kids = new Map<string, Row[]>()
  const roots: Row[] = []
  for (const r of all) {
    if (r.parentId && ids.has(r.parentId)) {
      kids.set(r.parentId, [...(kids.get(r.parentId) ?? []), r])
    } else {
      roots.push(r)
    }
  }
  const order = (a: Row, b: Row) =>
    Number(isLive(b.status)) - Number(isLive(a.status)) || b.startTime - a.startTime
  const out: { row: Row; depth: number }[] = []
  const walk = (r: Row, depth: number) => {
    out.push({ row: r, depth })
    for (const k of (kids.get(r.id) ?? []).sort(order)) walk(k, depth + 1)
  }
  for (const r of roots.sort(order)) walk(r, 0)

  return out
}

export const register: Register = on => {
  let lastKey = ''
  let cancel: (() => void) | undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'swarm',
      description: 'Open the live pane of the agents running in this session',
    })
    cancel?.()
    const refresh = async () => {
      const list = await $.agent.list()
      const fresh: Row[] = list.map(a => ({
        id: a.id,
        parentId: a.parentId,
        name: a.name ?? a.type,
        type: a.type,
        status: a.status,
        label: (a.label.split('\n')[0] ?? '').trim(),
        startTime: a.startTime,
        tokens: a.tokenCount,
        samples: a.tokenSamples,
        usd: a.cost?.usd ?? null,
      }))
      // Only a change redraws the pane: the clock moves every second, the list does not.
      const key = JSON.stringify(fresh.map(r => [r.id, r.status, r.label, r.tokens, r.usd]))
      if (key !== lastKey) {
        lastKey = key
        await update($, rows, () => fresh)
      }
    }
    const timer = $.clock.every(2000, refresh)
    cancel = () => timer.cancel()
    await refresh()

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    cancel?.()
    cancel = undefined

    return next(e)
  })

  on('command.run', { command: 'swarm' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Swarm' })

    return { text: 'Swarm pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const all = await read($, rows)
    const now = await $.clock.now()
    const cols = e.viewport?.columns ?? 80
    const room = Math.max(1, (e.viewport?.rows ?? 24) - 5)

    const live = all.filter(r => isLive(r.status)).length
    const usd = all.reduce((n, r) => n + (r.usd ?? 0), 0)
    const total = all.reduce((n, r) => n + r.tokens, 0)

    if (all.length === 0) {
      return (
        <Box flexDirection="column">
          <Text dimColor>No agents in this session yet.</Text>
        </Box>
      )
    }

    const shown = tree(all).slice(0, Math.min(MAX_ROWS, room))
    const labelWidth = Math.max(16, cols - 52)

    return (
      <Box flexDirection="column">
        <Text>
          <Text bold>{live} running</Text>
          <Text dimColor>
            {' '}
            · {all.length - live} finished · {tokens(total)} tokens
            {usd > 0 ? ` · est $${usd.toFixed(2)}` : ''}
          </Text>
        </Text>
        {shown.map(({ row, depth }) => {
          const label = row.label.length > labelWidth ? `${row.label.slice(0, labelWidth - 1)}…` : row.label
          const stat = isLive(row.status) ? elapsed(now - row.startTime) : row.status

          return (
            <Text key={row.id}>
              {'  '.repeat(depth)}
              <Text color={tone(row.status)}>{mark(row.status)} </Text>
              <Text bold>{row.name} </Text>
              <Text dimColor>
                {label} · {stat} · {tokens(row.tokens)} {spark(row.samples)}
                {row.usd !== null && row.usd > 0 ? ` · $${row.usd.toFixed(2)}` : ''}
              </Text>
            </Text>
          )
        })}
        {all.length > shown.length ? (
          <Text dimColor>+{all.length - shown.length} more</Text>
        ) : null}
      </Box>
    )
  })
}
