# In-App Wake Listening

This workspace now supports a local two-stage wake flow for the already-open avatar app.

## Intended behavior

When the app is open and the compact avatar is on the desktop:

1. The backend-owned local wake helper waits only for the configured wake phrase.
2. When that phrase is heard, the avatar visibly wakes.
3. The renderer opens a short follow-up command capture window.
4. The captured command is sent through the existing live desktop Codex submit path.

The existing manual click-to-speak flow remains unchanged.

## Why this implementation is isolated

- It adds one local Windows wake helper plus a narrow renderer event handler.
- It does not refactor providers or desktop automation.
- It does not change journaling, diagrams, export flow, or avatar asset loading.
- It reuses the existing `startRun()` path after the wake phrase is recognized.

## Important design note

For the already-open app path, wake ownership is now single-source:

- the backend/helper path owns wake phrase detection
- the renderer owns the short follow-up command recording after wake

The dormant renderer browser wake-listener path is intentionally disabled for this flow so the app does not have overlapping wake authorities.

This keeps the mic phrase-gated and avoids always streaming open-ended audio into Codex.

## Current compromise

The selected microphone setting is still preserved for the manual record-and-send path and for the renderer follow-up command capture after wake. The backend wake helper remains responsible only for recognizing the wake phrase.

If the local Windows speech recognizer cannot access the microphone, the app fails clearly and manual click-to-speak still works.

## Key states

- `wake-listening`
- `wake-detected`
- `command-listening`
- `thinking`
- `speaking`
- `error`

## Manual validation

1. Open the avatar app and leave the console closed.
2. Enable wake listening in settings and save.
3. Say the configured wake phrase.
4. Confirm the avatar pulses and enters command listening.
5. Speak a short request.
6. Confirm `Last Heard` updates and the existing live Codex desktop submit path runs.
7. Confirm the app returns to wake listening after the run finishes or times out cleanly if no follow-up command is spoken.
8. Confirm wake events are ignored while the app is already recording, submitting, or speaking, so duplicate wake triggers do not pile up.
