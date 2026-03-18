# Windows Desktop Validation Checklist

Use this checklist after changing the live desktop Codex automation path.

## Preflight

- Codex desktop app is open and visible
- Codex Avatar is in `desktop-primary` mode
- the expected Codex conversation window is on screen
- the outgoing prompt is non-empty

## Submit validation

- avatar shows `Last Heard`
- avatar shows `Sent To Codex`
- automation reports the Codex window was found
- automation reports the input target was found
- automation reports the confidence threshold passed
- the prompt appears in the visible Codex window
- Enter is sent only after the Codex window remains focused

## Capture validation

- the helper does not click or type into any other window
- the avatar waits for the Codex response from the visible Codex app
- if focus changes away from Codex, the run aborts clearly
- if result capture is partial or uncertain, the UI shows a failure state instead of pretending success

## Clipboard validation

- clipboard contents are restored after submit where possible
- logs note whether clipboard paste was used

## Failure validation

- window not found fails clearly
- input target not found fails clearly
- low-confidence runs are blocked
- focus-change abort is visible in the UI
