import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Snapshot } from '../types'

const snap = atom({ plugin: 'usage-meter', key: 'snap' } as const, null)
const isHidden = atom({ plugin: 'usage-meter', key: 'isHidden' } as const, false)
const alerted = atom({ plugin: 'usage-meter', key: 'alerted' } as const, {})

const THRESHOLDS = [80, 95]
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function name(kind: string): string {
  if (kind === 'five_hour') return '5h'
  if (kind === 'seven_day') return 'week'
  if (kind === 'spend_limit') return 'spend'
  return kind
}

function bar(percent: number): string {
  const filled = Math.max(0, Math.min(10, Math.round(percent / 10)))
  return '█'.repeat(filled) + '░'.repeat(10 - filled)
}

function tone(percent: number): string {
  if (percent >= 90) return 'red'
  if (percent >= 70) return 'yellow'
  return 'green'
}

// When a window resets, as a person reads it: relative within a day, else the weekday and clock time.
function when(iso: string | undefined, now: number): string {
  if (!iso) return ''
  const at = new Date(iso)
  const ms = at.getTime() - now
  if (Number.isNaN(ms)) return ''
  if (ms <= 0) return 'resets now'
  const minutes = Math.round(ms / 60000)
  if (minutes < 60) return `resets in ${minutes}m`
  if (minutes < 24 * 60) {
    return `resets in ${Math.floor(minutes / 60)}h ${minutes % 60}m`
  }
  const hours24 = at.getHours()
  const suffix = hours24 >= 12 ? 'pm' : 'am'
  const hours = hours24 % 12 || 12
  const mins = String(at.getMinutes()).padStart(2, '0')

  return `resets ${DAYS[at.getDay()]} ${hours}:${mins}${suffix}`
}

function dollars(usd: number | null): string {
  if (usd === null || usd <= 0) return ''

  return `est $${usd.toFixed(2)}`
}

function summary(s: Snapshot, now: number): string {
  const lines = s.windows.map(
    w => `${name(w.kind)}: ${w.percentUsed}% used ${when(w.resetsAt, now)}`.trim(),
  )
  if (s.windows.length === 0) {
    lines.push('Plan limits: no reading yet (none off a subscription, or before the first reply).')
  }
  if (s.contextPercent !== null) lines.push(`Context: ${s.contextPercent}% full`)
  const cost = dollars(s.usd)
  if (cost) lines.push(`${cost} this session (an estimate, not the bill)`)

  return lines.join('\n')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'meter',
      description: 'Show plan-limit usage, context fill and estimated cost; bring the band back if hidden',
    })
    await update($, snap, () => null)

    return next(e)
  })

  on('command.run', { command: 'meter' }, async $ => {
    const usage = await $.session.usage()
    const fresh: Snapshot = {
      windows: usage.rateLimits.map(w => ({
        kind: w.kind,
        percentUsed: w.percentUsed,
        resetsAt: w.resetsAt,
      })),
      contextPercent: usage.context.percent ?? null,
      usd: usage.cost?.usd ?? null,
    }
    await update($, snap, () => fresh)
    await update($, isHidden, () => false)

    return { text: summary(fresh, await $.clock.now()) }
  })

  on('session.measure', async ($, e, next) => {
    const fresh: Snapshot = {
      windows: e.rateLimits.map(w => ({
        kind: w.kind,
        percentUsed: w.percentUsed,
        resetsAt: w.resetsAt,
      })),
      contextPercent: e.context.percent ?? null,
      usd: e.cost?.usd ?? null,
    }
    await update($, snap, () => fresh)

    const now = await $.clock.now()
    const done = await read($, alerted)
    const next_: Record<string, number> = { ...done }
    for (const w of fresh.windows) {
      const key = `${w.kind}:${w.resetsAt ?? ''}`
      const crossed = THRESHOLDS.filter(t => w.percentUsed >= t)
      const top = crossed[crossed.length - 1] ?? 0
      if (top > (done[key] ?? 0)) {
        next_[key] = top
        $.ui.toast(
          `${name(w.kind)} limit at ${w.percentUsed}% ${when(w.resetsAt, now)}`.trim(),
        )
      }
    }
    const keys = Object.keys(next_)
    if (keys.length > 12) {
      for (const k of keys.slice(0, keys.length - 12)) delete next_[k]
    }
    await update($, alerted, () => next_)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, snap)
    if (e.props.hasSurvey || s === null || (await read($, isHidden))) {
      return next(e)
    }
    const cost = dollars(s.usd)
    const hasWindows = s.windows.length > 0
    const hasContext = s.contextPercent !== null
    if (!hasWindows && !hasContext && !cost) return next(e)

    const now = await $.clock.now()
    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box>
        {s.windows.map(w => (
          <Text key={w.kind}>
            <Text dimColor>{name(w.kind)} </Text>
            <Text color={tone(w.percentUsed)}>
              {bar(w.percentUsed)} {w.percentUsed}%
            </Text>
            <Text dimColor> {when(w.resetsAt, now)}   </Text>
          </Text>
        ))}
        {hasContext ? <Text dimColor>ctx {s.contextPercent}%   </Text> : null}
        {cost ? <Text dimColor>{cost}   </Text> : null}
        <Button
          key="hide"
          label="Hide"
          onPress={() => update($, isHidden, () => true)}
        />
      </Box>
    )
  })
}
