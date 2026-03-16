# Codex Avatar

Codex Avatar is a Windows desktop shell for voice-first Codex work. The current workspace is focused on a floating desktop avatar that opens a small command console on click, routes work through a local backend, and writes each completed run into a PDF journal with supporting artifacts.

## What is included

- Electron + TypeScript desktop shell
- Three.js avatar renderer
- Backend-owned Codex execution path
- Local wake helper for Bluetooth device + wake phrase launch
- PDF journal pipeline with per-run JSON recovery artifacts
- FBX model support for Meshy-generated characters
- VRM support and fallback image support

## Easy install

1. Install Node.js 22 or newer.
2. Open this folder in a terminal.
3. Run `npm install`.
4. Run `npm run build`.
5. Run `npm run start`.

## Project structure

- `src/` application source
- `characters/` local avatar assets
- `automation/` local desktop helper scripts
- `package.json` runtime scripts and dependencies
- `package-lock.json` pinned dependency versions for repeatable install

## Notes

- Meshy models can be loaded directly as `.fbx` files.
- The app can also load `.vrm` avatars and fallback image characters.
- Live transcription, speech, image generation, and OpenAI-backed Codex flows require a valid OpenAI API key in local settings.
- Local Codex execution can use the vendored `codex.exe` path or another local Codex CLI binary.

## Packaging

Run `npm run package:win` to build a Windows package with Electron Builder.
