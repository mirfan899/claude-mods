# claude-mods

Two small Claude Code mods. Both only read what the engine reports about the session. Neither makes network requests nor starts processes.

| Mod | What it does | Command |
| --- | --- | --- |
| `usage-meter` | A band above the prompt with the 5-hour and weekly plan limits (bars and reset times), context fill and the session's estimated cost. Bars turn yellow at 70% and red at 90%, and a toast appears at 80% and 95%. | `/meter` |
| `swarm` | A live pane of the agents running in the session: who spawned whom, status, what each is doing, time, tokens with a trend line and estimated cost. | `/swarm` |

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
- A mod is code that runs inside Claude Code with your permissions. Read the source before you install it: each mod is one small `hooks/register.tsx`.
- Check a mod with `claude plugin validate <folder>`.

MIT licensed.
