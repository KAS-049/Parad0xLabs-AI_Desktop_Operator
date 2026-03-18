# Codex Avatar

Codex Avatar is a Windows desktop shell for voice-first Codex work. This project focuses on a floating desktop avatar that acts as a strict companion to the visible Codex desktop app, opens a small command console on click, submits work into that live Codex window, reads back the result, and writes each completed run into a fast engineering log with supporting artifacts.

## What this repo contains

- Electron + TypeScript desktop shell
- Three.js avatar renderer
- Live Codex desktop companion execution path
- Strict desktop automation adapter with guarded fallback paths
- Local wake helper for Bluetooth device + wake phrase launch
- DOCX engineering log pipeline with per-run JSON recovery artifacts
- FBX support for Meshy-generated characters
- VRM support and fallback image support

## Prerequisites

- Windows
- Node.js 22 or newer
- npm

Optional but useful:

- an OpenAI API key for live transcription, speech, image generation, and OpenAI-backed Codex flows
- a local Codex CLI binary if you want the optional secondary/debug backend session path

## Easy install

1. Clone the repo.
2. Open this folder in a terminal.
3. Run `npm ci`.
4. Copy `.env.example` to `.env` only if you want to set environment overrides.
5. Run `npm run build`.
6. Run `npm run start`.

## Quick launch on Windows

- `Run-Codex-Avatar-Dev.cmd`
  - installs dependencies if they are missing
  - builds the app if `dist/` is missing
  - launches Electron
- `Run-Codex-Avatar.vbs`
  - calls the same bootstrap launcher from a double-clickable Windows script

If the launcher says Node.js is missing, install Node.js 22+ first and run it again.

## First run

- Open settings inside the app.
- Confirm the workspace path, character folder, and journal folder.
- Add or select a character from `characters/`.
- Save an OpenAI API key in the app settings if you want live OpenAI-backed features.
- Keep the real Codex desktop app open and visible when using the primary mode.
- If you want the optional secondary/debug backend session path, confirm the Codex CLI path is valid.

## Common commands

- `npm ci` install pinned dependencies
- `npm run build` build renderer and main process output
- `npm test` run the execution policy tests
- `npm run start` launch the Electron app from the built output
- `npm run package:win` create a Windows package with Electron Builder

## Environment and local state

Supported optional environment variables are documented in `.env.example`:

- `OPENAI_API_KEY`
- `CODEX_AVATAR_APP_ROOT`
- `CODEX_AVATAR_USER_DATA`

Local app state and secrets are not meant to be committed. Repo ignores are set up for:

- `node_modules/`
- `dist/`
- `downloads/`
- `.codex-avatar-data/`
- `.env`

## Security Execution Policy

Codex Avatar now applies a security-first execution policy before any backend Codex run is allowed to execute.

- least-privilege defaults are used for CLI execution
  - read-only requests run with `--sandbox read-only`
  - workspace changes run with `--sandbox workspace-write`
- the unsafe `--dangerously-bypass-approvals-and-sandbox` fallback has been removed
- the allowed workspace is enforced through a workspace allowlist
- protected system roots such as `C:\Windows` and `C:\Program Files` are blocked for write-style actions
- privileged or destructive requests are converted into dry-run, approval-required decisions instead of being executed automatically
- every execution request is logged with:
  - requested action
  - effective policy decision
  - target paths
  - rollback hints

Renderer status now shows one of these policy states during a run:

- safe to run
- requires approval
- blocked by policy

Current policy configuration is stored inside app settings and defaults to the selected workspace root as the only allowed writable scope.

## Migration note

Earlier builds could launch Codex CLI with bypass-style execution defaults. This repo now removes that fallback completely and routes all backend execution through the typed execution policy layer.

If an older setup expected unrestricted execution, those requests may now:

- stay safe and run inside the workspace sandbox
- switch to dry-run and require explicit approval
- block entirely if they target protected system paths

See [migration-security-execution-policy.md](./docs/migration-security-execution-policy.md) for the short migration summary.

## Live Desktop Codex Primary

Codex Avatar now treats the visible Codex desktop app as the intended primary execution mode.

- `desktop-primary` is the default and preferred execution mode
- direct backend Codex paths are preserved only as optional secondary/debug modes
- desktop automation is centralized in one strict adapter
- the adapter refuses to act when window detection, input detection, focus validation, or confidence checks are not strong enough

See [live-desktop-codex-primary.md](./docs/live-desktop-codex-primary.md) for the short architecture note, [migration-live-desktop-codex-primary.md](./docs/migration-live-desktop-codex-primary.md) for the migration summary, and [windows-desktop-validation-checklist.md](./docs/windows-desktop-validation-checklist.md) for the manual validation checklist.

## Character support

- Meshy models can be loaded directly as `.fbx` files.
- The app can also load `.vrm` avatars.
- Image files remain available as fallback characters.
- Per-model display tuning is handled through `characters/display-metadata.json`.

## Project structure

- `src/` application source
- `characters/` local avatar assets
- `automation/` local desktop helper scripts
- `docs/` architecture and release notes
- `package.json` runtime scripts and dependencies
- `package-lock.json` pinned dependency versions

## CI and packaging

This repo includes a GitHub Actions Windows workflow that:

- runs `npm ci`
- runs `npm run build`
- optionally packages a Windows build artifact on manual dispatch

For manual release prep, use [release-checklist.md](./docs/release-checklist.md).
