# Codex Avatar Architecture

```mermaid
flowchart LR
  U["Kas"] --> R["Renderer UI + Avatar (Three.js + VRM)"]
  R --> P["Typed IPC via preload"]
  P --> M["Electron Main Process"]
  M --> B["Local Node Backend Child"]
  B --> D["Strict Desktop Automation Adapter"]
  D --> C["Visible Codex Desktop Window"]
  B -. optional debug .-> X["Direct Backend Codex Session (CLI or API)"]
  B --> T["Transcription + Speech"]
  B --> J["DOCX Engineering Log + JSON Artifacts"]
  W["Wake Helper (Bluetooth + local phrase)"] --> M
  C --> B
  X --> B
  T --> R
```

## Notes

- The avatar is the primary front end.
- The visible Codex desktop app is the intended primary execution surface.
- Desktop automation is centralized into one strict adapter/service.
- Direct backend Codex execution is secondary/debug only.
- The wake helper is a separate local process, not part of the renderer loop.
- The same run result object drives speech, the DOCX engineering log, and the local diagram artifact.
