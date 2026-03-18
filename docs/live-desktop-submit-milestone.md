# Live Desktop Submit Milestone

## What unexpectedly worked

The avatar app was able to submit a prompt into the live Codex desktop app **without needing to visibly move the mouse as the main path**.

That success path was:

1. detect the visible Codex window with `pywinauto`
2. find the Codex message input surface through UI Automation
3. focus that input control directly with `input_surface.set_focus()`
4. paste the prompt with clipboard + `Ctrl+A` / `Ctrl+V`
5. trigger send with `Enter`
6. capture the resulting Codex reply from the live desktop window

## Why it worked

The important milestone is the **direct UI Automation focus path**, not broad mouse driving.

The helper does not need to wander the desktop when the good path works. It can target the Codex input control directly, which is both safer and less disruptive.

The coordinate click path is only a fallback if direct control focus fails.

## What not to break

- Do not replace `input_surface.set_focus()` with mouse movement as the primary submit path.
- Do not make coordinate clicking the default path.
- Keep desktop automation scoped to the Codex window only.
- Keep pre-submit checks strict:
  - Codex window found
  - Codex window visible
  - Codex window focused before submit
  - input target found
  - result region found
  - confidence above threshold

## Why the focus error happened

The earlier helper required the Codex window to remain the foreground window **during capture** after send.

That meant the app could:

- successfully focus the Codex input
- paste the prompt
- press `Enter`
- and still fail afterward if foreground focus changed while waiting for the reply

The narrow preservation fix is:

- keep the strict focus checks **before submit**
- keep the strict focus checks **at send**
- stop requiring Codex to remain foreground during the post-send capture loop
- instead, verify that the Codex window handle is still valid and that the window remains visible/readable

## How to recognize the good path in logs

These log lines indicate the milestone behavior is working:

- `submit-pipeline desktop-submit-adapter-invoked`
- `submit-pipeline codex-window-found ...`
- `submit-pipeline input-target-found ...`
- `submit-pipeline input-target-focus direct`
- `submit-pipeline prompt-injected ...`
- `submit-pipeline send-triggered enter`

If `input-target-focus coordinate-fallback` appears, the helper still worked, but it did **not** use the preferred milestone path.

## Manual validation checklist

1. Speak into the avatar.
2. Confirm `Last Heard` updates.
3. Confirm the prompt appears in the live Codex input.
4. Confirm send triggers without visible mouse movement in the normal path.
5. Move the mouse away after send.
6. Confirm capture does not fail just because Codex lost foreground.
7. If a failure happens, read the backend diagnostics log and confirm it reports the exact step that failed.
