import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Burn, ModelTally, Sample } from '../types'
import { FIRE_ROWS, THINGS, barText, compare, crossed, fireCells, heat, lifetimeDelta, modelShares, modelsLine, money, pct, burnPerMs, pace, fmtDur, fmtK, clockLeft, countdown, projection, rate, rateText, resetsIn, shortIn, tallyTurn, tokenCount, tween, windows } from './burn'

const burn = atom({ plugin: 'burn-meter', key: 'burn' } as const, {
  shown: 0,
  target: 0,
  isDemo: false,
  lifetime: 0,
  session: -1,
  week: -1,
  sessionResets: '',
  weekResets: '',
  opus: -1,
  opusResets: '',
  ctx: -1,
  ctxTokens: -1,
  ctxWindow: -1,
} as Burn)
const isHidden = atom({ plugin: 'burn-meter', key: 'isHidden' } as const, false)
const fired = atom({ plugin: 'burn-meter', key: 'fired' } as const, [] as number[])
const models = atom({ plugin: 'burn-meter', key: 'models' } as const, {} as Record<string, ModelTally>)
const turns = atom({ plugin: 'burn-meter', key: 'turns' } as const, [] as number[])
const turnStart = atom({ plugin: 'burn-meter', key: 'turnStart' } as const, 0)
const tickAt = atom({ plugin: 'burn-meter', key: 'tickAt' } as const, 0)
const history = atom({ plugin: 'burn-meter', key: 'history' } as const, [] as Sample[])

const GOLD = '#c2a87e'
// Deck's colors for a solid row: the bar's fill, the text on it, the empty track and its text.
const OK = { fill: '#5DCAA5', on: '#04342C' }
const WARN = { fill: '#EBA83A', on: '#412402' }
const HOT = { fill: '#E2706F', on: '#501313' }
const TIER: Record<string, { fill: string; on: string }> = {
  haiku: { fill: '#5DCAA5', on: '#04342C' },
  sonnet: { fill: '#9C95EC', on: '#26215C' },
  opus: { fill: '#EBA83A', on: '#412402' },
  other: { fill: '#77756f', on: '#f2f0ea' },
}
const TRACK_BG = '#2b2a28'
const MUTED = '#9a9893'
const TEXT = '#e8e6e1'
const PURPLE = { fill: '#9C95EC', on: '#26215C' }
const LABEL_W = 14
const RIGHT_W = 12
const shade = (p: number) => (p >= 90 ? HOT : p >= 70 ? WARN : OK)
const PAPER = '#E8E2D6'
const RED = '#e5484d'
const ORANGE = '#e8833a'

const DEMO_MS = 20_000
const DEMO_TOP = 30.5
const DEMO_HOLD_MS = 6_000

let tweenTimer: { cancel: () => void } | null = null
let sparkTimer: { cancel: () => void } | null = null
let sparkSize = 0
let bandId: string | null = null
let tickTimer: { cancel: () => void } | null = null
const startTick = ($: EngineInterface) => {
  if (tickTimer) return
  tickTimer = $.clock.every(1000, () => {
    update($, tickAt, () => Date.now()).catch(() => {}) // a tick that lands mid-draw is refused: the next one is fine
  })
}
const stopTick = () => {
  tickTimer?.cancel()
  tickTimer = null
}
let demoStartedAt = 0
let demoFired: number[] = []
let paneTimer: { cancel: () => void } | null = null
let paneSize = ''

const PANE = 'burn'
const PANE_FIRE_ROWS = 8
const TURNS_KEPT = 12

/** Animates the pane's tall fire while the pane is mounted; stops once a blit is refused. */
const startPaneFire = ($: EngineInterface, columns: number) => {
  const size = `${columns}x${PANE_FIRE_ROWS}`
  if (paneTimer && paneSize === size) return
  paneTimer?.cancel()
  paneSize = size
  const timer = $.clock.every(70, () => {
    void Promise.all([read($, burn), $.clock.now()]).then(([b, now]) =>
      $.ui
        .blit({
          requestId: PANE,
          key: 'bigfire',
          cells: fireCells(columns, fill(b), fill(b), now / 1000, PANE_FIRE_ROWS),
        })
        .then(r => {
          if (r.deny && paneTimer === timer) {
            timer.cancel()
            paneTimer = null
          }
        }),
    )
  })
  paneTimer = timer
}

const openPane = ($: EngineInterface) => $.ui.open({ id: PANE, title: 'Burn Meter', focus: true })

type Reading = { sessionId: string; usd: number }

/** Folds a real cost reading into the lifetime total and the target. */
const readCost = async ($: EngineInterface) => {
  const usage = await $.session.usage()
  const usd = usage.cost?.usd ?? 0
  const sub = windows(usage.rateLimits)
  const ctx = usage.context.percent ?? -1
  const ctxTokens = usage.context.tokens ?? -1
  const ctxWindow = usage.context.window ?? -1
  const sessionId = await $.session.id()
  const lastKey = `last:${sessionId}`
  const last = ((await $.store.get(lastKey)) ?? null) as Reading | null
  const delta = lifetimeDelta(last, sessionId, usd)
  const stored = Number((await $.store.get('lifetime')) ?? 0)
  const lifetime = stored + delta
  if (delta !== 0 || !last || last.sessionId !== sessionId) {
    await $.store.set('lifetime', lifetime)
    await $.store.set(lastKey, { sessionId, usd })
  }
  const now = await read($, burn)
  if (sub.session >= 0 || sub.week >= 0) {
    const at = Date.now()
    await update($, history, list => {
      const prev = list[list.length - 1]
      if (prev && prev.s === sub.session && prev.w === sub.week && at - prev.t < 300_000) return list
      const reading = { t: at, s: sub.session, w: sub.week }
      const next = prev && at - prev.t < 20_000 ? [...list.slice(0, -1), reading] : [...list, reading]
      return next.filter(x => at - x.t <= 26 * 3_600_000).slice(-400)
    })
  }
  if (now.ctx !== ctx || now.ctxTokens !== ctxTokens || now.ctxWindow !== ctxWindow) await update($, burn, b => ({ ...b, ctx, ctxTokens, ctxWindow }))
  if (
    now.session !== sub.session ||
    now.week !== sub.week ||
    now.sessionResets !== sub.sessionResets ||
    now.weekResets !== sub.weekResets ||
    now.opus !== sub.opus ||
    now.opusResets !== sub.opusResets
  ) {
    await update($, burn, b => ({ ...b, ...sub }))
  }
  if (now.isDemo) {
    if (now.lifetime !== lifetime) await update($, burn, b => ({ ...b, lifetime }))
    return
  }
  if (now.target !== usd || now.lifetime !== lifetime) {
    await alarm($, now.target, usd, false)
    await update($, burn, b => ({ ...b, target: usd, lifetime }))
  }
  startTween($)
}

/** Toasts each threshold the spend just crossed, once per session (or per demo). */
const alarm = async ($: EngineInterface, from: number, to: number, isDemo: boolean) => {
  if (!isDemo) return // no cost toasts: the band shows plan usage only
  const already = isDemo ? demoFired : await read($, fired)
  const hits = crossed(from, to, already)
  if (hits.length === 0) return
  const top = hits[hits.length - 1]!
  $.ui.toast(`${money(top)} burned this session ${compare(top, top)}`, { timeoutMs: 6000 })
  if (isDemo) demoFired = [...demoFired, ...hits]
  else await update($, fired, list => [...list, ...hits])
}

/** Eases the odometer toward its target, 20 frames a second, and stops once it lands. */
const startTween = ($: EngineInterface) => {
  if (tweenTimer) return
  const timer = $.clock.every(50, () => {
    void read($, burn).then(async b => {
      if (b.shown === b.target) {
        timer.cancel()
        if (tweenTimer === timer) tweenTimer = null
        return
      }
      await update($, burn, x => ({ ...x, shown: tween(x.shown, x.target) }))
    })
  })
  tweenTimer = timer
}

/** The bar's fill: the 5-hour window on a subscription, else the spend's heat. */
const fill = (b: Burn) => (b.isDemo || b.session < 0 ? heat(b.shown) : Math.max(0.02, Math.min(1, b.session / 100)))

/** Animates the fire by blitting the bar while the band is mounted. */
const startSpark = ($: EngineInterface, columns: number) => {
  if (sparkTimer && sparkSize === columns) return
  sparkTimer?.cancel()
  sparkSize = columns
  const timer = $.clock.every(80, () => {
    if (!bandId) return
    void Promise.all([read($, burn), $.clock.now()]).then(([b, now]) =>
      $.ui
        .blit({
          requestId: bandId!,
          key: 'fire',
          cells: fireCells(columns, fill(b), fill(b), now / 1000),
        })
        .then(r => {
          if (r.deny && sparkTimer === timer) {
            timer.cancel()
            sparkTimer = null
          }
        }),
    )
  })
  sparkTimer = timer
}

const runDemo = async ($: EngineInterface) => {
  demoStartedAt = await $.clock.now()
  demoFired = []
  await update($, isHidden, () => false)
  await update($, burn, b => ({ ...b, shown: 0, target: 0, isDemo: true }))
  const ramp = $.clock.every(100, () => {
    void $.clock.now().then(async now => {
      const t = Math.min(1, (now - demoStartedAt) / DEMO_MS)
      // Slow start, steep finish: how a long agent session actually feels.
      const target = DEMO_TOP * t * t * (0.35 + 0.65 * t)
      const before = (await read($, burn)).target
      await alarm($, before, target, true)
      await update($, burn, b => ({ ...b, target }))
      startTween($)
      if (t >= 1) {
        ramp.cancel()
        $.clock.after(DEMO_HOLD_MS, () => {
          void update($, burn, b => ({ ...b, isDemo: false, shown: 0, target: 0 })).then(() => readCost($))
        })
      }
    })
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'burn',
      description: 'Burn meter: /burn opens the panel; [panel|show|hide|demo|lifetime]',
    })
    void readCost($).catch(() => undefined)
    $.clock.every(1000, () => void readCost($).catch(() => undefined))
    // The comparison rotates every six seconds even while the spend sits still.
    $.clock.every(6000, () => $.ui.invalidate('ui.render'))

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const usd = (await $.session.usage()).cost?.usd ?? 0
    await update($, turnStart, () => usd)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    const usage = done.usage
    if (usage) await update($, models, m => tallyTurn(m, usage))
    await readCost($).catch(() => undefined)
    const usd = (await $.session.usage()).cost?.usd ?? 0
    const spent = Math.max(0, usd - (await read($, turnStart)))
    await update($, turns, list => [...list, spent].slice(-TURNS_KEPT))
    await update($, turnStart, () => usd)
    return done
  })

  on('command.run', { command: 'burn' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'demo') {
      void openPane($)
      await runDemo($)
      return { text: 'Burn demo: $0 to $30 in 20 seconds.' }
    }
    if (arg === 'hide') {
      await update($, isHidden, () => true)
      return { text: 'Burn meter hidden. /burn show brings it back.' }
    }
    const b = await read($, burn)
    if (arg === 'lifetime') {
      return { text: `Lifetime burn: ${money(b.lifetime)} ${compare(b.lifetime, 2)}.` }
    }
    await update($, isHidden, () => false)
    if (arg === '' || arg === 'panel') void openPane($)
    const used = modelsLine(await read($, models), 6)
    const limits = `5h ${pct(b.session)}, week ${pct(b.week)}`
    return {
      text: `This session: ${money(b.target)} ${compare(b.target, 0)}. ${limits}. Lifetime: ${money(b.lifetime)}.${used ? `\nModels: ${used}` : ''}`,
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) {
      stopTick()
      return next(e)
    }
    const b = await read($, burn)
    if (b.target <= 0 && b.session < 0 && !b.isDemo) {
      stopTick()
      return next(e)
    }
    await read($, tickAt)
    startTick($)

    const elements = $.ui.resolve(e)
    const { Box, Text, Button } = elements
    const Raster = 'Raster' in elements ? elements.Raster : null
    const hasFire = Raster !== null && e.surface === 'terminal'
    const now = await $.clock.now()
    const cols = Math.max(40, e.props.bodyColumns || 80)
    const level = fill(b)
    const color = level > 0.75 ? RED : level > 0.45 ? ORANGE : GOLD
    const isRolling = b.shown !== b.target
    const W = Math.max(24, Math.min(48, Math.floor((cols - 20) * 0.35)))
    const bar = Math.max(12, Math.min(160, cols - 12 - (2 + LABEL_W + W + 2 + RIGHT_W) - 4))
    const which = Math.floor(now / 6000) % THINGS.length
    const hist = await read($, history)
    const wallNow = Date.now()
    // One row as Deck draws it: boxes of fixed widths side by side, so the columns hold whatever the icon's width.
    const row = (
      key: string,
      glyph: string,
      glyphColor: string,
      label: string,
      text: string,
      p: number,
      c: { fill: string; on: string },
      right: string,
    ) => {
      const inner = (' ' + text + ' ').slice(0, W).padEnd(W)
      const f = Math.max(0, Math.min(W, Math.round((W * Math.max(0, p)) / 100)))
      return (
        <Box key={key} flexDirection="row" columnGap={1} height={1} overflow="hidden">
          <Box width={2} flexShrink={0}>
            <Text color={glyphColor}>{glyph}</Text>
          </Box>
          <Box width={LABEL_W} flexShrink={0}>
            <Text color={TEXT} wrap="truncate">{label}</Text>
          </Box>
          <Box width={W} flexShrink={0} flexDirection="row" overflow="hidden">
            <Text bold color={c.on} backgroundColor={c.fill}>{inner.slice(0, f)}</Text>
            <Text color={MUTED} backgroundColor={TRACK_BG}>{inner.slice(f)}</Text>
          </Box>
          <Box width={RIGHT_W} flexShrink={0} justifyContent="flex-end">
            <Text color={MUTED} wrap="truncate">{right}</Text>
          </Box>
        </Box>
      )
    }
    const limitRow = (key: string, label: string, tag: string, p: number, resets: string, field: 's' | 'w' | null) => {
      if (p < 0) return row(key, '●', MUTED, label, 'no reading yet', 0, OK, '')
      const per = field ? burnPerMs(hist, field, wallNow) : null
      const at = field ? pace(p, resets, per, wallNow) : null
      const out = at && at.outInMs !== null ? `out in ~${fmtDur(at.outInMs)}` : ''
      const toReset = at && !out && at.atReset >= p + 1 ? `~${Math.round(at.atReset)}% at reset` : ''
      const state = p >= 80 ? 'hot' : p >= 50 || (out && p >= 40) ? 'warn' : 'ok'
      const c = state === 'hot' ? HOT : state === 'warn' ? WARN : OK
      const text = `${tag} · ${Math.round(p)}%${out || toReset ? ` · ${out || toReset}` : ' used'}`
      const glyph = state === 'hot' ? '!' : state === 'warn' ? '◑' : '◔' // Deck's own icons
      return row(key, glyph, c.fill, label, text, Math.min(100, p), c, resets ? `in ${clockLeft(resets, wallNow)}` : '')
    }
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
    const modelRows = modelShares(await read($, models), cols >= 110 ? 3 : 2)

    if (hasFire) {
      bandId = e.requestId
      startSpark($, bar)
    }

    return (
      <Box gap={2} alignItems="flex-end">
        <Box flexDirection="column">
          <Text color={color} bold>{b.isDemo ? 'DEMO' : 'USAGE'}</Text>
                    <Button key="hide" label="hide" plain onPress={() => void update($, isHidden, () => true)} />
        </Box>
        {hasFire ? (
          <Raster key="fire" columns={bar} rows={FIRE_ROWS} cells={fireCells(bar, level, level, now / 1000)} />
        ) : (
          <Text color={color}>{barText(bar, level)}</Text>
        )}
        <Box flexDirection="column">
          {b.ctx < 0 || b.ctxTokens < 0
            ? row('ctx', '●', MUTED, 'Context', 'no reading yet', 0, PURPLE, '')
            : row(
                'ctx',
                b.ctx >= 85 ? '!' : b.ctx >= 60 ? '◑' : '●',
                (b.ctx >= 85 ? HOT : b.ctx >= 60 ? WARN : PURPLE).fill,
                'Context',
                `${fmtK(b.ctxTokens)} / ${fmtK(b.ctxWindow)}${b.ctx >= 60 ? ' · /compact' : ''}`,
                b.ctx,
                b.ctx >= 85 ? HOT : b.ctx >= 60 ? WARN : PURPLE,
                `${Math.round(b.ctx)}%`,
              )}
          {limitRow('5h', 'Session · 5h', '5h', b.session, b.sessionResets, 's')}
          {limitRow('7d', 'Weekly · 7d', '7d', b.week, b.weekResets, 'w')}
          {b.opus >= 0 ? limitRow('opus', 'Weekly · Opus', 'Opus', b.opus, b.opusResets, null) : null}
          {modelRows.length === 0
            ? row('none', '●', MUTED, 'Models', 'no turns yet', 0, OK, '')
            : modelRows.map(m =>
                row(
                  m.name,
                  '●',
                  (TIER[m.family] ?? OK).fill,
                  cap(m.name),
                  `${tokenCount(m.input)} in · ${tokenCount(m.output)} out`,
                  m.share * 100,
                  TIER[m.family] ?? OK,
                  pct(m.share * 100),
                ),
              )}
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Text } = elements
    const Raster = 'Raster' in elements ? elements.Raster : null
    const hasFire = Raster !== null && e.surface === 'terminal'
    const b = await read($, burn)
    const history = await read($, turns)
    const now = await $.clock.now()
    const cols = Math.max(40, e.props.bodyColumns || e.viewport?.columns || 80)
    const width = cols - 2
    const level = fill(b)
    const color = level > 0.75 ? RED : level > 0.45 ? ORANGE : GOLD
    const isRolling = b.shown !== b.target
    const meter = Math.max(10, Math.min(40, width - 24))
    const windowBar = (n: number) => (n < 0 ? '' : barText(meter, Math.max(0, Math.min(1, n / 100))))
    const top = Math.max(0.01, ...history)
    const turnBar = Math.max(8, Math.min(36, width - 22))

    if (hasFire) startPaneFire($, width)

    return (
      <Box flexDirection="column" paddingX={1}>
        <Box justifyContent="space-between">
          <Text color={color} bold>{b.isDemo ? 'DEMO BURN' : 'SESSION BURN'}</Text>
          <Text dimColor>{`lifetime ${money(b.lifetime)}`}</Text>
        </Box>
        <Text>
          <Text color={isRolling ? color : PAPER} bold>{money(b.shown)}</Text>
          <Text color={GOLD}>{`  ${compare(b.shown, Math.floor(now / 6000) % THINGS.length)}`}</Text>
        </Text>
        <Box marginY={1}>
          {hasFire ? (
            <Raster key="bigfire" columns={width} rows={PANE_FIRE_ROWS} cells={fireCells(width, level, level, now / 1000, PANE_FIRE_ROWS)} />
          ) : (
            <Text color={color}>{barText(width, level)}</Text>
          )}
        </Box>

        {(b.session >= 0 || b.week >= 0) && (
          <Box flexDirection="column" marginBottom={1}>
            <Text bold color={PAPER}>Limits</Text>
            {b.session >= 0 && (
              <Text>
                <Text dimColor>{'5 hour  '}</Text>
                <Text color={b.session > 75 ? RED : GOLD}>{windowBar(b.session)}</Text>
                <Text>{` ${pct(b.session)} `}</Text>
                <Text dimColor>{resetsIn(b.sessionResets, Date.now())}</Text>
              </Text>
            )}
            {b.week >= 0 && (
              <Text>
                <Text dimColor>{'weekly  '}</Text>
                <Text color={b.week > 75 ? RED : GOLD}>{windowBar(b.week)}</Text>
                <Text>{` ${pct(b.week)} `}</Text>
                <Text dimColor>{resetsIn(b.weekResets, Date.now())}</Text>
              </Text>
            )}
          </Box>
        )}

        <Box flexDirection="column" marginBottom={1}>
          <Text bold color={PAPER}>Per turn</Text>
          {history.length === 0 && <Text dimColor>No finished turns yet.</Text>}
          {history.map((usd, i) => (
            <Text key={`turn-${i}`}>
              <Text dimColor>{`#${String(i + 1).padStart(2, ' ')}  `}</Text>
              <Text color={usd === top && history.length > 1 ? ORANGE : GOLD}>{barText(turnBar, usd / top)}</Text>
              <Text>{` ${money(usd)}`}</Text>
            </Text>
          ))}
        </Box>

        <Box flexDirection="column">
          <Text bold color={PAPER}>That is</Text>
          {THINGS.map((_, i) => (
            <Text key={`thing-${i}`} color={GOLD}>{compare(b.shown, i)}</Text>
          ))}
        </Box>
      </Box>
    )
  })
}
