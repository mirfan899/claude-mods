# swarm

A live pane of the agents running in this Claude Code session. Each row shows an agent, who spawned it, its status, what it is doing now, how long it has run, its tokens with a small trend line, and its estimated cost. Agents are drawn as a tree under the agent that spawned them, with running ones first.

Use `/swarm` to open the pane. The header totals the running and finished agents, their tokens and the estimated cost. The cost is a local estimate and not the bill.

The mod only reads what the engine reports about the session's agents. It makes no network requests and starts no processes.
