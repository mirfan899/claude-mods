# usage-meter

A band above the Claude Code prompt that shows the account's 5-hour and weekly plan limits as bars with their reset times, how full the context window is, and the session's estimated cost.

- Bars turn yellow at 70% and red at 90%.
- A toast appears when a limit crosses 80% and again at 95%.
- `/meter` prints the same figures as text and brings the band back after it was hidden with its Hide button.
- Plan-limit bars appear only on a subscription, after the first reply reports them. The cost is a local estimate, not the bill.

It reads only what the engine reports for the session. It makes no network requests and runs no processes.
