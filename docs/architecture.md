# Codex Avatar Architecture

```mermaid
flowchart LR
  U["Kas"] --> R["Renderer UI + Avatar (Three.js + VRM)"]
  R --> P["Typed IPC via preload"]
  P --> M["Electron Main Process"]
  M --> B["Local Node Backend Child"]
  B --> C["Backend-owned Codex Session (CLI or API)"]
  B --> T["Transcription + Speech"]
  B --> J["PDF Journal + JSON Artifacts"]
  B --> G["Image Generation"]
  B -. optional .-> F["Desktop automation fallback"]
  W["Wake Helper (Bluetooth + local phrase)"] --> M
  C --> B
  T --> R
  G --> J
```

## Notes

- The avatar is the primary front end.
- The visible Codex desktop app is optional review/debugging only.
- The wake helper is a separate local process, not part of the renderer loop.
- The same run result object drives speech, the PDF journal, and the generated image.
