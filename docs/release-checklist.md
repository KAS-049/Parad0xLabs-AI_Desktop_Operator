# Release Checklist

## Before pushing a release

- Confirm the project installs with `npm ci`.
- Confirm the project builds with `npm run build`.
- Confirm the desktop app opens with `npm run start`.
- Confirm the selected avatar still renders and opens the command console.
- Confirm the microphone flow still reaches the intended Codex path.
- Confirm no local secrets or state folders are tracked:
  - `.codex-avatar-data/`
  - `.env`
  - local journal output

## Windows packaging

- Run `npm run package:win`.
- Verify Electron Builder completes successfully.
- Verify the packaged app launches on Windows.
- Verify the packaged app can still load characters from `characters/`.

## Repo hygiene

- `README.md` matches the current setup flow.
- `.env.example` reflects the supported environment variables.
- `package-lock.json` is committed with dependency changes.
- Generated folders like `node_modules/` and `dist/` are not committed.
