# burn-meter (Deck style)

A usage meter for Claude Code, drawn above the prompt: a fire bar on the left and, on the right, your usage in the look of the Deck mod.

```
 Context        ● 124k / 1M                         12%
 Session · 5h   ◔ 5h · 31% · ~52% at reset   in 2:14:09
 Weekly · 7d    ◑ 7d · 64% used           in 3d 5h 12m
 Sonnet 5.5     ● 46.2M in · 121k out              74%
```

- **Context, Session, Weekly** (and the weekly **Opus** limit when your account has one): one solid bar each, with the label in front, a short text in the bar, and the percentage or reset countdown on the right.
- **Per-model usage:** one row for each model, coloured haiku green, sonnet violet and opus amber. The bar is that model's share of the tokens, with tokens in and out.
- **Pace:** when there is enough history, a limit shows where it will land at reset (`~52% at reset`) or when it will run out (`out in ~1h20m`). Colours go amber at 50% and red at 80% (context: 60% and 85%).
- **No cost.** The band shows plan usage only, and there are no spend toasts.
- `/burn` still opens the original panel and `/burn demo` shows a demo.

## Install

```
/plugin marketplace add mirfan899/claude-mods
/plugin install burn-meter@claude-mods
```

Then run `/reload-plugins`. The plan-limit rows appear on a subscription, after the first reply reports them.

## Font

The icons are the characters Deck itself uses (`● ◔ ◑ !`). `◔` and `◑` are missing from some terminal fonts, for example Consolas, and the terminal then draws a stretched substitute. A font that has them, such as DejaVu Sans Mono, draws them correctly. In VS Code, set `terminal.integrated.fontFamily` to it.

## What is different from OneWave's burn-meter

The fuse, the lifetime tally and the `/burn` panel are theirs, unchanged. What changed: the right-hand side of the band now shows usage rows in Deck's style (it showed the money and a burrito comparison), the weekly Opus window and context tokens are read, and the pace maths and the ticking countdown follow Deck's.

## Credits and licences

- The burn meter is by [OneWave AI](https://github.com/OneWave-AI/claude-code-mods/tree/main/burn-meter), MIT. Their licence is in `LICENSE`.
- The row design, colours, thresholds, wording and pace maths follow the [Deck mod](https://github.com/nvr0x5/claude-deck) by nvr0x5, MIT. Its licence is in `DECK-LICENSE`.
- The modifications are by mirfan899, also MIT.

A mod is code that runs inside Claude Code with your permissions and is not sandboxed. Read it before you install it. This one reads only what the engine reports about the session, makes no network requests and starts no processes.

An unofficial, independent project, not affiliated with Anthropic.
