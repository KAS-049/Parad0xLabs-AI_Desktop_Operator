import test from "node:test";
import assert from "node:assert/strict";

import { evaluateExecutionPolicy } from "../dist/backend/executionPolicy.js";

const baseConfig = {
  allowedWorkspaceRoots: ["C:\\Users\\Satoshi\\Desktop\\Milestone 1 - Codex Avatar FBX Test"],
  enforceWorkspaceAllowlist: true,
  protectedSystemRoots: ["C:\\Windows", "C:\\Program Files", "C:\\Program Files (x86)", "C:\\ProgramData"],
  defaultReadOnlySandbox: "read-only",
  defaultWriteSandbox: "workspace-write",
  approvalPolicy: "never",
  dryRunForRiskLevels: ["privileged-destructive"],
  approvalRequiredForRiskLevels: ["privileged-destructive"]
};

test("blocks writes to protected system paths", () => {
  const decision = evaluateExecutionPolicy({
    actionKind: "codex-cli-session",
    userRequest: "Write to C:\\Windows\\System32\\drivers\\etc\\hosts",
    workspacePath: "C:\\Users\\Satoshi\\Desktop\\Milestone 1 - Codex Avatar FBX Test",
    config: baseConfig,
    approval: { granted: false }
  });

  assert.equal(decision.status, "blocked-by-policy");
  assert.equal(decision.riskLevel, "privileged-destructive");
});

test("allows reversible workspace writes", () => {
  const decision = evaluateExecutionPolicy({
    actionKind: "codex-cli-session",
    userRequest: "Update C:\\Users\\Satoshi\\Desktop\\Milestone 1 - Codex Avatar FBX Test\\codex-avatar\\README.md with a note",
    workspacePath: "C:\\Users\\Satoshi\\Desktop\\Milestone 1 - Codex Avatar FBX Test",
    config: baseConfig,
    approval: { granted: false }
  });

  assert.equal(decision.status, "safe-to-run");
  assert.equal(decision.sandboxMode, "workspace-write");
  assert.equal(decision.workspaceAllowed, true);
});

test("marks risky requests as dry-run when not approved", () => {
  const decision = evaluateExecutionPolicy({
    actionKind: "codex-cli-session",
    userRequest: "Delete the build output under C:\\Users\\Satoshi\\Desktop\\Milestone 1 - Codex Avatar FBX Test\\codex-avatar\\dist",
    workspacePath: "C:\\Users\\Satoshi\\Desktop\\Milestone 1 - Codex Avatar FBX Test",
    config: baseConfig,
    approval: { granted: false }
  });

  assert.equal(decision.status, "requires-approval");
  assert.equal(decision.dryRun, true);
  assert.equal(decision.requiresApproval, true);
});

test("keeps privileged actions approval-gated even inside the workspace", () => {
  const decision = evaluateExecutionPolicy({
    actionKind: "codex-cli-session",
    userRequest: "Reset the repository hard in C:\\Users\\Satoshi\\Desktop\\Milestone 1 - Codex Avatar FBX Test",
    workspacePath: "C:\\Users\\Satoshi\\Desktop\\Milestone 1 - Codex Avatar FBX Test",
    config: baseConfig,
    approval: { granted: false }
  });

  assert.equal(decision.status, "requires-approval");
  assert.equal(decision.riskLevel, "privileged-destructive");
  assert.equal(decision.workspaceAllowed, true);
});
