# Live Desktop Codex Primary

Codex Avatar is intended to operate as a strict companion/operator layer for the visible Codex desktop app.

## Primary path

The primary supported path is now:

1. user speaks or types into the avatar
2. avatar prepares the prompt
3. strict desktop automation targets the visible Codex window
4. prompt is submitted into that live Codex desktop session
5. the result is captured back from that same desktop session
6. the avatar speaks the summary and updates the engineering log

## Why this is primary

This matches the intended product behavior:

- the user can watch the real Codex desktop app
- the avatar acts as a companion layer, not a replacement Codex runtime
- the same live desktop thread remains the system the user sees and trusts

## Safety model

Desktop automation is centralized into one adapter/service and is intentionally strict:

- only the Codex window may be targeted
- input is blocked if the Codex window, input target, focus state, or confidence checks fail
- result capture is blocked if the helper cannot confidently identify the result region
- clipboard use is restored after submit where possible
- broad desktop wandering is not allowed

## Secondary/debug modes

Direct backend Codex paths still exist, but only as optional secondary/debug modes. They are not the intended default product architecture.
