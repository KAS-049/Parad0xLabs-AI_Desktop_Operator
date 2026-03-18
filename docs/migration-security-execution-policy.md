# Migration Note: Security Execution Policy

This branch removes the old unsafe Codex CLI bypass default and replaces it with a typed execution policy layer.

## What changed

- removed `--dangerously-bypass-approvals-and-sandbox`
- added policy-aware risk classification
- added workspace allowlist enforcement
- added dry-run handling for risky requests
- added explicit approval-required decisions for destructive requests
- added backend audit logging for requested actions, target paths, policy decisions, and rollback hints
- added renderer-visible policy status updates

## Impact

- normal read-only or workspace-write requests continue to work with safer defaults
- destructive or privileged requests no longer run automatically
- protected system path writes are blocked
- requests outside the allowed workspace no longer run silently

## Follow-up

If you need to support explicit approvals in the UI later, extend the run payload to send a deliberate approval grant for a single request instead of widening the default policy.
