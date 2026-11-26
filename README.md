# claude-mods

Two Claude Code mods. Both only read what the engine reports about the session; neither makes network requests nor starts processes.

| Mod | What it does | Command |
| --- | --- | --- |
| `usage-meter` | A band above the prompt with the 5-hour and weekly plan limits (bars and reset times), context fill and the session's estimated cost. Bars turn yellow at 70% and red at 90%, and a toast appears at 80% and 95%. | `/meter` |
| `swarm` | Mission control for subagents and agent teams: who is running, what each is doing, who spawned whom and who talks to whom. By OneWave AI, included unchanged (see below). | `/swarm` |

## Install

In a Claude Code session:

```
/plugin marketplace add mirfan899/claude-mods
/plugin install usage-meter@claude-mods
/plugin install swarm@claude-mods
```

Then run `/reload-plugins`, or start a new session.

## Notes

- Plan-limit bars show only on a subscription, after the first reply reports them.
- Costs are local estimates and not the bill.
- A mod is code that runs inside Claude Code with your permissions. Read the source before you install it: each mod's code is in its `hooks` folder.
- Check a mod with `claude plugin validate <folder>`.

## Credits

`swarm` is by [OneWave AI](https://github.com/OneWave-AI/claude-code-mods/tree/main/swarm) and is included here unchanged from commit `e6da26c` of their repository, under the MIT licence: see `swarm/LICENSE`. All credit for it is theirs. `usage-meter` is mine.

MIT licensed.
