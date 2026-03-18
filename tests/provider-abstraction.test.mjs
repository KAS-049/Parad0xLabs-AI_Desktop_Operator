import test from "node:test";
import assert from "node:assert/strict";

import { getProviderFlowLabel, normalizeProviderResult, resolveProviderKind } from "../dist/backend/providers.js";

test("desktop Codex stays primary when selected", () => {
  assert.equal(
    resolveProviderKind({ codexProvider: "desktop-codex", executionMode: "desktop-primary" }),
    "desktop-codex-primary"
  );
  assert.equal(
    resolveProviderKind({ codexProvider: "codex-cli", executionMode: "direct-backend-debug" }),
    "direct-backend-debug"
  );
});

test("direct backend debug mode is only used when explicitly selected", () => {
  assert.equal(
    resolveProviderKind({ codexProvider: "openai-codex", executionMode: "direct-backend-debug" }),
    "direct-backend-debug"
  );
  assert.equal(getProviderFlowLabel("desktop-codex-primary"), "Live Codex desktop app");
});

test("normalized provider results share the same output contract", () => {
  const normalized = normalizeProviderResult(
    {
      providerKind: "desktop-codex-primary",
      rawCodexOutput: "raw",
      submittedPrompt: "prompt"
    },
    {
      plainEnglishSummary: "plain",
      technicalSummary: "tech",
      whatCodexDid: "did",
      problemOccurred: "problem",
      howItWasFixed: "fixed",
      blockers: "none",
      rememberNextTime: "remember",
      nextSteps: "next",
      filesChanged: ["a.ts"],
      commandsRun: ["npm test"],
      fixDiagramSpec: "diagram",
      fixDiagramSource: "mermaid"
    }
  );

  assert.deepEqual(normalized, {
    providerKind: "desktop-codex-primary",
    rawCodexOutput: "raw",
    submittedPrompt: "prompt",
    plainEnglishSummary: "plain",
    technicalSummary: "tech",
    whatCodexDid: "did",
    problemOccurred: "problem",
    howItWasFixed: "fixed",
    blockers: "none",
    rememberNextTime: "remember",
    nextSteps: "next",
    filesChanged: ["a.ts"],
    commandsRun: ["npm test"],
    fixDiagramSpec: "diagram",
    fixDiagramSource: "mermaid"
  });
});
