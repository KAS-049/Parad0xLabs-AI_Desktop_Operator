# Migration Note: Live Desktop Codex Is Primary

The repo previously moved toward backend-owned Codex execution as the primary path.

This correction restores the intended architecture:

- the visible Codex desktop app is again the primary execution surface
- desktop automation is centralized and hardened
- direct backend sessions remain available only as optional secondary/debug paths

## What changed

- labels now describe live desktop Codex as the primary mode
- the desktop automation helper is treated as the single allowed layer for live Codex window interaction
- desktop submit/capture now returns a structured automation report with confidence and abort details
- result handling stays normalized before avatar speech and journaling

## Operational impact

- normal user runs should stay in desktop primary mode
- debug runs can still use backend Codex providers when intentionally selected
- low-confidence or off-target desktop automation attempts are blocked instead of guessed
