# Codex Avatar

Codex Avatar is a Windows desktop shell for voice-first Codex work. This project focuses on a floating desktop avatar that opens a small command console on click, routes work through a local backend, and writes each completed run into a PDF journal with supporting artifacts.

## What this repo contains

- Electron + TypeScript desktop shell
- Three.js avatar renderer
- Backend-owned Codex execution path
- Local wake helper for Bluetooth device + wake phrase launch
- PDF journal pipeline with per-run JSON recovery artifacts
- FBX support for Meshy-generated characters
- VRM support and fallback image support

## Prerequisites

- Windows
- Node.js 22 or newer
- npm

Optional but useful:

- an OpenAI API key for live transcription, speech, image generation, and OpenAI-backed Codex flows
- a local Codex CLI binary if you want local Codex execution instead of API-backed paths

## Easy install

1. Clone the repo.
2. Open this folder in a terminal.
3. Run `npm ci`.
4. Copy `.env.example` to `.env` only if you want to set environment overrides.
5. Run `npm run build`.
6. Run `npm run start`.

## First run

- Open settings inside the app.
- Confirm the workspace path, character folder, and journal folder.
- Add or select a character from `characters/`.
- Save an OpenAI API key in the app settings if you want live OpenAI-backed features.
- If you want local Codex execution, confirm the Codex CLI path is valid.

## Common commands

- `npm ci` install pinned dependencies
- `npm run build` build renderer and main process output
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
