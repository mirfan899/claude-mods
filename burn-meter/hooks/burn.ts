/** Pure helpers for the burn meter: money formatting, comparisons, thresholds and the fuse frame. */

export const THRESHOLDS = [1, 5, 10, 25, 50] as const

type Thing = { one: string; many: string; usd: number }

export const THINGS: readonly Thing[] = [
  { one: 'burrito', many: 'burritos', usd: 11 },
  { one: 'McDouble', many: 'McDoubles', usd: 3.19 },
]

/** Dollars with two decimals (12.34), or four under a cent so the first fractions still move. */
export const money = (usd: number) =>
  '$' + (usd > 0 && usd < 0.01 ? usd.toFixed(4) : usd.toFixed(2))

/** `= 1.4 burritos` for the thing at `index`, wrapping. */
export const compare = (usd: number, index: number) => {
  const thing = THINGS[((index % THINGS.length) + THINGS.length) % THINGS.length]!
  const count = usd / thing.usd
  const shown = count >= 10 ? count.toFixed(0) : count >= 1 ? count.toFixed(1) : count.toFixed(2)
  return `= ${shown} ${shown === '1.0' || shown === '1' ? thing.one : thing.many}`
}

/** `842`, `84k`, `1.2M`. */
export const tokenCount = (n: number) =>
  n < 1000 ? `${Math.round(n)}` : n < 1e6 ? `${Math.round(n / 1000)}k` : `${(n / 1e6).toFixed(1)}M`

type Tally = { input: number; output: number; turns: number }
type Usage = {
  model: string
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

/** Adds one turn's usage to the per-model tally. */
export const tallyTurn = (models: Readonly<Record<string, Tally>>, u: Usage) => {
  const was = models[u.model] ?? { input: 0, output: 0, turns: 0 }
  const input = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
  return { ...models, [u.model]: { input: was.input + input, output: was.output + u.output_tokens, turns: was.turns + 1 } }
}

/** `claude-opus-5-5` -> `opus 5.5`, `claude-haiku-4-5-20251001` -> `haiku 4.5`. */
export const modelName = (id: string) => {
  const m = /claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?/.exec(id)
  return m ? `${m[1]} ${m[2]}${m[3] ? `.${m[3]}` : ''}` : id
}

/** `opus 5.5 1.2M in 84k out · haiku 4.5 ...`, busiest first; '' when none. */
export const modelsLine = (models: Readonly<Record<string, Tally>>, max = 3) =>
  Object.entries(models)
    .sort((a, b) => b[1].output - a[1].output)
    .slice(0, max)
    .map(([id, t]) => `${modelName(id)} ${tokenCount(t.input)} in ${tokenCount(t.output)} out`)
    .join(' · ')

type Limit = { kind: string; percentUsed: number; resetsAt?: string }

/** The 5-hour and 7-day subscription windows out of `rateLimits`; -1 where absent. */
export const windows = (limits: readonly Limit[]) => {
  const find = (kind: string) => limits.find(l => l.kind === kind)
  const s = find('five_hour')
  const w = find('seven_day')
  const o = find('seven_day_opus')
  return {
    session: s ? s.percentUsed : -1,
    week: w ? w.percentUsed : -1,
    sessionResets: s?.resetsAt ?? '',
    weekResets: w?.resetsAt ?? '',
    opus: o ? o.percentUsed : -1,
    opusResets: o?.resetsAt ?? '',
  }
}

/** `in 2h 14m`, `in 3d 4h`, `now`; '' when unknown. */
export const resetsIn = (iso: string, now: number) => {
  if (!iso) return ''
  const ms = Date.parse(iso) - now
  if (!Number.isFinite(ms)) return ''
  if (ms <= 0) return 'now'
  const m = Math.floor(ms / 60_000)
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  return d > 0 ? `in ${d}d ${h}h` : h > 0 ? `in ${h}h ${m % 60}m` : `in ${m}m`
}

/** `42%`, or `--` with no reading. */
export const pct = (n: number) => (n < 0 ? '--' : `${Math.round(n)}%`)

/** Thresholds crossed going from `from` to `to` that are not in `fired`. */
export const crossed = (from: number, to: number, fired: readonly number[]) =>
  THRESHOLDS.filter(t => from < t && to >= t && !fired.includes(t))

/** The threshold below and above `usd`: the fuse burns from one to the next. */
export const bracket = (usd: number) => {
  let low = 0
  for (const t of THRESHOLDS) {
    if (usd < t) return { low, high: t }
    low = t
  }
  return { low, high: Math.max(100, Math.ceil(usd / 50) * 50 + 50) }
}

/** 0..1 of the way through the current bracket. */
export const burnt = (usd: number) => {
  const { low, high } = bracket(usd)
  return Math.max(0, Math.min(1, (usd - low) / (high - low)))
}

/** 0..1 how hot the session is overall: log-scaled to $100. */
export const heat = (usd: number) => Math.max(0, Math.min(1, Math.log10(1 + usd) / 2))

/** Steps `shown` toward `target`: an odometer that eases but always lands. */
export const tween = (shown: number, target: number) => {
  const gap = target - shown
  if (Math.abs(gap) < 0.0005) return target
  const step = gap * 0.22
  return shown + (Math.abs(step) < 0.0005 ? Math.sign(gap) * 0.0005 : step)
}

/** How much to add to the lifetime total for a new reading in a session. */
export const lifetimeDelta = (
  last: { sessionId: string; usd: number } | null,
  sessionId: string,
  usd: number,
) => {
  const before = last && last.sessionId === sessionId ? last.usd : 0
  return usd >= before ? usd - before : usd
}

// --- the fuse, as Raster cells -------------------------------------------

const DEFAULT = 0x01000000
const GOLD = 0xc2a87e
const ORANGE = 0xe8833a
const RED = 0xe5484d
const WHITE = 0xfff4e0

const mix = (a: number, b: number, t: number) => {
  const ch = (shift: number) => Math.round(((a >> shift) & 0xff) * (1 - t) + ((b >> shift) & 0xff) * t)
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

/** The flame color for a heat 0..1: gold, then orange, then red. */
export const flame = (h: number) => (h < 0.5 ? mix(GOLD, ORANGE, h * 2) : mix(ORANGE, RED, (h - 0.5) * 2))

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export const toBase64 = (bytes: Uint8Array) => {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    const n = (a << 16) | (b << 8) | c
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63]! : '='
    out += i + 2 < bytes.length ? B64[n & 63]! : '='
  }
  return out
}

const YELLOW = 0xffd166
const EMPTY = 0x2a2724

// ' ▁▂▃▄▅▆▇█' by eighths.
const EIGHTHS = [0x20, 0x2581, 0x2582, 0x2583, 0x2584, 0x2585, 0x2586, 0x2587, 0x2588]

export const FIRE_ROWS = 3

/** Cheap smooth noise: two beating sines, 0..1. */
const wobble = (x: number, t: number) =>
  0.5 + 0.25 * Math.sin(t * 9.1 + x * 1.7) + 0.25 * Math.sin(t * 5.3 - x * 2.9 + Math.sin(t * 2 + x))

/** The flame's color at a height 0..1 inside it: white-hot base, yellow, orange, red tips. */
const flameAt = (y: number, h: number) => {
  const tip = mix(ORANGE, RED, Math.min(1, 0.3 + h))
  return y < 0.25 ? mix(WHITE, YELLOW, y * 4) : y < 0.6 ? mix(YELLOW, ORANGE, (y - 0.25) / 0.35) : mix(ORANGE, tip, (y - 0.6) / 0.4)
}

/**
 * The fire bar, `columns` wide and FIRE_ROWS tall: a bar along the bottom row
 * filled to `fraction`, flames dancing on the filled part (tallest at the
 * leading edge, taller as `h` rises), sparks drifting off the top.
 */
export const fireCells = (columns: number, fraction: number, h: number, t: number, rows: number = FIRE_ROWS) => {
  const words = new Uint32Array(columns * rows * 3)
  const filled = Math.max(1, Math.round(fraction * columns))
  const flameRows = rows - 1
  const put = (x: number, y: number, glyph: number, fg: number) => {
    const i = (y * columns + x) * 3
    words[i] = glyph
    words[i + 1] = fg
    words[i + 2] = DEFAULT
  }
  for (let x = 0; x < columns; x++) {
    for (let y = 0; y < flameRows; y++) put(x, y, 0x20, DEFAULT)
    // The bar.
    if (x < filled) {
      const along = filled <= 1 ? 1 : x / (filled - 1)
      const edge = x === filled - 1
      const fg = edge && Math.floor(t * 14) % 2 === 0 ? WHITE : mix(GOLD, flame(Math.max(h, along * h)), along)
      put(x, rows - 1, 0x2588, fg)
    } else {
      put(x, rows - 1, 0x2591, EMPTY) // ░
      continue
    }
    // The flames over the filled part, in eighths.
    const lead = 1 - Math.min(1, (filled - 1 - x) / Math.max(4, filled * 0.6))
    const height = flameRows * 8 * Math.min(1, (0.35 + 0.4 * h + 0.45 * lead) * (0.35 + 0.9 * wobble(x, t)))
    for (let y = 0; y < flameRows; y++) {
      const fromBottom = flameRows - 1 - y
      const eighths = Math.max(0, Math.min(8, Math.round(height - fromBottom * 8)))
      if (eighths > 0) put(x, y, EIGHTHS[eighths]!, flameAt(fromBottom / flameRows + eighths / (8 * flameRows), h))
    }
    // A spark off the top, now and then.
    if (height < 9 && wobble(x * 3.1, t * 1.7) > 0.86) put(x, 0, Math.floor(t * 10 + x) % 2 ? 0xb7 : 0x2a, mix(YELLOW, ORANGE, h))
  }
  return toBase64(new Uint8Array(words.buffer))
}

/** The same bar as text, for surfaces without a Raster. */
export const barText = (columns: number, fraction: number) => {
  const filled = Math.max(1, Math.round(fraction * columns))
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, columns - filled))
}


// --- usage on the right: burn rate, projection, compact countdown ------------

/** One reading of the two plan windows (percent used, -1 where absent). */
export type Sample = { t: number; s: number; w: number }

/** Percent per hour over the last 90 minutes of readings for one window; null with too little history. */
export const rate = (history: readonly Sample[], key: 's' | 'w', now: number) => {
  const recent = history.filter(x => now - x.t <= 90 * 60_000 && x[key] >= 0)
  if (recent.length < 2) return null
  const a = recent[0]!
  const b = recent[recent.length - 1]!
  const hours = (b.t - a.t) / 3_600_000
  if (hours < 0.05) return null
  return Math.max(0, (b[key] - a[key]) / hours)
}

/** Where the window will stand when it resets at the current rate (capped at 999); null when unknown. */
export const projection = (percent: number, perHour: number | null, resetIso: string, now: number) => {
  if (perHour === null || !resetIso) return null
  const hours = (Date.parse(resetIso) - now) / 3_600_000
  if (!Number.isFinite(hours) || hours <= 0) return null
  return Math.min(999, percent + perHour * hours)
}

/** `+12%/h`, `+0.8%/h`; '' with no rate. */
export const rateText = (perHour: number | null) =>
  perHour === null ? '' : perHour < 0.05 ? 'steady' : `+${perHour < 10 ? perHour.toFixed(1) : Math.round(perHour)}%/h`

/** The time left to a reset in four or five characters: `2h38m`, `3d4h`, `45m`; '' when unknown. */
export const shortIn = (iso: string, now: number) => {
  if (!iso) return ''
  const ms = Date.parse(iso) - now
  if (!Number.isFinite(ms)) return ''
  if (ms <= 0) return 'now'
  const m = Math.floor(ms / 60_000)
  const d = Math.floor(m / 1440)
  const hr = Math.floor((m % 1440) / 60)
  return d > 0 ? `${d}d${hr}h` : hr > 0 ? `${hr}h${String(m % 60).padStart(2, '0')}m` : `${m}m`
}

/** `opus 5.5 1.2M/84k · haiku 4.5 90k/8k` (tokens in / out), busiest first; '' when none. */
export const modelsCompact = (models: Readonly<Record<string, Tally>>, max = 2) =>
  Object.entries(models)
    .sort((a, b) => b[1].output + b[1].input - (a[1].output + a[1].input))
    .slice(0, max)
    .map(([id, t]) => `${modelName(id)} ${tokenCount(t.input)}/${tokenCount(t.output)}`)
    .join(' · ')

/** The model's family, for its color: `opus`, `sonnet`, `haiku`, or `other`. */
export const family = (id: string) => (/opus/i.test(id) ? 'opus' : /sonnet/i.test(id) ? 'sonnet' : /haiku/i.test(id) ? 'haiku' : 'other')

/** One row for each of the busiest models: its name, family, share of all tokens (0..1) and tokens in and out. */
export const modelShares = (models: Readonly<Record<string, Tally>>, max = 2) => {
  const all = Object.entries(models)
  const total = all.reduce((n, [, t]) => n + t.input + t.output, 0)
  return all
    .sort((a, b) => b[1].input + b[1].output - (a[1].input + a[1].output))
    .slice(0, max)
    .map(([id, t]) => ({
      name: modelName(id),
      family: family(id),
      share: total > 0 ? (t.input + t.output) / total : 0,
      input: t.input,
      output: t.output,
    }))
}

/** The time left to a reset: `in 2h 14m`, `in 3d 5h 12m`, `in 45m`; '' when unknown. */
export const countdown = (iso: string, now: number) => {
  if (!iso) return ''
  const ms = Date.parse(iso) - now
  if (!Number.isFinite(ms)) return ''
  if (ms <= 0) return 'now'
  const m = Math.floor(ms / 60_000)
  const d = Math.floor(m / 1440)
  const hr = Math.floor((m % 1440) / 60)
  return d > 0 ? `in ${d}d ${hr}h ${m % 60}m` : hr > 0 ? `in ${hr}h ${String(m % 60).padStart(2, '0')}m` : `in ${m}m`
}

// --- the same maths as Deck's terminal rows (https://github.com/nvr0x5/claude-deck, MIT) -------------------

/** `124k`, `1M`, `1.5M`: tokens, no trailing zero. */
export const fmtK = (n: number) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))

/** `45m`, `2h15m`, `3d 5h`: a span, for "out in ~...". */
export const fmtDur = (ms: number) => {
  const m = Math.max(1, Math.round(ms / 60_000))
  if (m >= 48 * 60) {
    const hr = Math.round((m % 1440) / 60)
    return `${Math.floor(m / 1440)}d${hr ? ` ${hr}h` : ''}`
  }
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? `${m % 60}m` : ''}`
}

/** How fast a window moves, in percent per millisecond: over the last hour (a day for the weekly window); null with too little history. */
export const burnPerMs = (history: readonly Sample[], key: 's' | 'w', now: number) => {
  const span = (key === 'w' ? 24 : 1) * 3_600_000
  const list = history.filter(x => now - x.t <= span && x[key] >= 0)
  if (list.length < 2) return null
  const a = list[0]!
  const b = list[list.length - 1]!
  const gap = b.t - a.t
  if (gap < 5 * 60_000 || b[key] < a[key]) return null
  return (b[key] - a[key]) / gap
}

/** Where a window lands when it resets at the current pace; `outInMs` when it fills up first. */
export const pace = (percent: number, resetsAt: string, perMs: number | null, now: number) => {
  if (!perMs || !resetsAt) return null
  const left = Date.parse(resetsAt) - now
  if (!(left > 0)) return null
  const atReset = percent + perMs * left
  return { atReset, outInMs: atReset > 100 ? Math.max(0, (100 - percent) / perMs) : null }
}

/** The countdown to a reset: `2:14:09`, or `3d 5h 12m` from a day out. */
export const clockLeft = (iso: string, now: number) => {
  if (!iso) return ''
  let s = Math.max(0, Math.floor((Date.parse(iso) - now) / 1000))
  const d = Math.floor(s / 86400)
  const hr = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  s = s % 60
  if (d > 0) return `${d}d ${hr}h ${String(m).padStart(2, '0')}m`
  return `${hr}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
